/**
 * LocalServer — Supabase RPC 와 같은 규칙을 TypeScript 로 재현한 "브라우저 내장 서버".
 * 서버 설정 없이 게임을 체험하거나 개발/테스트할 때 사용합니다.
 * 모든 메서드는 호출자(userId)를 받아서 권한을 검증합니다. (클라이언트 값 불신 원칙)
 */
import { CROP_MAP, CROPS, cropItemId, seedItemId } from '@/config/crops';
import { FARM_LEVELS, MAX_FARM_LEVEL } from '@/config/farm';
import { GAME_CONFIG, isFarmSpace, isHouseSpace, type SpaceKey } from '@/config/game';
import { BEGGARS, dayPhase } from '@/config/night';
import { FERT_MAP, FISH, FISH_MAP, FISH_WEIGHTS, FURN_MAP, FURNITURE_COLORS, HOUSE_LEVELS, HOUSE_MAX_ITEMS, MAX_HOUSE_LEVEL, ROD_MAP, RODS, canPlace, parseFurnItem } from '@/config/shop';
import { QUESTS } from '@/config/quests';
import { NICKNAME_RE, sanitizeAppearance, type Appearance } from '@/config/appearance';
import { CASINO, FRUIT_COOLDOWN_SEC, FRUIT_REWARD, FRUIT_TREES, WATER, WISH } from '@/config/fruit';
import { isStorableItem, isValidQty, kstDate, sizeForLevel, validateBoard, validateChat, validateGuestbook } from '@/features/economy/rules';
import { GameError } from './types';
import {
  DEFAULT_SETTINGS, type HouseItem, type HouseState, type BoardPost, type CasinoBet, type CasinoState, type WaterResult, type ChatMessage, type GuestbookEntry, type StorageView, type EconomyResult, type FarmState, type Inventory, type PlantedCrop,
  type PlayerSettings, type PlayerState, type PlayerStats, type QuestProgress, type Resident, type SlotStatus,
} from '@/types';

export interface LocalAccount { id: string; email: string; password: string; confirmed: boolean; createdAt: number }
interface LocalProfile {
  id: string; nickname: string; appearance: Appearance; gold: number; tutorialStep: number;
  settings: PlayerSettings; currentSpace: SpaceKey; isAdmin: boolean;
}
interface LocalFarm { ownerId: string; level: number; crops: PlantedCrop[] }
interface LocalTx {
  playerId: string; requestId: string; kind: string; cropId: string | null; quantity: number; goldDelta: number;
  createdAt: number; result: EconomyResult | null; itemId?: string;
}
export interface LocalDB {
  version: 1;
  settings: { villageName: string; maxPlayers: number; signupMode: 'open' | 'allowlist'; allowlist: string[] };
  accounts: LocalAccount[];
  slots: { slotNo: number; userId: string; active: boolean }[];
  profiles: Record<string, LocalProfile>;
  farms: Record<string, LocalFarm>;
  inventory: Record<string, Inventory>;
  stats: Record<string, PlayerStats>;
  tx: LocalTx[];
  quests: { playerId: string; questId: string; date: string }[];
  chat: ChatMessage[];
  reports: { reporterId: string; targetId: string; reason: string; detail: string; createdAt: number }[];
  blocks: { userId: string; targetId: string }[];
  /** 농장 보관함 (예전 저장 데이터에는 없을 수 있음) */
  storage?: Record<string, Inventory>;
  /** 주민 게시판 */
  board?: BoardPost[];
  boardSeq?: number;
  /** 농장 방명록 */
  guestbook?: GuestbookEntry[];
  /** 과일 따기 기록: 플레이어 → 나무 → 딴 시각 */
  fruitPicks?: Record<string, Record<string, number>>;
  /** 물 주기 기록: 물 준 사람 → 농장 주인 → 시각 */
  waterLogs?: Record<string, Record<string, number>>;
  /** 개인 알림 */
  notices?: { id: number; userId: string; kind: string; body: string; createdAt: number }[];
  noticeSeq?: number;
  /** 집: 주인 → 단계 + 가구 */
  houses?: Record<string, { level: number; items: HouseItem[] }>;
  houseSeq?: number;
  /** 낚시 중: 플레이어 → 등급 + 입질 시각 */
  fishing?: Record<string, { tier: number; biteAt: number }>;
  /** 거지 갈취 기록: 플레이어 → '날짜:거지ID' 목록 */
  beggarRobs?: Record<string, string[]>;
  /** 낚싯대 남은 횟수: 플레이어 → 낚싯대 → 횟수 (없으면 가득) */
  rodUses?: Record<string, Record<string, number>>;
  /** 분수 소원 마지막 시각 */
  wishLogs?: Record<string, number>;
  /** 카지노 */
  casino?: {
    seq: number;
    open: { id: number; stake?: number | null; bets: (CasinoBet & { joinedAt: number; updatedAt: number })[] };
    last: CasinoState['last'];
  };
}

export function emptyDB(): LocalDB {
  return {
    version: 1,
    settings: { villageName: GAME_CONFIG.villageName, maxPlayers: GAME_CONFIG.maxPlayers, signupMode: 'open', allowlist: [] },
    accounts: [], slots: [], profiles: {}, farms: {}, inventory: {}, stats: {}, tx: [], quests: [], chat: [], reports: [], blocks: [], storage: {}, board: [], boardSeq: 0, guestbook: [],
  };
}

const emptyStats = (): PlayerStats => ({
  totalHarvests: 0, totalPlanted: 0, totalSalesGold: 0, totalSold: 0, cropHarvests: {}, sessions: 0, firstPlayedAt: null,
});

export class LocalServer {
  constructor(public db: LocalDB, private now: () => number = () => Date.now()) {}

