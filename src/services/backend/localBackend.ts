/**
 * LocalBackend — Supabase 없이 동작하는 체험/개발용 백엔드.
 * - 데이터: localStorage (모든 탭이 하나의 "서버" 를 공유)
 * - 동시성: navigator.locks 로 탭 간 상호 배제 (DB 행 잠금과 같은 역할)
 * - 실시간: BroadcastChannel (같은 브라우저의 여러 탭끼리 멀티플레이)
 * - 로그인 세션: 탭마다 sessionStorage → 탭별로 다른 계정으로 접속 가능
 */
import type { Appearance } from '@/config/appearance';
import type { SpaceKey } from '@/config/game';
import type { AuthUser, ChatMessage, EmotePacket, MovePacket, PlayerSettings, PresenceInfo } from '@/types';
import { emptyDB, LocalServer, type LocalDB } from './localServer';
import {
  GameError, type AuthEvent, type GameBackend, type OnlineConnection, type OnlineHandlers,
  type SpaceConnection, type SpaceHandlers,
} from './types';

const DB_KEY = 'haetsal-local-db-v1';
const SESSION_KEY = 'haetsal-local-session';

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`haetsal:${text}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Bus = { type: string; from: string; data: unknown };

export class LocalBackend implements GameBackend {
  readonly kind = 'local' as const;
  private listeners = new Set<(e: AuthEvent, u: AuthUser | null) => void>();
  private localSpaces = new Set<{ space: SpaceKey; handlers: SpaceHandlers }>();
  private tabId = Math.random().toString(36).slice(2);

  // ── DB 트랜잭션 ─────────────────────────────────────
  private read(): LocalDB {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw) as LocalDB;
    } catch { /* 손상된 데이터 → 새로 시작 */ }
    return emptyDB();
  }
  private async tx<T>(fn: (s: LocalServer) => T, write = true): Promise<T> {
    const run = async () => {
      const db = this.read();
      const result = fn(new LocalServer(db));
      if (write) localStorage.setItem(DB_KEY, JSON.stringify(db));
      return result;
    };
    await wait(40 + Math.random() * 60); // 실제 네트워크처럼 약간의 지연
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('haetsal-local-db', run) as Promise<T>;
    }
    return run();
  }

  private session(): AuthUser | null {
    const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AuthUser; } catch { return null; }
  }
  private uid(): string {
    const u = this.session();
    if (!u) throw new GameError('NOT_AUTHENTICATED');
    return u.id;
  }
  private emit(e: AuthEvent, u: AuthUser | null) { this.listeners.forEach((l) => l(e, u)); }

  // ── 인증 ───────────────────────────────────────────
  async getUser() {
    const u = this.session();
    if (!u) return null;
    const exists = this.read().accounts.some((a) => a.id === u.id);
    return exists ? u : null;
  }
  async signUp(email: string, password: string) {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new GameError('INVALID_EMAIL');
    if (password.length < 6) throw new GameError('WEAK_PASSWORD');
    const hash = await sha256(password);
    await this.tx((s) => {
      if (s.db.accounts.some((a) => a.email === e)) throw new GameError('EMAIL_TAKEN');
      s.db.accounts.push({ id: crypto.randomUUID(), email: e, password: hash, confirmed: true, createdAt: Date.now() });
    });
    await this.signIn(e, password);
    return { needsConfirmation: false };
  }
  async signIn(email: string, password: string) {
    const e = email.trim().toLowerCase();
    const hash = await sha256(password);
    const acc = await this.tx((s) => s.db.accounts.find((a) => a.email === e && a.password === hash), false);
    if (!acc) throw new GameError('INVALID_CREDENTIALS');
    const user = { id: acc.id, email: acc.email };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    this.emit('SIGNED_IN', user);
    return user;
  }
  async signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.emit('SIGNED_OUT', null);
  }
  async requestPasswordReset(email: string) {
    // 체험 모드에서는 메일을 보낼 수 없으므로 즉시 재설정 화면으로 전환합니다.
    const e = email.trim().toLowerCase();
    const acc = await this.tx((s) => s.db.accounts.find((a) => a.email === e), false);
    if (!acc) return;
    sessionStorage.setItem('haetsal-local-recovery', acc.id);
    this.emit('PASSWORD_RECOVERY', { id: acc.id, email: acc.email });
  }
  async updatePassword(newPassword: string) {
    if (newPassword.length < 6) throw new GameError('WEAK_PASSWORD');
    const id = sessionStorage.getItem('haetsal-local-recovery') ?? this.session()?.id;
    if (!id) throw new GameError('NOT_AUTHENTICATED');
    const hash = await sha256(newPassword);
    await this.tx((s) => {
      const a = s.db.accounts.find((x) => x.id === id);
      if (a) a.password = hash;
    });
    sessionStorage.removeItem('haetsal-local-recovery');
  }
  onAuthChange(cb: (e: AuthEvent, u: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  // ── 플레이어 ───────────────────────────────────────
  claimSlot() { const u = this.session(); return this.tx((s) => s.claimSlot(this.uid(), u?.email ?? '')); }
  getMaxPlayers() { return this.tx((s) => s.db.settings.maxPlayers, false); }
  getMyCharacter() { return this.tx((s) => s.getCharacter(this.uid()), false); }
  saveCharacter(n: string, a: Appearance) { return this.tx((s) => s.saveCharacter(this.uid(), n, a)); }
  loadState() { return this.tx((s) => s.loadState(this.uid()), false); }
  startSession() { return this.tx((s) => s.startSession(this.uid())); }
  enterSpace(space: SpaceKey) { return this.tx((s) => s.enterSpace(this.uid(), space)); }
  updateTutorial(step: number) { return this.tx((s) => s.updateTutorial(this.uid(), step)); }
  updateSettings(st: PlayerSettings) { return this.tx((s) => s.updateSettings(this.uid(), st)); }

  // ── 경제 ───────────────────────────────────────────
  getFarm(ownerId: string) { return this.tx((s) => s.getFarm(this.uid(), ownerId), false); }
  listResidents() { return this.tx((s) => s.listResidents(this.uid()), false); }
  buySeed(c: string, q: number, r: string) { return this.tx((s) => s.buySeed(this.uid(), c, q, r)); }
  plant(x: number, y: number, c: string, r: string) { return this.tx((s) => s.plant(this.uid(), x, y, c, r)); }
  harvest(x: number, y: number, r: string) { return this.tx((s) => s.harvest(this.uid(), x, y, r)); }
  sell(c: string, q: number, r: string) { return this.tx((s) => s.sell(this.uid(), c, q, r)); }
  sellAll(r: string) { return this.tx((s) => s.sellAll(this.uid(), r)); }
  expandFarm(l: number, r: string) { return this.tx((s) => s.expandFarm(this.uid(), l, r)); }
  getQuests() { return this.tx((s) => s.getQuests(this.uid()), false); }
  claimQuest(q: string, r: string) { return this.tx((s) => s.claimQuest(this.uid(), q, r)); }
  getStorage(owner: string) { return this.tx((s) => s.getStorage(this.uid(), owner), false); }
  depositStorage(i: string, q: number, r: string) { return this.tx((s) => s.depositStorage(this.uid(), i, q, r)); }
  withdrawStorage(i: string, q: number, r: string) { return this.tx((s) => s.withdrawStorage(this.uid(), i, q, r)); }
  listBoardPosts() { return this.tx((s) => s.listBoardPosts(this.uid()), false); }
  createBoardPost(body: string) { return this.tx((s) => s.createBoardPost(this.uid(), body)); }
  deleteBoardPost(id: string) { return this.tx((s) => s.deleteBoardPost(this.uid(), id)); }
  listGuestbook(owner: string) { return this.tx((s) => s.listGuestbook(this.uid(), owner), false); }
  writeGuestbook(owner: string, body: string) { return this.tx((s) => s.writeGuestbook(this.uid(), owner, body)); }
  deleteGuestbookEntry(id: string) { return this.tx((s) => s.deleteGuestbookEntry(this.uid(), id)); }
  fruitStatus() { return this.tx((s) => s.fruitStatus(this.uid()), false); }
  pickFruit(treeId: string, r: string) { return this.tx((s) => s.pickFruit(this.uid(), treeId, r)); }
  waterStatus() { return this.tx((s) => s.waterStatus(this.uid()), false); }
  waterCrop(owner: string, x: number, y: number, r: string) { return this.tx((s) => s.waterCrop(this.uid(), owner, x, y, r)); }
  makeWish() { return this.tx((s) => s.makeWish(this.uid())); }
  listNotices(afterId: number) { return this.tx((s) => s.listNotices(this.uid(), afterId), false); }
  buyItem(i: string, color: number, q: number, r: string) { return this.tx((s) => s.buyItem(this.uid(), i, color, q, r)); }
  sellItem(i: string, q: number, r: string) { return this.tx((s) => s.sellItem(this.uid(), i, q, r)); }
  fishCast() { return this.tx((s) => s.fishCast(this.uid())); }
  fishReel(r: string) { return this.tx((s) => s.fishReel(this.uid(), r)); }
  rodStatus() { return this.tx((s) => s.rodStatus(this.uid()), false); }
  useFertilizer(x: number, y: number, i: string, r: string) { return this.tx((s) => s.useFertilizer(this.uid(), x, y, i, r)); }
  getHouse(owner: string) { return this.tx((s) => s.getHouse(this.uid(), owner)); }
  expandHouse(l: number, r: string) { return this.tx((s) => s.expandHouse(this.uid(), l, r)); }
  placeFurniture(f: string, color: number, x: number, y: number, r: string) { return this.tx((s) => s.placeFurniture(this.uid(), f, color, x, y, r)); }
  moveFurniture(id: number, x: number, y: number) { return this.tx((s) => s.moveFurniture(this.uid(), id, x, y)); }
  storeFurniture(id: number) { return this.tx((s) => s.storeFurniture(this.uid(), id)); }
  beggarStatus() { return this.tx((s) => s.beggarStatus(this.uid()), false); }
  async beggarRob(id: number, r: string) {
    const { res, msg } = await this.tx((s) => ({ res: s.beggarRob(this.uid(), id, r), msg: s.lastRobMsg }));
    if (msg) this.deliverChat('village', msg); // 뜯긴 사람 말풍선 → 주위 주민도 봄
    return res;
  }
  casinoState() { return this.tx((s) => s.casinoState(this.uid())); }
  async casinoJoin(stake: number, r: string) {
    const { st, msg } = await this.tx((s) => ({ st: s.casinoJoin(this.uid(), stake, r), msg: s.lastRecruit }));
    if (msg) this.deliverChat('village', msg); // 판을 열면 마을에 모집 글
    return st;
  }
  casinoLeave(r: string) { return this.tx((s) => s.casinoLeave(this.uid(), r)); }
  casinoReady(ready: boolean) { return this.tx((s) => s.casinoReady(this.uid(), ready)); }

  // ── 소셜 ───────────────────────────────────────────
  async sendChat(space: SpaceKey, body: string) {
    const msg = await this.tx((s) => s.sendChat(this.uid(), space, body));
    this.deliverChat(space, msg);
  }
  /** 채팅을 다른 탭과 이 탭에 전달 */
  private deliverChat(space: SpaceKey, msg: ChatMessage) {
    const ch = new BroadcastChannel(`haetsal:space:${space}`);
    ch.postMessage({ type: 'chat', from: this.tabId, data: msg } satisfies Bus);
    ch.close();
    this.localSpaces.forEach((l) => { if (l.space === space) l.handlers.onChat(msg); });
  }
  reportPlayer(t: string, reason: string, detail: string) { return this.tx((s) => s.report(this.uid(), t, reason, detail)); }
  setBlocked(t: string, b: boolean) { return this.tx((s) => s.setBlocked(this.uid(), t, b)); }
  listBlocked() { return this.tx((s) => s.listBlocked(this.uid()), false); }

  // ── 실시간 (BroadcastChannel) ──────────────────────
  joinSpace(space: SpaceKey, me: PresenceInfo, handlers: SpaceHandlers): SpaceConnection {
    const ch = new BroadcastChannel(`haetsal:space:${space}`);
    const peers = new Map<string, { info: PresenceInfo; seen: number }>();
    let mine = { ...me };
    const entry = { space, handlers };
    this.localSpaces.add(entry);
    const post = (type: string, data: unknown) => ch.postMessage({ type, from: this.tabId, data } satisfies Bus);
    const publish = () => handlers.onPresence([mine, ...[...peers.values()].map((p) => p.info)]);

    ch.onmessage = (ev: MessageEvent<Bus>) => {
      const m = ev.data;
      if (m.from === this.tabId) return;
      switch (m.type) {
        case 'hello':
        case 'presence': {
          if (m.type === 'hello') post('presence', mine); // 새로 들어온 탭에게 내 위치 알려주기
          const info = m.data as PresenceInfo;
          peers.set(info.sessionId, { info, seen: Date.now() });
          publish();
          break;
        }
        case 'leave': peers.delete(m.data as string); publish(); break;
        case 'move': handlers.onMove(m.data as MovePacket); break;
        case 'emote': handlers.onEmote(m.data as EmotePacket); break;
        case 'chat': handlers.onChat(m.data as ChatMessage); break;
        case 'farm': handlers.onFarmChanged(); break;
        case 'bye': handlers.onBye((m.data as { id: string }).id); break;
        case 'casino': handlers.onCasino(); break;
      }
    };
    handlers.onStatus('connecting');
    setTimeout(() => { handlers.onStatus('connected'); post('hello', mine); publish(); }, 50);
    const hb = setInterval(() => {
      post('presence', mine);
      const now = Date.now();
      let changed = false;
      peers.forEach((p, k) => { if (now - p.seen > 7000) { peers.delete(k); changed = true; } });
      if (changed) publish();
    }, 2000);
    const onUnload = () => post('leave', mine.sessionId);
    window.addEventListener('beforeunload', onUnload);

    return {
      sendMove: (p) => { mine = { ...mine, x: p.x, y: p.y, dir: p.dir }; post('move', p); },
      sendEmote: (e) => post('emote', e),
      notifyFarmChanged: () => post('farm', null),
      updatePresence: (p) => { mine = { ...mine, ...p }; },
      sayBye: () => post('bye', { id: mine.id }),
      notifyCasino: () => post('casino', null),
      leave: async (silent?: boolean) => {
        clearInterval(hb);
        window.removeEventListener('beforeunload', onUnload);
        if (!silent) post('bye', { id: mine.id });
        post('leave', mine.sessionId);
        this.localSpaces.delete(entry);
        ch.close();
      },
    };
  }

  joinOnline(me: PresenceInfo, handlers: OnlineHandlers): OnlineConnection {
    const ch = new BroadcastChannel('haetsal:online');
    const peers = new Map<string, { info: PresenceInfo; seen: number }>();
    let mine = { ...me };
    const post = (type: string, data: unknown) => ch.postMessage({ type, from: this.tabId, data } satisfies Bus);
    const publish = () => handlers.onOnline([mine, ...[...peers.values()].map((p) => p.info)]);
    ch.onmessage = (ev: MessageEvent<Bus>) => {
      const m = ev.data;
      if (m.from === this.tabId) return;
      if (m.type === 'notice') { handlers.onNotice((m.data as { to: string }).to); return; }
      if (m.type === 'hello') post('presence', mine);
      if (m.type === 'presence' || m.type === 'hello') {
        const info = m.data as PresenceInfo;
        peers.set(info.sessionId, { info, seen: Date.now() });
        publish();
      } else if (m.type === 'leave') {
        peers.delete(m.data as string);
        publish();
      }
    };
    post('hello', mine);
    publish();
    const hb = setInterval(() => {
      post('presence', mine);
      const now = Date.now();
      peers.forEach((p, k) => { if (now - p.seen > 7000) peers.delete(k); });
      publish();
    }, 2500);
    const onUnload = () => post('leave', mine.sessionId);
    window.addEventListener('beforeunload', onUnload);
    return {
      update: (p) => { mine = { ...mine, ...p }; post('presence', mine); publish(); },
      pingNotice: (to) => post('notice', { to }),
      leave: async () => {
        clearInterval(hb);
        window.removeEventListener('beforeunload', onUnload);
        post('leave', mine.sessionId);
        ch.close();
      },
    };
  }
}
