import type { Appearance } from '@/config/appearance';
import type { SpaceKey } from '@/config/game';
import type {
  AuthUser, BoardPost, CasinoState, HouseState, Notice, WaterResult, ChatMessage, EconomyResult, GuestbookEntry, StorageView, EmotePacket, FarmState, MovePacket, PlayerSettings,
  PlayerState, PresenceInfo, QuestProgress, Resident, SlotStatus,
} from '@/types';

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SpaceHandlers {
  onMove(p: MovePacket): void;
  onPresence(players: PresenceInfo[]): void;
  onChat(m: ChatMessage): void;
  onEmote(e: EmotePacket): void;
  onFarmChanged(): void;
  onStatus(s: ConnStatus): void;
  /** 상대가 공간을 떠남 (창 닫기 / 다른 공간으로 이동) */
  onBye(id: string): void;
  /** 카지노 판에 변화가 생김 → 다시 불러오기 */
  onCasino(): void;
}

export interface SpaceConnection {
  sendMove(p: MovePacket): void;
  sendEmote(e: EmotePacket): void;
  notifyFarmChanged(): void;
  updatePresence(p: Partial<PresenceInfo>): void;
  /** 떠난다는 신호만 즉시 보냄 (창을 닫을 때) */
  sayBye(): void;
  notifyCasino(): void;
  /** silent: 같은 공간에 다시 연결할 때는 작별 신호를 보내지 않음 */
  leave(silent?: boolean): Promise<void>;
}

export interface OnlineHandlers {
  onOnline(players: PresenceInfo[]): void;
  /** 누군가에게 새 알림이 생겼다는 신호 (to = 받는 사람) */
  onNotice(to: string): void;
}

export interface OnlineConnection {
  update(p: Partial<PresenceInfo>): void;
  /** to 에게 "새 알림 왔어요" 신호 */
  pingNotice(to: string): void;
  leave(): Promise<void>;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY';

/**
 * 게임 백엔드 추상화.
 * - SupabaseBackend: 실제 서버 (PostgreSQL RPC 가 모든 경제 로직을 검증)
 * - LocalBackend: 서버 없이 체험 가능한 브라우저 내장 모드 (같은 규칙을 TS 로 재현)
 */
export interface GameBackend {
  readonly kind: 'supabase' | 'local';

  // ── 인증 ───────────────────────────────
  getUser(): Promise<AuthUser | null>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  onAuthChange(cb: (event: AuthEvent, user: AuthUser | null) => void): () => void;

  // ── 플레이어 ───────────────────────────
  claimSlot(): Promise<SlotStatus>;
  /** 서버에 설정된 마을 정원 (game_settings.max_players) */
  getMaxPlayers(): Promise<number>;
  /** 프로필이 없으면 null */
  getMyCharacter(): Promise<{ nickname: string; appearance: Appearance } | null>;
  saveCharacter(nickname: string, appearance: Appearance): Promise<void>;
  loadState(): Promise<PlayerState>;
  startSession(): Promise<void>;
  enterSpace(space: SpaceKey): Promise<void>;
  updateTutorial(step: number): Promise<number>;
  updateSettings(settings: PlayerSettings): Promise<void>;

  // ── 농장 / 경제 (모두 서버 검증) ──────────
  getFarm(ownerId: string): Promise<{ farm: FarmState; serverNow: number }>;
  listResidents(): Promise<Resident[]>;
  buySeed(cropId: string, qty: number, requestId: string): Promise<EconomyResult>;
  plant(x: number, y: number, cropId: string, requestId: string): Promise<EconomyResult>;
  harvest(x: number, y: number, requestId: string): Promise<EconomyResult>;
  sell(cropId: string, qty: number, requestId: string): Promise<EconomyResult>;
  sellAll(requestId: string): Promise<EconomyResult>;
  expandFarm(targetLevel: number, requestId: string): Promise<EconomyResult>;
  getQuests(): Promise<QuestProgress[]>;
  claimQuest(questId: string, requestId: string): Promise<EconomyResult>;