  // ── 내부 헬퍼 ────────────────────────────────────────
  private requireSlot(uid: string) {
    const slot = this.db.slots.find((s) => s.userId === uid);
    if (!slot || !slot.active) throw new GameError('NO_SLOT');
    return slot;
  }
  private requirePlayer(uid: string) {
    this.requireSlot(uid);
    const p = this.db.profiles[uid];
    if (!p) throw new GameError('NO_PROFILE');
    return p;
  }
  private inv(uid: string) { return (this.db.inventory[uid] ??= {}); }
  private addItem(uid: string, item: string, qty: number) {
    const inv = this.inv(uid);
    const next = (inv[item] ?? 0) + qty;
    if (next < 0) throw new GameError('NOT_ENOUGH_ITEMS');
    if (next === 0) delete inv[item];
    else inv[item] = next;
  }
  private farmState(ownerId: string): FarmState {
    const f = this.db.farms[ownerId];
    const p = this.db.profiles[ownerId];
    if (!f || !p) throw new GameError('INVALID_TARGET');
    return { ownerId, ownerNickname: p.nickname, level: f.level, size: sizeForLevel(f.level), crops: f.crops.map((c) => ({ ...c })) };
  }
  private cached(uid: string, requestId: string): EconomyResult | null {
    if (!requestId) throw new GameError('INVALID_QTY', '요청 ID가 없어요.');
    const t = this.db.tx.find((x) => x.playerId === uid && x.requestId === requestId);
    return t?.result ?? null;
  }
  private result(uid: string, goldDelta: number, withFarm: boolean): EconomyResult {
    const p = this.db.profiles[uid];
    return {
      gold: p.gold, inventory: { ...this.inv(uid) }, goldDelta, serverNow: this.now(),
      farm: withFarm ? this.farmState(uid) : undefined, stats: { ...this.db.stats[uid], cropHarvests: { ...this.db.stats[uid].cropHarvests } },
    };
  }
  private log(uid: string, requestId: string, kind: string, cropId: string | null, quantity: number, goldDelta: number, result: EconomyResult) {
    this.db.tx.push({ playerId: uid, requestId, kind, cropId, quantity, goldDelta, createdAt: this.now(), result });
    if (this.db.tx.length > 5000) this.db.tx.splice(0, this.db.tx.length - 5000);
  }

  // ── 슬롯 / 프로필 ────────────────────────────────────
  claimSlot(uid: string, email: string): SlotStatus {
    const existing = this.db.slots.find((s) => s.userId === uid);
    if (existing) return existing.active ? { status: 'ok', slot: existing.slotNo } : { status: 'inactive' };
    const st = this.db.settings;
    if (st.signupMode === 'allowlist' && !st.allowlist.map((e) => e.toLowerCase()).includes(email.toLowerCase())) {
      return { status: 'not_approved' };
    }
    const used = this.db.slots.filter((s) => s.active).length;
    if (used >= st.maxPlayers) return { status: 'full', max: st.maxPlayers };
    const taken = new Set(this.db.slots.map((s) => s.slotNo));
    let n = 1;
    while (taken.has(n)) n++;
    this.db.slots.push({ slotNo: n, userId: uid, active: true });
    return { status: 'ok', slot: n };
  }

  getCharacter(uid: string) {
    const p = this.db.profiles[uid];
    return p ? { nickname: p.nickname, appearance: p.appearance } : null;
  }

  saveCharacter(uid: string, nickname: string, appearance: Appearance) {
    this.requireSlot(uid);
    const nick = nickname.trim();
    if (!NICKNAME_RE.test(nick)) throw new GameError('NICKNAME_INVALID');
    const dup = Object.values(this.db.profiles).find((p) => p.id !== uid && p.nickname.toLowerCase() === nick.toLowerCase());
    if (dup) throw new GameError('NICKNAME_TAKEN');
    const app = sanitizeAppearance(appearance);
    const p = this.db.profiles[uid];
    if (p) {
      p.nickname = nick;
      p.appearance = app;
      return;
    }
    this.db.profiles[uid] = {
      id: uid, nickname: nick, appearance: app, gold: GAME_CONFIG.startingGold, tutorialStep: 0,
      settings: { ...DEFAULT_SETTINGS }, currentSpace: 'village', isAdmin: false,
    };
    this.db.farms[uid] = { ownerId: uid, level: 1, crops: [] };
    this.db.inventory[uid] = { 'tool:hoe': 1, 'tool:watering_can': 1, 'tool:basket': 1 };
    this.db.stats[uid] = emptyStats();
  }

  loadState(uid: string): PlayerState {
    const p = this.requirePlayer(uid);
    return {
      profile: { id: uid, nickname: p.nickname, appearance: p.appearance, gold: p.gold, tutorialStep: p.tutorialStep, settings: { ...p.settings }, isAdmin: p.isAdmin },
      inventory: { ...this.inv(uid) },
      farm: this.farmState(uid),
      stats: { ...this.db.stats[uid] },
      serverNow: this.now(),
    };
  }

  startSession(uid: string) {
    this.requirePlayer(uid);
    const s = this.db.stats[uid];
    s.sessions += 1;
    s.firstPlayedAt ??= this.now();
    this.db.profiles[uid].currentSpace = 'village';
  }

  enterSpace(uid: string, space: SpaceKey) {
    const p = this.requirePlayer(uid);
    if (space !== 'village') {
      const owner = isFarmSpace(space) ? space.slice(5) : isHouseSpace(space) ? space.slice(6) : null;
      if (!owner || !this.db.farms[owner]) throw new GameError('INVALID_TARGET');
    }
    p.currentSpace = space;
  }

  updateTutorial(uid: string, step: number) {
    const p = this.requirePlayer(uid);
    if (!Number.isInteger(step) || step < 0 || step > 99) throw new GameError('INVALID_QTY');
    p.tutorialStep = Math.max(p.tutorialStep, step);
    return p.tutorialStep;
  }

  updateSettings(uid: string, s: PlayerSettings) {
    const p = this.requirePlayer(uid);
    p.settings = {
      volume: Math.min(1, Math.max(0, Number(s.volume) || 0)),
      muted: !!s.muted,
      showChatLog: s.showChatLog !== false,
    };
  }

  // ── 농장 / 경제 ──────────────────────────────────────
  getFarm(uid: string, ownerId: string) {
    this.requirePlayer(uid);
    return { farm: this.farmState(ownerId), serverNow: this.now() };
  }

