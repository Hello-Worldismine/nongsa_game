/**
 * SupabaseBackend — 실제 서버.
 * 모든 경제/농장 변경은 PostgreSQL RPC(SECURITY DEFINER)로만 처리되며,
 * 서버가 auth.uid() 로 호출자를 확인하고 가격·시간을 서버 기준 데이터로 검증합니다.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { sanitizeAppearance, type Appearance } from '@/config/appearance';
import type { SpaceKey } from '@/config/game';
import { getSupabase } from '@/services/supabase/client';
import type {
  AuthUser, BoardPost, CasinoState, HouseState, Notice, WaterResult, EconomyResult, GuestbookEntry, StorageView, EmotePacket, FarmState, MovePacket, PlayerSettings, PlayerState,
  PresenceInfo, QuestProgress, Resident, SlotStatus,
} from '@/types';
import {
  ERROR_MESSAGES, GameError, type AuthEvent, type GameBackend, type OnlineConnection, type OnlineHandlers,
  type SpaceConnection, type SpaceHandlers,
} from './types';

function toGameError(err: { message?: string; code?: string } | null): GameError {
  const msg = err?.message ?? 'UNKNOWN';
  const code = Object.keys(ERROR_MESSAGES).find((c) => msg.includes(c));
  return code ? new GameError(code) : new GameError('UNKNOWN', `앗, 문제가 생겼어요: ${msg}`);
}

const normFarm = (f: FarmState): FarmState => ({ ...f, crops: f.crops ?? [] });
const normHouse = (h: HouseState): HouseState => ({ ...h, items: (h.items ?? []).map((i) => ({ ...i, id: Number(i.id) })) });
const normResult = (r: EconomyResult): EconomyResult => ({ ...r, farm: r.farm ? normFarm(r.farm) : undefined, house: r.house ? normHouse(r.house) : undefined });

export class SupabaseBackend implements GameBackend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient = getSupabase();

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw toGameError(error);
    return data as T;
  }

  // ── 인증 ───────────────────────────────────────────
  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }
  async signUp(email: string, password: string) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw new Error(error.message);
    // 이미 가입된 이메일이면 identities 가 빈 배열로 돌아옴
    if (data.user && data.user.identities && data.user.identities.length === 0) throw new GameError('EMAIL_TAKEN');
    return { needsConfirmation: !data.session };
  }
  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { id: data.user.id, email: data.user.email ?? email };
  }
  async signOut() { await this.sb.auth.signOut(); }
  async requestPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error(error.message);
  }
  async updatePassword(newPassword: string) {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }
  onAuthChange(cb: (e: AuthEvent, u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
      if (event === 'PASSWORD_RECOVERY') cb('PASSWORD_RECOVERY', u);
      else if (event === 'SIGNED_IN') cb('SIGNED_IN', u);
      else if (event === 'SIGNED_OUT') cb('SIGNED_OUT', null);
    });
    return () => data.subscription.unsubscribe();
  }

  // ── 플레이어 ───────────────────────────────────────
  claimSlot() { return this.rpc<SlotStatus>('claim_player_slot'); }
  async getMaxPlayers() {
    const { data, error } = await this.sb.from('game_settings').select('max_players').eq('id', 1).single();
    if (error) throw toGameError(error);
    return (data as { max_players: number }).max_players;
  }
  async getMyCharacter() {
    const r = await this.rpc<{ nickname: string; appearance: Appearance } | null>('get_my_character');
    return r ? { nickname: r.nickname, appearance: sanitizeAppearance(r.appearance) } : null;
  }
  async saveCharacter(nickname: string, appearance: Appearance) { await this.rpc('save_character', { p_nickname: nickname, p_appearance: appearance }); }
  async loadState() {
    const s = await this.rpc<PlayerState>('get_my_state');
    return { ...s, farm: normFarm(s.farm), profile: { ...s.profile, appearance: sanitizeAppearance(s.profile.appearance) } };
  }
  async startSession() { await this.rpc('start_session'); }
  async enterSpace(space: SpaceKey) { await this.rpc('enter_space', { p_space: space }); }
  updateTutorial(step: number) { return this.rpc<number>('update_tutorial', { p_step: step }); }
  async updateSettings(settings: PlayerSettings) { await this.rpc('update_settings', { p_settings: settings }); }

  // ── 농장 / 경제 ────────────────────────────────────
  async getFarm(ownerId: string) {
    const r = await this.rpc<{ farm: FarmState; serverNow: number }>('get_farm', { p_owner_id: ownerId });
    return { farm: normFarm(r.farm), serverNow: r.serverNow };
  }
  async listResidents() {
    const r = await this.rpc<Resident[]>('list_residents');
    return r.map((x) => ({ ...x, appearance: sanitizeAppearance(x.appearance) }));
  }
  async buySeed(cropId: string, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('buy_seed', { p_crop_id: cropId, p_qty: qty, p_request_id: requestId })); }
  async plant(x: number, y: number, cropId: string, requestId: string) { return normResult(await this.rpc<EconomyResult>('plant_crop', { p_x: x, p_y: y, p_crop_id: cropId, p_request_id: requestId })); }
  async harvest(x: number, y: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('harvest_crop', { p_x: x, p_y: y, p_request_id: requestId })); }
  async sell(cropId: string, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('sell_crop', { p_crop_id: cropId, p_qty: qty, p_request_id: requestId })); }
  async sellAll(requestId: string) { return normResult(await this.rpc<EconomyResult>('sell_all_crops', { p_request_id: requestId })); }
  async expandFarm(level: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('expand_farm', { p_target_level: level, p_request_id: requestId })); }
  getQuests() { return this.rpc<QuestProgress[]>('get_daily_quests'); }
  async claimQuest(questId: string, requestId: string) { return normResult(await this.rpc<EconomyResult>('claim_quest', { p_quest_id: questId, p_request_id: requestId })); }

  // ── 소셜 ───────────────────────────────────────────
  // ── 보관함 / 게시판 ─────────────────────────────────
  getStorage(ownerId: string) { return this.rpc<StorageView>('get_storage', { p_owner: ownerId }); }
  async depositStorage(itemId: string, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('storage_deposit', { p_item_id: itemId, p_qty: qty, p_request_id: requestId })); }
  async withdrawStorage(itemId: string, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('storage_withdraw', { p_item_id: itemId, p_qty: qty, p_request_id: requestId })); }
  async listBoardPosts() {
    const r = await this.rpc<(Omit<BoardPost, 'id' | 'authorId'> & { id: number; authorId: string })[]>('list_board_posts');
    return r.map((p) => ({ ...p, id: String(p.id) }));
  }
  async createBoardPost(body: string) { await this.rpc('create_board_post', { p_body: body }); }
  async deleteBoardPost(id: string) { await this.rpc('delete_board_post', { p_id: Number(id) }); }
  async listGuestbook(ownerId: string) {
    const r = await this.rpc<(Omit<GuestbookEntry, 'id'> & { id: number })[]>('list_guestbook', { p_owner: ownerId });
    return r.map((g) => ({ ...g, id: String(g.id) }));
  }
  async writeGuestbook(ownerId: string, body: string) { await this.rpc('write_guestbook', { p_owner: ownerId, p_body: body }); }
  async deleteGuestbookEntry(id: string) { await this.rpc('delete_guestbook_entry', { p_id: Number(id) }); }

  // ── 과일 / 카지노 ───────────────────────────────────
  fruitStatus() { return this.rpc<{ picks: Record<string, number>; serverNow: number }>('fruit_status'); }
  async pickFruit(treeId: string, requestId: string) { return normResult(await this.rpc<EconomyResult>('pick_fruit', { p_tree_id: treeId, p_request_id: requestId })); }
  waterStatus() { return this.rpc<{ logs: Record<string, number>; serverNow: number }>('water_status'); }
  async waterCrop(ownerId: string, x: number, y: number, requestId: string) {
    const r = await this.rpc<WaterResult>('water_crop', { p_owner: ownerId, p_x: x, p_y: y, p_request_id: requestId });
    return { ...r, farm: normFarm(r.farm) };
  }
  makeWish() { return this.rpc<{ won: boolean; gold: number; reward?: number }>('make_wish'); }
  listNotices(afterId: number) { return this.rpc<Notice[]>('list_notices', { p_after: afterId }); }
  async buyItem(itemId: string, color: number, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('buy_item', { p_item_id: itemId, p_color: color, p_qty: qty, p_request_id: requestId })); }
  async sellItem(itemId: string, qty: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('sell_item', { p_item_id: itemId, p_qty: qty, p_request_id: requestId })); }
  fishCast() { return this.rpc<{ biteAt: number; serverNow: number; tier: number }>('fish_cast'); }
  async fishReel(requestId: string) {
    const r = await this.rpc<EconomyResult>('fish_reel', { p_request_id: requestId });
    return r.inventory ? normResult(r) : r; // (예전 서버는 놓치면 { escaped: true } 만 돌려줌)
  }
  rodStatus() { return this.rpc<Record<string, number>>('rod_status'); }
  async useFertilizer(x: number, y: number, itemId: string, requestId: string) { return normResult(await this.rpc<EconomyResult>('use_fertilizer', { p_x: x, p_y: y, p_item_id: itemId, p_request_id: requestId })); }
  async getHouse(ownerId: string) { return normHouse(await this.rpc<HouseState>('get_house', { p_owner: ownerId })); }
  async expandHouse(level: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('expand_house', { p_target_level: level, p_request_id: requestId })); }
  async placeFurniture(furnId: string, color: number, x: number, y: number, requestId: string) { return normResult(await this.rpc<EconomyResult>('place_furniture', { p_type: furnId, p_color: color, p_x: x, p_y: y, p_request_id: requestId })); }
  async moveFurniture(id: number, x: number, y: number) { const r = await this.rpc<{ house: HouseState }>('move_furniture', { p_id: id, p_x: x, p_y: y }); return { house: normHouse(r.house) }; }
  async storeFurniture(id: number) { return normResult(await this.rpc<EconomyResult>('store_furniture', { p_id: id })); }
  beggarStatus() { return this.rpc<{ robbed: number[]; serverNow: number }>('beggar_status'); }
  async beggarRob(beggarId: number, requestId: string) {
    const r = normResult(await this.rpc<EconomyResult>('beggar_rob', { p_beggar: beggarId, p_request_id: requestId }));
    // 서버가 마을 채팅에 "갈취당했습니다" 를 올렸으니 바로 새로고침 + 다른 사람에게 알림
    const hook = this.chatHooks.get('village');
    if (hook) { hook.ping(); void hook.fetchNew(); }
    return r;
  }
  casinoState() { return this.rpc<CasinoState>('casino_state'); }
  async casinoJoin(stake: number, requestId: string) {
    const st = await this.rpc<CasinoState>('casino_join', { p_stake: stake, p_request_id: requestId });
    // 판을 열었다면 서버가 마을에 모집 글을 올렸으니 바로 채팅 새로고침 + 다른 사람에게 알림
    const hook = this.chatHooks.get('village');
    if (hook) { hook.ping(); void hook.fetchNew(); }
    return st;
  }
  casinoLeave(requestId: string) { return this.rpc<CasinoState>('casino_leave', { p_request_id: requestId }); }
  casinoReady(ready: boolean) { return this.rpc<CasinoState>('casino_ready', { p_ready: ready }); }

  /** 공간별 채팅 새로고침 함수 (보낸 직후 즉시 가져오기 + 다른 사람에게 알림) */
  private chatHooks = new Map<string, { fetchNew: () => Promise<void>; ping: () => void }>();

  async sendChat(space: SpaceKey, body: string) {
    await this.rpc('send_chat', { p_space: space, p_body: body });
    const hook = this.chatHooks.get(space);
    if (hook) { hook.ping(); await hook.fetchNew(); }
  }
  async reportPlayer(targetId: string, reason: string, detail: string) { await this.rpc('report_player', { p_target: targetId, p_reason: reason, p_detail: detail }); }
  async setBlocked(targetId: string, blocked: boolean) { await this.rpc('set_block', { p_target: targetId, p_blocked: blocked }); }
  async listBlocked() {
    const { data, error } = await this.sb.from('player_blocks').select('target_id');
    if (error) throw toGameError(error);
    return (data ?? []).map((r: { target_id: string }) => r.target_id);
  }

  // ── 실시간 ─────────────────────────────────────────
  /** topic 별 정리 작업 (supabase-js 는 채널을 topic 이름으로 지우므로, 정리가 끝난 뒤에 새로 만들어야 함) */
  private topicBusy = new Map<string, Promise<unknown>>();

  /** 같은 이름의 채널이 남아 있으면 먼저 완전히 정리 (supabase-js 는 같은 topic 채널을 재사용함) */
  private async dropTopic(topic: string) {
    for (const c of this.sb.getChannels()) {
      if (c.topic === `realtime:${topic}`) await this.sb.removeChannel(c).catch(() => undefined);
    }
  }

  /**
   * private 채널에 접속하고, 오류/타임아웃/예상치 못한 종료가 나면 점점 길게 기다리며 자동 재접속합니다.
   * setup 에서 이벤트 리스너를 붙이고, onJoined 에서 presence track 등을 합니다.
   */
  private resilientChannel(
    topic: string,
    presenceKey: string,
    setup: (ch: RealtimeChannel) => void,
    onStatus: (s: 'connecting' | 'connected' | 'reconnecting') => void,
    onJoined: (ch: RealtimeChannel) => void,
  ) {
    let ch: RealtimeChannel | null = null;
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;

    const scheduleRetry = () => {
      if (closed || retryTimer) return;
      onStatus('reconnecting');
      const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
      attempt++;
      retryTimer = setTimeout(() => { retryTimer = null; void connect(); }, delay);
    };

    const connect = async () => {
      const gen = ++generation;
      onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      await this.topicBusy.get(topic); // 같은 topic 의 이전 연결 정리가 끝날 때까지 대기
      if (closed || gen !== generation) return;
      if (ch) { const old = ch; ch = null; await this.sb.removeChannel(old).catch(() => undefined); }
      await this.dropTopic(topic);
      await this.sb.realtime.setAuth().catch(() => undefined);
      if (closed || gen !== generation) return;
      const c = this.sb.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key: presenceKey } } });
      ch = c;
      setup(c);
      c.subscribe((status) => {
        if (ch !== c || closed) return; // 이미 교체된 채널의 소식은 무시
        if (status === 'SUBSCRIBED') { attempt = 0; onStatus('connected'); onJoined(c); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') scheduleRetry();
      });
    };
    void connect();

    return {
      get: () => ch,
      leave: async () => {
        closed = true;
        if (retryTimer) clearTimeout(retryTimer);
        generation++;
        const c = ch;
        ch = null;
        const job = (async () => {
          if (c) { await c.untrack().catch(() => undefined); await this.sb.removeChannel(c).catch(() => undefined); }
        })();
        this.topicBusy.set(topic, job);
        await job;
        if (this.topicBusy.get(topic) === job) this.topicBusy.delete(topic);
      },
    };
  }

  joinSpace(space: SpaceKey, me: PresenceInfo, handlers: SpaceHandlers): SpaceConnection {
    let mine = { ...me };
    let lastTrack = 0;
    let trackTimer: ReturnType<typeof setTimeout> | null = null;

    // ── 채팅 수신: DB 에 저장된(서버가 검증한) 메시지만 표시 → 닉네임 사칭 불가 ──
    // postgres_changes 알림이 가끔 빠지므로, "새 메시지" 신호 + 5초 주기 확인으로 보완합니다.
    type ChatRow = { id: number; sender_id: string; nickname: string; body: string; space: string; created_at: string };
    let lastChatId: number | null = null;
    let fetching: Promise<void> | null = null;
    let left = false;
    const emitRow = (r: ChatRow) => {
      if (lastChatId !== null && r.id <= lastChatId) return;
      lastChatId = Math.max(lastChatId ?? 0, r.id);
      handlers.onChat({ id: String(r.id), senderId: r.sender_id, nickname: r.nickname, body: r.body, space: r.space as SpaceKey, createdAt: Date.parse(r.created_at) });
    };
    const fetchNew = (): Promise<void> => {
      if (fetching) return fetching.then(() => fetchNewNow());
      return fetchNewNow();
    };
    const fetchNewNow = (): Promise<void> => {
      fetching = (async () => {
        try {
          if (lastChatId === null) {
            // 입장 시점 이전 메시지는 다시 띄우지 않음
            const { data } = await this.sb.from('chat_messages').select('id').eq('space', space).order('id', { ascending: false }).limit(1);
            lastChatId = data?.[0]?.id ?? 0;
            return;
          }
          const { data } = await this.sb.from('chat_messages')
            .select('id,sender_id,nickname,body,space,created_at')
            .eq('space', space).gt('id', lastChatId).order('id', { ascending: true }).limit(50);
          (data as ChatRow[] | null)?.forEach(emitRow);
        } catch { /* 다음 주기에 다시 */ } finally { fetching = null; }
      })();
      return fetching;
    };
    void fetchNewNow();
    const poll = setInterval(() => { if (!left && !document.hidden) void fetchNew(); }, 5000);
    this.chatHooks.set(space, {
      fetchNew,
      ping: () => { void conn.get()?.send({ type: 'broadcast', event: 'chat', payload: {} }); },
    });

    const conn = this.resilientChannel(
      `space:${space}`,
      mine.sessionId,
      (ch) => {
        ch.on('broadcast', { event: 'move' }, ({ payload }) => handlers.onMove(payload as MovePacket))
          .on('broadcast', { event: 'emote' }, ({ payload }) => handlers.onEmote(payload as EmotePacket))
          .on('broadcast', { event: 'farm' }, () => handlers.onFarmChanged())
          .on('broadcast', { event: 'bye' }, ({ payload }) => handlers.onBye((payload as { id: string }).id))
          .on('broadcast', { event: 'casino' }, () => handlers.onCasino())
          .on('broadcast', { event: 'chat' }, () => { void fetchNew(); })
          .on('presence', { event: 'sync' }, () => handlers.onPresence(Object.values(ch.presenceState<PresenceInfo>()).flat()))
          // 가장 빠른 경로: DB 변경 알림 (빠지면 위의 신호/주기 확인이 보완)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `space=eq.${space}` }, () => { void fetchNew(); });
      },
      (st) => handlers.onStatus(st),
      () => { lastTrack = 0; track(); void fetchNew(); },
    );

    const track = () => {
      const ch = conn.get();
      if (!ch) return;
      const now = Date.now();
      if (now - lastTrack < 10000) { // 프레즌스 갱신은 느리게 (이동은 broadcast 로)
        if (!trackTimer) trackTimer = setTimeout(() => { trackTimer = null; track(); }, 10000);
        return;
      }
      lastTrack = now;
      void ch.track(mine);
    };

    return {
      // 이동은 broadcast 로만 (접속 정보 갱신은 입장/프로필 변경 때만 → Presence 한도 절약)
      sendMove: (p) => { void conn.get()?.send({ type: 'broadcast', event: 'move', payload: p }); mine = { ...mine, x: p.x, y: p.y, dir: p.dir }; },
      sendEmote: (e) => { void conn.get()?.send({ type: 'broadcast', event: 'emote', payload: e }); },
      notifyFarmChanged: () => { void conn.get()?.send({ type: 'broadcast', event: 'farm', payload: {} }); },
      updatePresence: (p) => { mine = { ...mine, ...p }; track(); },
      sayBye: () => { void conn.get()?.send({ type: 'broadcast', event: 'bye', payload: { id: mine.id } }); },
      notifyCasino: () => { void conn.get()?.send({ type: 'broadcast', event: 'casino', payload: {} }); },
      leave: async (silent?: boolean) => {
        left = true;
        if (!silent) await conn.get()?.send({ type: 'broadcast', event: 'bye', payload: { id: mine.id } }).catch(() => undefined);
        clearInterval(poll);
        if (this.chatHooks.get(space)?.fetchNew === fetchNew) this.chatHooks.delete(space);
        if (trackTimer) clearTimeout(trackTimer);
        await conn.leave();
      },
    };
  }

  joinOnline(me: PresenceInfo, handlers: OnlineHandlers): OnlineConnection {
    let mine = { ...me };
    const conn = this.resilientChannel(
      'online',
      mine.sessionId,
      (ch) => {
        ch.on('presence', { event: 'sync' }, () => handlers.onOnline(Object.values(ch.presenceState<PresenceInfo>()).flat()))
          .on('broadcast', { event: 'notice' }, ({ payload }) => handlers.onNotice((payload as { to: string }).to));
      },
      () => undefined,
      (ch) => { void ch.track(mine); },
    );
    return {
      update: (p) => { mine = { ...mine, ...p }; void conn.get()?.track(mine); },
      pingNotice: (to) => { void conn.get()?.send({ type: 'broadcast', event: 'notice', payload: { to } }); },
      leave: () => conn.leave(),
    };
  }
}