  // ── 보관함 (주인만 넣고/빼기, 모두 구경) ──
  getStorage(ownerId: string): Promise<StorageView>;
  depositStorage(itemId: string, qty: number, requestId: string): Promise<EconomyResult>;
  withdrawStorage(itemId: string, qty: number, requestId: string): Promise<EconomyResult>;

  // ── 주민 게시판 ──
  listBoardPosts(): Promise<BoardPost[]>;
  createBoardPost(body: string): Promise<void>;
  deleteBoardPost(id: string): Promise<void>;

  // ── 농장 방명록 (놀러 온 친구가 남김) ──
  listGuestbook(ownerId: string): Promise<GuestbookEntry[]>;
  writeGuestbook(ownerId: string, body: string): Promise<void>;
  deleteGuestbookEntry(id: string): Promise<void>;

  // ── 과일 나무 (나무당 30G, 30분에 한 번) ──
  fruitStatus(): Promise<{ picks: Record<string, number>; serverNow: number }>;
  pickFruit(treeId: string, requestId: string): Promise<EconomyResult>;

  // ── 친구 밭 물 주기 / 분수 소원 ──
  waterStatus(): Promise<{ logs: Record<string, number>; serverNow: number }>;
  waterCrop(ownerId: string, x: number, y: number, requestId: string): Promise<WaterResult>;
  makeWish(): Promise<{ won: boolean; gold: number; reward?: number }>;
  /** 내 알림 중 afterId 보다 새 것 */
  listNotices(afterId: number): Promise<Notice[]>;

  // ── 상점 품목 (비료 · 낚싯대 · 가구) ──
  /** color: 가구 색상 (0~7, 다른 품목은 0) */
  buyItem(itemId: string, color: number, qty: number, requestId: string): Promise<EconomyResult>;
  /** 물고기 판매 */
  sellItem(itemId: string, qty: number, requestId: string): Promise<EconomyResult>;

  // ── 낚시 (서버가 입질 시각과 물고기를 정함) ──
  fishCast(): Promise<{ biteAt: number; serverNow: number; tier: number }>;
  fishReel(requestId: string): Promise<EconomyResult>;
  /** 가지고 있는 낚싯대 → 남은 횟수 */
  rodStatus(): Promise<Record<string, number>>;

  // ── 비료 (내 밭 자라는 작물 한 칸) ──
  useFertilizer(x: number, y: number, itemId: string, requestId: string): Promise<EconomyResult>;

  // ── 집 / 가구 ──
  getHouse(ownerId: string): Promise<HouseState>;
  expandHouse(targetLevel: number, requestId: string): Promise<EconomyResult>;
  placeFurniture(furnId: string, color: number, x: number, y: number, requestId: string): Promise<EconomyResult>;
  moveFurniture(id: number, x: number, y: number): Promise<{ house: HouseState }>;
  storeFurniture(id: number): Promise<EconomyResult>;

  // ── 밤 · 마을 거지 ──
  /** 오늘 나를 이미 털어 간 거지 ID */
  beggarStatus(): Promise<{ robbed: number[]; serverNow: number }>;
  /** 거지에게 잡힘 → 서버가 10~100G 뜯음 (밤 · 마을 · 거지마다 하루 1번) */
  beggarRob(beggarId: number, requestId: string): Promise<EconomyResult>;

  // ── 햇살 카지노 (서버가 추첨) ──
  casinoState(): Promise<CasinoState>;
  /** 판 참가. 빈 판이면 stake 가 참가비가 되고, 열린 판이면 같은 참가비로만 참가 */
  casinoJoin(stake: number, requestId: string): Promise<CasinoState>;
  casinoLeave(requestId: string): Promise<CasinoState>;
  casinoReady(ready: boolean): Promise<CasinoState>;

  // ── 소셜 ───────────────────────────────
  sendChat(space: SpaceKey, body: string): Promise<void>;
  reportPlayer(targetId: string, reason: string, detail: string): Promise<void>;
  setBlocked(targetId: string, blocked: boolean): Promise<void>;
  listBlocked(): Promise<string[]>;