  listResidents(uid: string): Resident[] {
    this.requirePlayer(uid);
    return this.db.slots
      .filter((s) => s.active && this.db.profiles[s.userId])
      .sort((a, b) => a.slotNo - b.slotNo)
      .map((s) => {
        const p = this.db.profiles[s.userId];
        const lv = this.db.farms[s.userId]?.level ?? 1;
        return { id: p.id, nickname: p.nickname, appearance: p.appearance, farmLevel: lv, farmSize: sizeForLevel(lv) };
      });
  }

  buySeed(uid: string, cropId: string, qty: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const crop = CROP_MAP[cropId];
    if (!crop) throw new GameError('UNKNOWN_CROP');
    if (!isValidQty(qty, 99)) throw new GameError('INVALID_QTY');
    const cost = crop.seedPrice * qty; // 가격은 항상 서버 기준 데이터에서
    if (p.gold < cost) throw new GameError('INSUFFICIENT_GOLD');
    p.gold -= cost;
    this.addItem(uid, seedItemId(cropId), qty);
    const r = this.result(uid, -cost, false);
    this.log(uid, requestId, 'buy', cropId, qty, -cost, r);
    return r;
  }

  plant(uid: string, x: number, y: number, cropId: string, requestId: string): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const crop = CROP_MAP[cropId];
    if (!crop) throw new GameError('UNKNOWN_CROP');
    const farm = this.db.farms[uid]; // 항상 "내" 농장에만 심을 수 있음
    const size = sizeForLevel(farm.level);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) throw new GameError('PLOT_LOCKED');
    if (farm.crops.some((k) => k.x === x && k.y === y)) throw new GameError('PLOT_OCCUPIED');
    if ((this.inv(uid)[seedItemId(cropId)] ?? 0) < 1) throw new GameError('NOT_ENOUGH_SEEDS');
    this.addItem(uid, seedItemId(cropId), -1);
    const now = this.now();
    farm.crops.push({ x, y, cropId, plantedAt: now, readyAt: now + crop.growSeconds * 1000 });
    this.db.stats[uid].totalPlanted += 1;
    const r = this.result(uid, 0, true);
    this.log(uid, requestId, 'plant', cropId, 1, 0, r);
    return r;
  }

  harvest(uid: string, x: number, y: number, requestId: string): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const farm = this.db.farms[uid];
    const idx = farm.crops.findIndex((k) => k.x === x && k.y === y);
    if (idx < 0) throw new GameError('PLOT_EMPTY');
    const crop = farm.crops[idx];
    if (this.now() < crop.readyAt) throw new GameError('NOT_READY'); // 서버 시간 기준
    farm.crops.splice(idx, 1); // 삭제와 동시에 지급 → 중복 수확 불가
    this.addItem(uid, cropItemId(crop.cropId), 1);
    const st = this.db.stats[uid];
    st.totalHarvests += 1;
    st.cropHarvests[crop.cropId] = (st.cropHarvests[crop.cropId] ?? 0) + 1;
    const r = this.result(uid, 0, true);
    this.log(uid, requestId, 'harvest', crop.cropId, 1, 0, r);
    return r;
  }

  sell(uid: string, cropId: string, qty: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const crop = CROP_MAP[cropId];
    if (!crop) throw new GameError('UNKNOWN_CROP');
    if (!isValidQty(qty, 9999)) throw new GameError('INVALID_QTY');
    if ((this.inv(uid)[cropItemId(cropId)] ?? 0) < qty) throw new GameError('NOT_ENOUGH_ITEMS');
    const gain = crop.sellPrice * qty;
    this.addItem(uid, cropItemId(cropId), -qty);
    p.gold += gain;
    this.db.stats[uid].totalSalesGold += gain;
    this.db.stats[uid].totalSold += qty;
    const r = this.result(uid, gain, false);
    this.log(uid, requestId, 'sell', cropId, qty, gain, r);
    return r;
  }

  sellAll(uid: string, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    let gain = 0;
    const inv = this.inv(uid);
    const sold: { cropId: string; qty: number; gold: number }[] = [];
    for (const crop of CROPS) {
      const q = inv[cropItemId(crop.id)] ?? 0;
      if (q > 0) {
        sold.push({ cropId: crop.id, qty: q, gold: q * crop.sellPrice });
        gain += q * crop.sellPrice;
        delete inv[cropItemId(crop.id)];
      }
    }
    for (const f of FISH) { // 물고기도 같이 판매
      const q = inv[`fish:${f.id}`] ?? 0;
      if (q > 0) {
        sold.push({ cropId: `fish:${f.id}`, qty: q, gold: q * f.price });
        gain += q * f.price;
        delete inv[`fish:${f.id}`];
      }
    }
    if (sold.length === 0) throw new GameError('NOTHING_TO_SELL');
    p.gold += gain;
    const st = this.db.stats[uid];
    st.totalSalesGold += gain;
    const r = this.result(uid, gain, false);
    for (const s of sold) {
      st.totalSold += s.qty;
      this.log(uid, s === sold[0] ? requestId : `${requestId}:${s.cropId}`, 'sell', s.cropId, s.qty, s.gold, r);
    }
    return r;
  }

  expandFarm(uid: string, targetLevel: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const farm = this.db.farms[uid];
    if (farm.level >= MAX_FARM_LEVEL) throw new GameError('MAX_LEVEL');
    if (targetLevel !== farm.level + 1) throw new GameError('INVALID_LEVEL'); // 중복/건너뛰기 방지
    const def = FARM_LEVELS.find((l) => l.level === targetLevel)!;
    if (p.gold < def.cost) throw new GameError('INSUFFICIENT_GOLD');
    p.gold -= def.cost;
    farm.level = targetLevel;
    const r = this.result(uid, -def.cost, true);
    this.log(uid, requestId, 'expand', null, targetLevel, -def.cost, r);
    return r;
  }

  getQuests(uid: string): QuestProgress[] {
    this.requirePlayer(uid);
    const today = kstDate(this.now());
    return QUESTS.map((q) => {
      const progress = this.db.tx
        .filter((t) => t.playerId === uid && t.kind === q.kind && kstDate(t.createdAt) === today && (q.cropId === null || t.cropId === q.cropId))
        .reduce((a, t) => a + t.quantity, 0);
      const claimed = this.db.quests.some((x) => x.playerId === uid && x.questId === q.id && x.date === today);
      return { id: q.id, progress: Math.min(progress, q.target), claimed };
    });
  }

  claimQuest(uid: string, questId: string, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const def = QUESTS.find((q) => q.id === questId);
    if (!def) throw new GameError('UNKNOWN_QUEST');
    const qp = this.getQuests(uid).find((q) => q.id === questId)!;
    if (qp.claimed) throw new GameError('QUEST_CLAIMED');
    if (qp.progress < def.target) throw new GameError('QUEST_NOT_DONE');
    this.db.quests.push({ playerId: uid, questId, date: kstDate(this.now()) });
    p.gold += def.reward;
    const r = this.result(uid, def.reward, false);
    this.log(uid, requestId, 'quest', null, 0, def.reward, r);
    return r;
  }

  // ── 소셜 ─────────────────────────────────────────────
  sendChat(uid: string, space: SpaceKey, raw: string): ChatMessage {
    const p = this.requirePlayer(uid);
    const v = validateChat(raw);
    if (!v.ok) throw new GameError(v.code);
    if (p.currentSpace !== space) throw new GameError('WRONG_SPACE');
    const since = this.now() - GAME_CONFIG.chat.rateWindowSec * 1000;
    const recent = this.db.chat.filter((m) => m.senderId === uid && m.createdAt > since).length;
    if (recent >= GAME_CONFIG.chat.rateMax) throw new GameError('CHAT_RATE_LIMIT');
    const msg: ChatMessage = {
      id: `${this.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: uid, nickname: p.nickname, body: v.body, space, createdAt: this.now(),
    };
    this.db.chat.push(msg);
    if (this.db.chat.length > 500) this.db.chat.splice(0, this.db.chat.length - 500);
    return msg;
  }

  report(uid: string, targetId: string, reason: string, detail: string) {
    this.requirePlayer(uid);
    if (!this.db.profiles[targetId] || targetId === uid) throw new GameError('INVALID_TARGET');
    this.db.reports.push({ reporterId: uid, targetId, reason: reason.slice(0, 40), detail: detail.slice(0, 300), createdAt: this.now() });
  }

  setBlocked(uid: string, targetId: string, blocked: boolean) {
    this.requirePlayer(uid);
    if (targetId === uid) throw new GameError('INVALID_TARGET');
    this.db.blocks = this.db.blocks.filter((b) => !(b.userId === uid && b.targetId === targetId));
    if (blocked) this.db.blocks.push({ userId: uid, targetId });
  }

  // ── 보관함 ──────────────────────────────────────────
  private store(owner: string) {
    this.db.storage ??= {};
    return (this.db.storage[owner] ??= {});
  }
  private checkStorable(itemId: string) {
    if (!isStorableItem(itemId) || !CROP_MAP[itemId.split(':')[1]]) throw new GameError('INVALID_ITEM');
  }

  depositStorage(uid: string, itemId: string, qty: number, requestId: string): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    this.checkStorable(itemId);
    if (!isValidQty(qty, 9999)) throw new GameError('INVALID_QTY');
    this.addItem(uid, itemId, -qty); // 부족하면 NOT_ENOUGH_ITEMS
    const box = this.store(uid);
    box[itemId] = (box[itemId] ?? 0) + qty;
    const r = { ...this.result(uid, 0, false), storage: { ...box } };
    this.db.tx.push({ playerId: uid, requestId, kind: 'deposit', cropId: itemId.split(':')[1], itemId, quantity: qty, goldDelta: 0, createdAt: this.now(), result: r });
    return r;
  }

  withdrawStorage(uid: string, itemId: string, qty: number, requestId: string): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    this.checkStorable(itemId);
    if (!isValidQty(qty, 9999)) throw new GameError('INVALID_QTY');
    const box = this.store(uid);
    if ((box[itemId] ?? 0) < qty) throw new GameError('NOT_ENOUGH_STORED');
    box[itemId] -= qty;
    if (box[itemId] === 0) delete box[itemId];
    this.addItem(uid, itemId, qty);
    const r = { ...this.result(uid, 0, false), storage: { ...box } };
    this.db.tx.push({ playerId: uid, requestId, kind: 'withdraw', cropId: itemId.split(':')[1], itemId, quantity: qty, goldDelta: 0, createdAt: this.now(), result: r });
    return r;
  }

  getStorage(uid: string, ownerId: string): StorageView {
    this.requirePlayer(uid);
    const p = this.db.profiles[ownerId];
    if (!p) throw new GameError('INVALID_TARGET');
    const recent = this.db.tx
      .filter((t) => t.playerId === ownerId && (t.kind === 'deposit' || t.kind === 'withdraw'))
      .slice(-15).reverse()
      .map((t) => ({ kind: t.kind as 'deposit' | 'withdraw', itemId: t.itemId ?? `crop:${t.cropId}`, qty: t.quantity, at: t.createdAt }));
    return { ownerId, ownerNickname: p.nickname, items: { ...this.store(ownerId) }, recent };
  }

  // ── 주민 게시판 ─────────────────────────────────────
  createBoardPost(uid: string, raw: string) {
    const p = this.requirePlayer(uid);
    const v = validateBoard(raw);
    if (!v.ok) throw new GameError(v.code);
    this.db.board ??= [];
    if (this.db.board.some((b) => b.authorId === uid && this.now() - b.createdAt < 20_000)) throw new GameError('BOARD_RATE_LIMIT');
    this.db.boardSeq = (this.db.boardSeq ?? 0) + 1;
    this.db.board.push({ id: String(this.db.boardSeq), authorId: uid, nickname: p.nickname, body: v.body, createdAt: this.now() });
    if (this.db.board.length > 300) this.db.board.splice(0, this.db.board.length - 300);
  }

  deleteBoardPost(uid: string, id: string) {
    const p = this.requirePlayer(uid);
    const list = this.db.board ?? [];
    const i = list.findIndex((b) => b.id === id && (b.authorId === uid || p.isAdmin));
    if (i < 0) throw new GameError('INVALID_TARGET');
    list.splice(i, 1);
  }

  listBoardPosts(uid: string): BoardPost[] {
    this.requirePlayer(uid);
    const blocked = new Set(this.listBlocked(uid));
    return (this.db.board ?? []).filter((b) => !blocked.has(b.authorId)).slice(-50).reverse().map((b) => ({ ...b }));
  }

  // ── 농장 방명록 ─────────────────────────────────────
  writeGuestbook(uid: string, ownerId: string, raw: string) {
    const p = this.requirePlayer(uid);
    if (!this.db.farms[ownerId]) throw new GameError('INVALID_TARGET');
    if (ownerId === uid) throw new GameError('OWN_GUESTBOOK');
    if (p.currentSpace !== 'farm:' + ownerId) throw new GameError('WRONG_SPACE');
    const v = validateGuestbook(raw);
    if (!v.ok) throw new GameError(v.code);
    this.db.guestbook ??= [];
    if (this.db.guestbook.some((g) => g.authorId === uid && this.now() - g.createdAt < 15_000)) throw new GameError('GUESTBOOK_RATE_LIMIT');
    this.db.boardSeq = (this.db.boardSeq ?? 0) + 1;
    this.db.guestbook.push({ id: 'g' + this.db.boardSeq, ownerId, authorId: uid, nickname: p.nickname, body: v.body, createdAt: this.now() });
    if (this.db.guestbook.length > 1000) this.db.guestbook.splice(0, this.db.guestbook.length - 1000);
  }

  listGuestbook(uid: string, ownerId: string): GuestbookEntry[] {
    this.requirePlayer(uid);
    const blocked = new Set(this.listBlocked(uid));
    return (this.db.guestbook ?? []).filter((g) => g.ownerId === ownerId && !blocked.has(g.authorId)).slice(-50).reverse().map((g) => ({ ...g }));
  }

  deleteGuestbookEntry(uid: string, id: string) {
    const p = this.requirePlayer(uid);
    const list = this.db.guestbook ?? [];
    const i = list.findIndex((g) => g.id === id && (g.authorId === uid || g.ownerId === uid || p.isAdmin));
    if (i < 0) throw new GameError('INVALID_TARGET');
    list.splice(i, 1);
  }

  // ── 과일 나무 ───────────────────────────────────────
  private picks(uid: string) {
    this.db.fruitPicks ??= {};
    const mine = (this.db.fruitPicks[uid] ??= {});
    const since = this.now() - FRUIT_COOLDOWN_SEC * 1000;
    return Object.fromEntries(Object.entries(mine).filter(([, t]) => t > since));
  }

  fruitStatus(uid: string) {
    this.requirePlayer(uid);
    return { picks: this.picks(uid), serverNow: this.now() };
  }

  pickFruit(uid: string, treeId: string, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const tree = FRUIT_TREES.find((t) => t.id === treeId);
    if (!tree) throw new GameError('INVALID_TARGET');
    if (tree.place === 'village' && p.currentSpace !== 'village') throw new GameError('WRONG_SPACE');
    if (tree.place === 'farm' && p.currentSpace !== 'farm:' + uid) throw new GameError('NOT_OWNER');
    if (this.picks(uid)[treeId]) throw new GameError('FRUIT_NOT_READY');
    this.db.fruitPicks![uid][treeId] = this.now();
    p.gold += FRUIT_REWARD;
    const r = { ...this.result(uid, FRUIT_REWARD, false), fruitPicks: this.picks(uid) };
    this.db.tx.push({ playerId: uid, requestId, kind: 'fruit', cropId: null, itemId: 'fruit:' + tree.fruit, quantity: 1, goldDelta: FRUIT_REWARD, createdAt: this.now(), result: r });
    return r;
  }

  // ── 친구 밭 물 주기 ─────────────────────────────────
  private waters(uid: string) {
    this.db.waterLogs ??= {};
    const mine = (this.db.waterLogs[uid] ??= {});
    const since = this.now() - WATER.cooldownSec * 1000;
    return Object.fromEntries(Object.entries(mine).filter(([, t]) => t > since));
  }
  waterStatus(uid: string) {
    this.requirePlayer(uid);
    return { logs: this.waters(uid), serverNow: this.now() };
  }
  waterCrop(uid: string, ownerId: string, _x: number, _y: number, requestId: string): WaterResult {
    const p = this.requirePlayer(uid);
    const c = this.db.tx.find((t) => t.playerId === uid && t.requestId === requestId);
    if (c?.result) return c.result as unknown as WaterResult;
    const farm = this.db.farms[ownerId];
    if (!farm) throw new GameError('INVALID_TARGET');
    if (ownerId === uid) throw new GameError('OWN_FARM_WATER');
    if (p.currentSpace !== 'farm:' + ownerId) throw new GameError('WRONG_SPACE');
    if (this.waters(uid)[ownerId]) throw new GameError('WATER_COOLDOWN');
    // 자라는 중인 작물 전부 5분 단축 (x, y 는 쓰지 않음)
    const growing = farm.crops.filter((k) => k.readyAt > this.now());
    if (!growing.length) throw new GameError('NOTHING_TO_WATER');
    growing.forEach((k) => { k.readyAt = Math.max(this.now(), k.readyAt - WATER.reduceSec * 1000); });
    this.db.waterLogs![uid][ownerId] = this.now();
    this.db.notices ??= [];
    this.db.noticeSeq = (this.db.noticeSeq ?? 0) + 1;
    this.db.notices.push({ id: this.db.noticeSeq, userId: ownerId, kind: 'water', createdAt: this.now(),
      body: `${p.nickname}님이 내 밭에 물을 줬어요! 💧 (자라는 작물 ${growing.length}개 수확 5분 단축)` });
    if (this.db.notices.length > 500) this.db.notices.splice(0, this.db.notices.length - 500);
    const r: WaterResult = { farm: this.farmState(ownerId), waterLogs: this.waters(uid), count: growing.length, cropId: null, serverNow: this.now() };
    this.db.tx.push({ playerId: uid, requestId, kind: 'water', cropId: null, quantity: growing.length, goldDelta: 0, createdAt: this.now(), result: r as unknown as EconomyResult });
    return r;
  }

  listNotices(uid: string, afterId: number) {
    this.requirePlayer(uid);
    return (this.db.notices ?? []).filter((n) => n.userId === uid && n.id > afterId).slice(-20)
      .map((n) => ({ id: n.id, kind: n.kind, body: n.body, createdAt: n.createdAt }));
  }

  // ── 상점 품목 ───────────────────────────────────────
  buyItem(uid: string, itemId: string, color: number, qty: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const fert = FERT_MAP[itemId], rod = ROD_MAP[itemId], furn = FURN_MAP[itemId];
    const price = fert?.price ?? rod?.price ?? furn?.price;
    if (!price) throw new GameError('UNKNOWN_ITEM');
    if (!isValidQty(qty, 99)) throw new GameError('INVALID_QTY');
    let inv = itemId;
    if (furn) {
      if (!Number.isInteger(color) || color < 0 || color >= FURNITURE_COLORS.length) throw new GameError('INVALID_COLOR');
      if (qty > 10) throw new GameError('INVALID_QTY');
      inv = `${itemId}:${color}`;
    } else if (rod) {
      if (qty !== 1) throw new GameError('INVALID_QTY');
      if ((this.inv(uid)[itemId] ?? 0) > 0) throw new GameError('ALREADY_OWNED');
    }
    const cost = price * qty;
    if (p.gold < cost) throw new GameError('INSUFFICIENT_GOLD');
    p.gold -= cost;
    this.addItem(uid, inv, qty);
    if (rod) ((this.db.rodUses ??= {})[uid] ??= {})[itemId] = rod.uses;
    const r = { ...this.result(uid, -cost, false), rodUses: this.rodUses(uid) };
    this.log(uid, requestId, 'buy', null, qty, -cost, r);
    return r;
  }

  private rodUses(uid: string): Record<string, number> {
    const mine = this.db.rodUses?.[uid] ?? {};
    return Object.fromEntries(RODS.filter((r) => (this.inv(uid)[r.id] ?? 0) > 0).map((r) => [r.id, mine[r.id] ?? r.uses]));
  }
  rodStatus(uid: string) {
    this.requirePlayer(uid);
    return this.rodUses(uid);
  }

  sellItem(uid: string, itemId: string, qty: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const f = itemId.startsWith('fish:') ? FISH_MAP[itemId.slice(5)] : undefined;
    if (!f) throw new GameError('UNKNOWN_ITEM');
    if (!isValidQty(qty, 9999)) throw new GameError('INVALID_QTY');
    this.addItem(uid, itemId, -qty);
    const gain = f.price * qty;
    p.gold += gain;
    this.db.stats[uid].totalSalesGold += gain;
    this.db.stats[uid].totalSold += qty;
    const r = this.result(uid, gain, false);
    this.log(uid, requestId, 'sell', null, qty, gain, r);
    return r;
  }

  // ── 낚시 ───────────────────────────────────────────
  fishCast(uid: string, rng: () => number = Math.random) {
    const p = this.requirePlayer(uid);
    if (p.currentSpace !== 'village' && !isFarmSpace(p.currentSpace)) throw new GameError('NO_WATER_HERE');
    const tier = Math.max(0, ...RODS.filter((r) => (this.inv(uid)[r.id] ?? 0) > 0).map((r) => r.tier));
    if (!tier) throw new GameError('NO_ROD');
    const biteAt = this.now() + Math.round((8 + rng() * 12) * 1000);
    (this.db.fishing ??= {})[uid] = { tier, biteAt };
    return { biteAt, serverNow: this.now(), tier };
  }

  fishReel(uid: string, requestId: string, rng: () => number = Math.random): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const s = this.db.fishing?.[uid];
    if (!s) throw new GameError('NOT_FISHING');
    if (this.now() < s.biteAt) throw new GameError('FISH_TOO_EARLY');
    delete this.db.fishing![uid];
    const escaped = this.now() > s.biteAt + 4000;
    // 낚든 놓치든 낚싯대 1회 사용, 다 쓰면 사라짐
    const rodId = `rod:${s.tier}`;
    let rodBroken = false;
    if ((this.inv(uid)[rodId] ?? 0) > 0) {
      const mine = ((this.db.rodUses ??= {})[uid] ??= {});
      const left = (mine[rodId] ?? ROD_MAP[rodId].uses) - 1;
      if (left <= 0) { delete mine[rodId]; this.addItem(uid, rodId, -1); rodBroken = true; } else mine[rodId] = left;
    }
    let fish: string | null = null;
    if (!escaped) {
      const w = FISH_WEIGHTS[s.tier];
      const ids = Object.keys(w).sort();
      const total = ids.reduce((a, k) => a + w[k], 0);
      const roll = Math.floor(rng() * total);
      let acc = 0;
      fish = ids[0];
      for (const k of ids) { acc += w[k]; if (roll < acc) { fish = k; break; } }
      this.addItem(uid, `fish:${fish}`, 1);
    }
    const r = { ...this.result(uid, 0, false), fish, escaped, rodId, rodBroken, rodUses: this.rodUses(uid) };
    this.log(uid, requestId, 'fish', null, escaped ? 0 : 1, 0, r);
    return r;
  }

  // ── 비료 ───────────────────────────────────────────
  useFertilizer(uid: string, x: number, y: number, itemId: string, requestId: string): EconomyResult {
    this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const f = FERT_MAP[itemId];
    if (!f) throw new GameError('UNKNOWN_ITEM');
    const crop = this.db.farms[uid].crops.find((k) => k.x === x && k.y === y); // 내 밭에만
    if (!crop) throw new GameError('PLOT_EMPTY');
    if (crop.readyAt <= this.now()) throw new GameError('CROP_ALREADY_READY');
    if (crop.fertilized) throw new GameError('ALREADY_FERTILIZED');
    if ((this.inv(uid)[itemId] ?? 0) < 1) throw new GameError('NO_FERTILIZER');
    this.addItem(uid, itemId, -1);
    crop.readyAt = Math.max(this.now(), crop.readyAt - f.minutes * 60_000);
    crop.fertilized = true;
    const r = this.result(uid, 0, true);
    this.log(uid, requestId, 'fertilize', null, 1, 0, r);
    return r;
  }

  // ── 집 / 가구 ──────────────────────────────────────
  private houseDb(ownerId: string) {
    this.db.houses ??= {};
    return (this.db.houses[ownerId] ??= { level: 1, items: [] });
  }
  private houseState(ownerId: string): HouseState {
    const p = this.db.profiles[ownerId];
    if (!p) throw new GameError('INVALID_TARGET');
    const h = this.houseDb(ownerId);
    const lv = HOUSE_LEVELS.find((l) => l.level === h.level)!;
    return { ownerId, ownerNickname: p.nickname, level: h.level, w: lv.w, h: lv.h, items: h.items.map((i) => ({ ...i })) };
  }
  getHouse(uid: string, ownerId: string) {
    this.requirePlayer(uid);
    return this.houseState(ownerId);
  }
  expandHouse(uid: string, targetLevel: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    const h = this.houseDb(uid);
    if (h.level >= MAX_HOUSE_LEVEL) throw new GameError('MAX_LEVEL');
    if (targetLevel !== h.level + 1) throw new GameError('INVALID_LEVEL');
    const def = HOUSE_LEVELS.find((l) => l.level === targetLevel)!;
    if (p.gold < def.cost) throw new GameError('INSUFFICIENT_GOLD');
    p.gold -= def.cost;
    h.level = targetLevel;
    const r = { ...this.result(uid, -def.cost, false), house: this.houseState(uid) };
    this.log(uid, requestId, 'house_expand', null, targetLevel, -def.cost, r);
    return r;
  }
  placeFurniture(uid: string, furnId: string, color: number, x: number, y: number, requestId: string): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    if (p.currentSpace !== `house:${uid}`) throw new GameError('NOT_IN_HOUSE');
    const h = this.houseDb(uid);
    if (h.items.length >= HOUSE_MAX_ITEMS) throw new GameError('HOUSE_FULL');
    if (!canPlace(this.houseState(uid), furnId, x, y)) throw new GameError('CANT_PLACE');
    const item = `${furnId}:${color}`;
    if (!parseFurnItem(item) || (this.inv(uid)[item] ?? 0) < 1) throw new GameError('NO_FURNITURE');
    this.addItem(uid, item, -1);
    this.db.houseSeq = (this.db.houseSeq ?? 0) + 1;
    h.items.push({ id: this.db.houseSeq, type: furnId, color, x, y });
    const r = { ...this.result(uid, 0, false), house: this.houseState(uid) };
    this.log(uid, requestId, 'furniture', null, 1, 0, r);
    return r;
  }
  moveFurniture(uid: string, id: number, x: number, y: number) {
    this.requirePlayer(uid);
    const it = this.houseDb(uid).items.find((i) => i.id === id);
    if (!it) throw new GameError('INVALID_TARGET');
    if (!canPlace(this.houseState(uid), it.type, x, y, id)) throw new GameError('CANT_PLACE');
    it.x = x; it.y = y;
    return { house: this.houseState(uid) };
  }
  storeFurniture(uid: string, id: number): EconomyResult {
    this.requirePlayer(uid);
    const h = this.houseDb(uid);
    const it = h.items.find((i) => i.id === id);
    if (!it) throw new GameError('INVALID_TARGET');
    h.items = h.items.filter((i) => i !== it);
    this.addItem(uid, `${it.type}:${it.color}`, 1);
    return { ...this.result(uid, 0, false), house: this.houseState(uid) };
  }

  // ── 분수 소원 ───────────────────────────────────────
  makeWish(uid: string) {
    const p = this.requirePlayer(uid);
    if (p.currentSpace !== 'village') throw new GameError('WRONG_SPACE');
    this.db.wishLogs ??= {};
    const last = this.db.wishLogs[uid];
    if (last && this.now() - last < WISH.cooldownSec * 1000) throw new GameError('WISH_COOLDOWN');
    this.db.wishLogs[uid] = this.now();
    p.gold += WISH.reward; // 확률 없이 확정 보상
    return { won: true, reward: WISH.reward, gold: p.gold };
  }

  // ── 햇살 카지노 ─────────────────────────────────────
  private casinoDb() {
    this.db.casino ??= { seq: 1, open: { id: 1, bets: [] }, last: null };
    return this.db.casino;
  }
  private casinoCleanup() {
    const c = this.casinoDb();
    const limit = this.now() - CASINO.idleRefundSec * 1000;
    for (const b of [...c.open.bets]) {
      if (!b.ready && b.updatedAt < limit) {
        if (this.db.profiles[b.playerId]) this.db.profiles[b.playerId].gold += b.amount;
        c.open.bets = c.open.bets.filter((x) => x !== b);
      }
    }
    if (!c.open.bets.length) c.open.stake = null; // 아무도 없으면 참가비 초기화
  }
  casinoState(uid: string): CasinoState {
    const p = this.requirePlayer(uid);
    this.casinoCleanup();
    const c = this.casinoDb();
    const strip = (b: CasinoBet) => ({ playerId: b.playerId, nickname: b.nickname, amount: b.amount, ready: b.ready });
    return {
      serverNow: this.now(),
      gold: p.gold,
      round: { id: c.open.id, pot: c.open.bets.reduce((a, b) => a + b.amount, 0), stake: c.open.bets.length ? c.open.stake ?? null : null, bets: c.open.bets.map(strip) },
      last: c.last ? { ...c.last, bets: c.last.bets.map(strip) } : null,
    };
  }
  // ── 밤 · 마을 거지 ─────────────────────────────────
  private robbedToday(uid: string) {
    const day = kstDate(this.now());
    return (this.db.beggarRobs?.[uid] ?? []).filter((k) => k.startsWith(`${day}:`)).map((k) => Number(k.split(':')[1])).sort((a, b) => a - b);
  }
  beggarStatus(uid: string) {
    this.requirePlayer(uid);
    return { robbed: this.robbedToday(uid), serverNow: this.now() };
  }
  /** 방금 뜯긴 사람의 마을 채팅 (다른 탭에 전달) */
  lastRobMsg: ChatMessage | null = null;
  beggarRob(uid: string, beggarId: number, requestId: string, rng: () => number = Math.random): EconomyResult {
    const p = this.requirePlayer(uid);
    const c = this.cached(uid, requestId);
    if (c) return c;
    if (!BEGGARS.some((b) => b.id === beggarId)) throw new GameError('INVALID_TARGET');
    if (p.currentSpace !== 'village') throw new GameError('WRONG_SPACE');
    if (!dayPhase(this.now()).night) throw new GameError('NOT_NIGHT');
    if (this.robbedToday(uid).includes(beggarId)) throw new GameError('ALREADY_ROBBED');
    const amount = Math.min((1 + Math.floor(rng() * 10)) * 100, Math.floor(p.gold / 100) * 100); // 100~1000G, 100G 단위
    p.gold -= amount;
    ((this.db.beggarRobs ??= {})[uid] ??= []).push(`${kstDate(this.now())}:${beggarId}`);
    const msg: ChatMessage = {
      id: `rob-${this.now()}-${uid.slice(0, 4)}`, senderId: uid, nickname: p.nickname, space: 'village', createdAt: this.now(),
      body: amount > 0 ? `💸 마을 거지에게 돈을 갈취당했습니다! (-${amount}G)` : '💸 마을 거지가 주머니를 뒤졌지만 텅 비어 있었어요…',
    };
    this.db.chat.push(msg);
    this.lastRobMsg = msg;
    const r = { ...this.result(uid, -amount, false), amount, robbed: this.robbedToday(uid) };
    this.log(uid, requestId, 'robbed', null, beggarId, -amount, r);
    return r;
  }

  /** 방금 판을 연 사람의 모집 채팅 (체험 모드에서 다른 탭에 전달하기 위해) */
  lastRecruit: ChatMessage | null = null;

  casinoJoin(uid: string, stake: number, requestId: string): CasinoState {
    const p = this.requirePlayer(uid);
    const cached = this.db.tx.find((x) => x.playerId === uid && x.requestId === requestId);
    if (cached) return this.casinoState(uid);
    if (p.currentSpace !== 'village') throw new GameError('WRONG_SPACE');
    this.casinoCleanup();
    const c = this.casinoDb();
    if (c.open.bets.some((b) => b.playerId === uid)) throw new GameError('CASINO_ALREADY_JOINED');
    const isNew = c.open.bets.length === 0;
    if (isNew) {
      if (!Number.isInteger(stake) || stake < CASINO.minBet || stake > CASINO.maxBet) throw new GameError('CASINO_BAD_AMOUNT');
      c.open.stake = stake;
    } else {
      if (c.open.bets.length >= CASINO.maxPlayers) throw new GameError('CASINO_FULL');
      if (stake !== c.open.stake) throw new GameError('CASINO_STAKE_CHANGED');
    }
    const amount = c.open.stake!;
    if (p.gold < amount) { if (isNew) c.open.stake = null; throw new GameError('INSUFFICIENT_GOLD'); }
    p.gold -= amount;
    c.open.bets.push({ playerId: uid, nickname: p.nickname, amount, ready: false, joinedAt: this.now(), updatedAt: this.now() });
    c.open.bets.forEach((b) => { b.ready = false; }); // 새 사람이 왔으니 모두 다시 준비
    this.db.tx.push({ playerId: uid, requestId, kind: 'casino_bet', cropId: null, quantity: 0, goldDelta: -amount, createdAt: this.now(), result: null });
    if (isNew) {
      const msg: ChatMessage = {
        id: `casino-${this.now()}-${uid.slice(0, 4)}`, senderId: uid, nickname: p.nickname, space: 'village', createdAt: this.now(),
        body: `🎰 카지노에서 ${amount.toLocaleString()}G 판을 모집해요! 같이 하실 분은 광장 동쪽 카지노로 와 주세요 🙌`,
      };
      this.db.chat.push(msg);
      this.lastRecruit = msg;
    }
    return this.casinoState(uid);
  }
  casinoLeave(uid: string, requestId: string): CasinoState {
    const p = this.requirePlayer(uid);
    const cached = this.db.tx.find((x) => x.playerId === uid && x.requestId === requestId);
    if (cached) return this.casinoState(uid);
    const c = this.casinoDb();
    const mine = c.open.bets.find((b) => b.playerId === uid);
    if (!mine) throw new GameError('CASINO_NOT_JOINED');
    p.gold += mine.amount;
    c.open.bets = c.open.bets.filter((b) => b !== mine);
    c.open.bets.forEach((b) => { b.ready = false; });
    if (!c.open.bets.length) c.open.stake = null;
    this.db.tx.push({ playerId: uid, requestId, kind: 'casino_refund', cropId: null, quantity: 0, goldDelta: mine.amount, createdAt: this.now(), result: null });
    return this.casinoState(uid);
  }
  casinoReady(uid: string, ready: boolean, rng: () => number = Math.random): CasinoState {
    this.requirePlayer(uid);
    this.casinoCleanup();
    const c = this.casinoDb();
    const mine = c.open.bets.find((b) => b.playerId === uid);
    if (!mine) throw new GameError('CASINO_NOT_JOINED');
    mine.ready = !!ready;
    mine.updatedAt = this.now();
    const bets = c.open.bets;
    if (bets.length >= 2 && bets.every((b) => b.ready)) {
      const total = bets.reduce((a, b) => a + b.amount, 0);
      const roll = rng();
      let acc = 0;
      let winner = bets[bets.length - 1];
      for (const b of bets) { acc += b.amount; if (roll * total < acc) { winner = b; break; } }
      if (this.db.profiles[winner.playerId]) this.db.profiles[winner.playerId].gold += total;
      c.last = { id: c.open.id, pot: total, roll, winnerId: winner.playerId, winnerNickname: winner.nickname, resolvedAt: this.now(), bets: bets.map((b) => ({ ...b })) };
      c.seq += 1;
      c.open = { id: c.seq, stake: null, bets: [] };
    }
    return this.casinoState(uid);
  }

  listBlocked(uid: string) {
    return this.db.blocks.filter((b) => b.userId === uid).map((b) => b.targetId);
  }
}
