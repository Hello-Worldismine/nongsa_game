/**
 * 실시간 세션: 전체 접속자(online) + 현재 공간(space) 채널을 관리합니다.
 *  - 이동: Broadcast (약 7Hz), 수신 측 보간
 *  - 접속자/위치 스냅샷: Presence
 *  - 채팅: 서버 검증 후 DB 저장 → 실시간 전달
 *  - 공간이 바뀌면 이전 채널을 정리하고 새 채널에 참가
 */
import { play } from '@/audio/sfx';
import { farmOwnerOf, houseOwnerOf, type SpaceKey } from '@/config/game';
import { bus } from '@/game/bus';
import { backend } from '@/services/backend';
import type { OnlineConnection, SpaceConnection } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { ChatMessage, PresenceInfo } from '@/types';

class GameSession {
  readonly sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private joinedAt = Date.now();
  private online: OnlineConnection | null = null;
  private space: SpaceConnection | null = null;
  private spaceKey: SpaceKey | null = null;
  private unsubs: (() => void)[] = [];
  private last = { x: 0, y: 0, dir: 'down' as PresenceInfo['dir'] };
  private hiddenAt = 0;
  private farmRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  private me(space: SpaceKey): PresenceInfo {
    const p = useGame.getState().profile!;
    return {
      id: p.id, nickname: p.nickname, appearance: p.appearance, x: this.last.x, y: this.last.y, dir: this.last.dir,
      sessionId: this.sessionId, joinedAt: this.joinedAt, space,
    };
  }