  // ── 실시간 ─────────────────────────────
  joinSpace(space: SpaceKey, me: PresenceInfo, handlers: SpaceHandlers): SpaceConnection;
  joinOnline(me: PresenceInfo, handlers: OnlineHandlers): OnlineConnection;
}

/** 서버/로컬 공통 오류 코드 → 한국어 메시지 */
export const ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: '로그인이 필요해요.',
  NO_SLOT: '아직 마을 주민으로 등록되지 않았어요.',
  NO_PROFILE: '캐릭터를 먼저 만들어 주세요.',
  INSUFFICIENT_GOLD: '골드가 부족해요. 작물을 팔아서 골드를 모아봐요!',
  INVALID_QTY: '수량을 다시 확인해 주세요.',
  UNKNOWN_CROP: '알 수 없는 작물이에요.',
  NOT_ENOUGH_SEEDS: '씨앗이 부족해요. 상점에서 구매해 주세요.',
  NOT_ENOUGH_ITEMS: '가방에 그만큼 들어 있지 않아요.',
  NOT_ENOUGH_STORED: '보관함에 그만큼 들어 있지 않아요.',
  INVALID_ITEM: '보관함에는 씨앗과 작물만 넣을 수 있어요.',
  BOARD_EMPTY: '게시글 내용을 적어 주세요.',
  GUESTBOOK_EMPTY: '방명록에 남길 말을 적어 주세요.',
  GUESTBOOK_TOO_LONG: '방명록은 120자까지 쓸 수 있어요.',
  GUESTBOOK_RATE_LIMIT: '방명록은 15초에 한 번씩 쓸 수 있어요.',
  OWN_GUESTBOOK: '내 방명록에는 친구들이 글을 남겨 줘요!',
  FRUIT_NOT_READY: '아직 열매가 다시 열리지 않았어요. 조금만 기다려 주세요! 🍎',
  CASINO_BAD_AMOUNT: '10G 이상 1,000,000G 이하로 걸어 주세요.',
  CASINO_FULL: '이번 판은 자리가 다 찼어요 (최대 8명). 다음 판을 기다려 주세요!',
  CASINO_NOT_JOINED: '이번 판에 참가하지 않았어요.',
  CASINO_ALREADY_JOINED: '이미 이번 판에 참가했어요.',
  OWN_FARM_WATER: '물 주기는 친구 농장에서만 할 수 있어요. 내 밭은 비가 알아서 적셔 줘요 🌧️',
  WATER_COOLDOWN: '이 친구 밭에는 이미 물을 줬어요. 30분 뒤에 다시 줄 수 있어요 💧',
  CROP_ALREADY_READY: '이미 다 자란 작물이에요. 바로 수확할 수 있어요!',
  UNKNOWN_ITEM: '알 수 없는 물건이에요.',
  INVALID_COLOR: '색상을 다시 골라 주세요.',
  ALREADY_OWNED: '이미 가지고 있는 낚싯대예요! 🎣',
  NO_ROD: '낚싯대가 없어요. 씨앗 상점의 낚시 코너에서 낚싯대를 사 주세요! 🎣',
  NO_WATER_HERE: '여기서는 낚시를 할 수 없어요. 연못 앞에서 해 보세요!',
  NOT_FISHING: '먼저 찌를 던져 주세요!',
  FISH_TOO_EARLY: '너무 빨리 당겼어요! 찌가 "툭!" 하고 움직일 때 당겨 주세요.',
  NO_FERTILIZER: '비료가 없어요. 씨앗 상점에서 사 주세요!',
  ALREADY_FERTILIZED: '이 칸에는 이미 비료를 줬어요! 수확하고 새로 심으면 다시 줄 수 있어요.',
  NOT_IN_HOUSE: '내 집 안에서만 가구를 놓을 수 있어요.',
  HOUSE_FULL: '집에 가구가 너무 많아요 (최대 80개). 집을 넓히거나 몇 개를 보관해 주세요!',
  CANT_PLACE: '여기에는 놓을 수 없어요. 다른 가구와 겹치거나 문 앞이에요.',
  NO_FURNITURE: '가방에 그 가구가 없어요.',
  NOT_NIGHT: '거지는 밤에만 나와요.',
  ALREADY_ROBBED: '이 거지는 오늘 이미 돈을 뜯어 갔어요.',
  NOTHING_TO_WATER: '이 밭에는 물을 줄 작물이 없어요. 자라는 작물이 있을 때 다시 와 주세요!',
  WISH_COOLDOWN: '분수가 잠시 쉬고 있어요. 소원은 1분에 한 번 빌 수 있어요 ⛲',
  CASINO_STAKE_CHANGED: '방금 다른 사람이 새 판을 열었어요. 참가비를 확인하고 다시 눌러 주세요!',
  BOARD_TOO_LONG: '게시글은 200자까지 쓸 수 있어요.',
  BOARD_RATE_LIMIT: '글은 20초에 한 번씩 쓸 수 있어요. 잠시 후 다시 써 주세요!',
  NOTHING_TO_SELL: '판매할 작물이 없어요.',
  PLOT_LOCKED: '아직 확장되지 않은 밭이에요.',
  PLOT_OCCUPIED: '이미 작물이 자라고 있어요.',
  PLOT_EMPTY: '수확할 작물이 없어요.',
  NOT_READY: '아직 다 자라지 않았어요. 조금만 기다려 주세요!',
  NOT_OWNER: '다른 사람의 농장은 구경만 할 수 있어요.',
  MAX_LEVEL: '이미 최고 단계까지 확장했어요!',
  INVALID_LEVEL: '확장 단계가 올바르지 않아요.',
  NICKNAME_INVALID: '닉네임은 2~10자의 한글/영문/숫자로 정해 주세요.',
  NICKNAME_TAKEN: '이미 다른 주민이 쓰고 있는 닉네임이에요.',
  CHAT_TOO_LONG: '메시지는 100자까지 보낼 수 있어요.',
  CHAT_EMPTY: '메시지를 입력해 주세요.',
  CHAT_RATE_LIMIT: '조금 천천히 말해 주세요! 잠시 후 다시 보낼 수 있어요.',
  WRONG_SPACE: '지금 있는 곳에서만 채팅할 수 있어요.',
  QUEST_NOT_DONE: '아직 퀘스트를 완료하지 않았어요.',
  QUEST_CLAIMED: '오늘은 이미 보상을 받았어요.',
  UNKNOWN_QUEST: '알 수 없는 퀘스트예요.',
  INVALID_TARGET: '대상을 찾을 수 없어요.',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않아요.',
  EMAIL_TAKEN: '이미 가입된 이메일이에요.',
  WEAK_PASSWORD: '비밀번호는 6자 이상으로 정해 주세요.',
  EMAIL_NOT_CONFIRMED: '이메일 인증을 먼저 완료해 주세요. 받은 편지함을 확인해 보세요!',
  INVALID_EMAIL: '이메일 주소를 다시 확인해 주세요.',
  NETWORK: '네트워크 연결이 불안정해요. 잠시 후 다시 시도해 주세요.',
};

export class GameError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? code);
  }
}

export function toKoreanError(e: unknown): string {
  if (e instanceof GameError) return e.message;
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (msg.includes(code)) return ERROR_MESSAGES[code];
  }
  if (/Invalid login credentials/i.test(msg)) return ERROR_MESSAGES.INVALID_CREDENTIALS;
  if (/already registered/i.test(msg)) return ERROR_MESSAGES.EMAIL_TAKEN;
  if (/Email not confirmed/i.test(msg)) return ERROR_MESSAGES.EMAIL_NOT_CONFIRMED;
  if (/Password should be/i.test(msg)) return ERROR_MESSAGES.WEAK_PASSWORD;
  if (/email rate limit/i.test(msg)) return '지금 인증 메일을 보내려는 사람이 많아서 잠시 막혔어요. 조금(최대 1시간) 뒤에 다시 시도해 주세요! 📮';
  if (/rate limit|too many requests/i.test(msg)) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (/Signups not allowed/i.test(msg)) return '지금은 새 주민 가입을 받고 있지 않아요.';
  if (/fetch|network/i.test(msg)) return ERROR_MESSAGES.NETWORK;
  return `앗, 문제가 생겼어요: ${msg}`;
}