  start(space: SpaceKey) {
    this.stop();
    this.joinedAt = Date.now();
    this.online = backend().joinOnline(this.me(space), {
      onOnline: (list) => this.onOnline(list),
      onNotice: (to) => { if (to === useGame.getState().profile?.id) void this.fetchNotices(); },
    });
    // 개인 알림: 접속 시점 이후 것만 표시, 신호를 놓쳐도 6초마다 확인
    this.noticeLastId = null;
    void this.fetchNotices();
    const noticeTimer = setInterval(() => { if (!document.hidden) void this.fetchNotices(); }, 6000);
    this.unsubs.push(() => clearInterval(noticeTimer));
    this.joinSpace(space);
    this.unsubs.push(
      bus.on('local:move', (p) => {
        this.last = { x: p.x, y: p.y, dir: p.dir };
        // 같은 공간에 다른 사람이 있을 때만 이동을 방송 (혼자일 땐 실시간 메시지 절약)
        if (useGame.getState().peers.length > 0) this.space?.sendMove(p);
      }),
      bus.on('local:emote', (kind) => {
        const id = useGame.getState().profile?.id;
        if (id) this.space?.sendEmote({ id, kind });
      }),
    );
    const onVis = () => {
      if (document.hidden) { this.hiddenAt = Date.now(); return; }
      // 오래 비활성화됐다가 돌아오면 농장 상태를 새로 고침
      if (this.hiddenAt && Date.now() - this.hiddenAt > 20000) this.refreshFarm();
      this.hiddenAt = 0;
    };
    const onOnlineNet = () => {
      useGame.getState().toast('네트워크가 다시 연결됐어요!', 'success');
      if (this.spaceKey) this.joinSpace(this.spaceKey);
      this.refreshFarm();
    };
    const onOffline = () => useGame.getState().set({ conn: 'reconnecting' });
    const onPageHide = () => this.space?.sayBye(); // 창을 닫으면 바로 작별 신호
    window.addEventListener('pagehide', onPageHide);
    this.unsubs.push(() => window.removeEventListener('pagehide', onPageHide));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnlineNet);
    window.addEventListener('offline', onOffline);
    this.unsubs.push(
      () => document.removeEventListener('visibilitychange', onVis),
      () => window.removeEventListener('online', onOnlineNet),
      () => window.removeEventListener('offline', onOffline),
    );
  }

  /** 공간 채널 교체 (기존 채널은 반드시 정리) */
  joinSpace(space: SpaceKey) {
    const old = this.space;
    const sameSpace = this.spaceKey === space;
    this.space = null;
    if (old) void old.leave(sameSpace); // 같은 공간 재연결이면 작별 신호 없이 (깜빡임 방지)
    this.spaceKey = space;
    useGame.getState().set({ peers: [] });
    bus.emit('remote:peers', []);
    this.space = backend().joinSpace(space, this.me(space), {
      onMove: (p) => bus.emit('remote:move', p),
      onPresence: (list) => {
        const myId = useGame.getState().profile?.id;
        // 같은 사람이 여러 탭이면 가장 최근 접속만 표시
        const byId = new Map<string, PresenceInfo>();
        for (const p of list) {
          if (p.id === myId || p.space !== space) continue;
          const prev = byId.get(p.id);
          if (!prev || p.joinedAt > prev.joinedAt) byId.set(p.id, p);
        }
        const peers = [...byId.values()];
        const before = new Set(useGame.getState().peers.map((p) => p.id));
        useGame.getState().set({ peers });
        bus.emit('remote:peers', peers);
        // 새로 들어온 사람에게 내 현재 위치를 알려 줌 (접속 정보를 자주 갱신하지 않는 대신)
        if (peers.some((p) => !before.has(p.id))) bus.emit('net:announce');
      },
      onChat: (m) => this.onChat(m),
      onEmote: (e) => bus.emit('remote:emote', e),
      onFarmChanged: () => this.scheduleFarmRefresh(),
      onStatus: (conn) => useGame.getState().set({ conn }),
      onBye: (id) => {
        const st = useGame.getState();
        if (id === st.profile?.id) return;
        st.set({ peers: st.peers.filter((p) => p.id !== id) });
        bus.emit('remote:bye', id);
      },
      onCasino: () => bus.emit('casino:changed'),
    });
    this.online?.update({ space });
  }

  private onOnline(list: PresenceInfo[]) {
    const st = useGame.getState();
    const myId = st.profile?.id;
    // 중복 로그인 처리: 같은 계정이 더 늦게 접속한 탭이 있으면 이 탭은 물러남
    const newer = list.find((p) => p.id === myId && p.sessionId !== this.sessionId && p.joinedAt > this.joinedAt);
    if (newer && st.phase === 'playing') {
      this.stop();
      st.set({ phase: 'kicked' });
      return;
    }
    const byId = new Map<string, PresenceInfo>();
    for (const p of list) {
      const prev = byId.get(p.id);
      if (!prev || p.joinedAt > prev.joinedAt) byId.set(p.id, p);
    }
    st.set({ online: [...byId.values()] });
  }

  private onChat(m: ChatMessage) {
    const st = useGame.getState();
    if (st.blocked.includes(m.senderId)) return;
    if (m.space !== this.spaceKey) return; // 다른 공간의 채팅은 무시
    st.addChat(m);
    bus.emit('bubble', { id: m.senderId, text: m.body });
    if (m.senderId !== st.profile?.id) play('chat');
  }

  notifyFarmChanged() { this.space?.notifyFarmChanged(); }
  notifyCasino() { this.space?.notifyCasino(); }
  /** 받는 사람에게 "새 알림" 신호 (예: 물을 준 뒤 농장 주인에게) */
  pingNotice(to: string) { this.online?.pingNotice(to); }

  private noticeLastId: number | null = null;
  private noticeBusy = false;
  private async fetchNotices() {
    if (this.noticeBusy) return;
    this.noticeBusy = true;
    try {
      const after = this.noticeLastId ?? 0;
      const list = await backend().listNotices(after);
      if (this.noticeLastId === null) { // 처음: 기준점만 잡음 (예전 알림은 다시 띄우지 않음)
        this.noticeLastId = list.length ? list[list.length - 1].id : 0;
        return;
      }
      for (const n of list) {
        this.noticeLastId = Math.max(this.noticeLastId, n.id);
        const st = useGame.getState();
        st.addChat({ id: `notice-${n.id}`, senderId: 'system', nickname: '알림', body: n.body, space: st.space, createdAt: n.createdAt, system: true });
        st.toast(`📢 ${n.body}`, 'success');
        play('chat');
      }
    } catch { /* 다음 확인 때 */ } finally { this.noticeBusy = false; }
  }

  private scheduleFarmRefresh() {
    if (this.farmRefreshTimer) return;
    this.farmRefreshTimer = setTimeout(() => { this.farmRefreshTimer = null; this.refreshFarm(); }, 250);
  }

  async refreshFarm() {
    const st = useGame.getState();
    const hOwner = houseOwnerOf(st.space);
    if (hOwner) { // 집 안: 가구가 바뀌었거나 집이 넓어짐
      try {
        const h = await backend().getHouse(hOwner);
        const cur = useGame.getState();
        if (houseOwnerOf(cur.space) !== hOwner) return;
        const resized = cur.viewHouse && (cur.viewHouse.w !== h.w || cur.viewHouse.h !== h.h);
        cur.set({ viewHouse: h, ...(resized ? { sceneNonce: cur.sceneNonce + 1 } : {}) });
        if (!resized) bus.emit('house:update', h);
      } catch { /* 다음 기회에 */ }
      return;
    }
    const owner = farmOwnerOf(st.space);
    if (!owner) return;
    try {
      const r = await backend().getFarm(owner);
      useGame.getState().set({ viewFarm: r.farm, serverOffset: r.serverNow - Date.now(), ...(owner === st.profile?.id ? { myFarm: r.farm } : {}) });
      bus.emit('farm:update', r.farm);
    } catch { /* 다음 기회에 */ }
  }

  updateProfile() {
    const p = useGame.getState().profile;
    if (!p) return;
    this.space?.updatePresence({ nickname: p.nickname, appearance: p.appearance });
    this.online?.update({ nickname: p.nickname, appearance: p.appearance });
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.farmRefreshTimer) clearTimeout(this.farmRefreshTimer);
    void this.space?.leave();
    void this.online?.leave();
    this.space = null;
    this.online = null;
  }
}

export const session = new GameSession();
