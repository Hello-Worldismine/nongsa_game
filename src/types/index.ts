import type { Appearance } from '@/config/appearance';
import type { SpaceKey } from '@/config/game';

export type Direction = 'down' | 'up' | 'left' | 'right';

export interface AuthUser {
  id: string;
  email: string;
}

export interface PlayerSettings {
  volume: number; // 0..1
  muted: boolean;
  showChatLog: boolean;
}

export const DEFAULT_SETTINGS: PlayerSettings = { volume: 0.6, muted: false, showChatLog: true };

export interface Profile {
  id: string;
  nickname: string;
  appearance: Appearance;
  gold: number;
  tutorialStep: number;
  settings: PlayerSettings;
  isAdmin?: boolean;
}

export interface PlantedCrop {
  x: number;
  y: number;
  cropId: string;
  plantedAt: number; // epoch ms (server clock)
  readyAt: number; // epoch ms (server clock)
  /** 비료를 줬음 (한 칸에 한 번만) */
  fertilized?: boolean;
}

export interface FarmState {
  ownerId: string;
  ownerNickname: string;
  level: number;
  size: number;
  crops: PlantedCrop[];
}

export type Inventory = Record<string, number>;

export interface PlayerStats {
  totalHarvests: number;
  totalPlanted: number;
  totalSalesGold: number;
  totalSold: number;
  cropHarvests: Record<string, number>;
  sessions: number;
  firstPlayedAt: number | null;
}

export interface PlayerState {
  profile: Profile;
  inventory: Inventory;
  farm: FarmState;
  stats: PlayerStats;
  serverNow: number;
}

export interface Resident {
  id: string;
  nickname: string;
  appearance: Appearance;
  farmLevel: number;
  farmSize: number;
}

export interface QuestProgress {
  id: string;
  progress: number;
  claimed: boolean;
}

export type SlotStatus =
  | { status: 'ok'; slot: number }
  | { status: 'full'; max: number }
  | { status: 'not_approved' }
  | { status: 'inactive' };

export interface EconomyResult {
  gold: number;
  inventory: Inventory;
  farm?: FarmState;
  goldDelta?: number;
  serverNow: number;
  stats?: PlayerStats;
  /** 보관함 넣기/빼기 결과 */
  storage?: Inventory;
  /** 과일 따기 결과: 최근 30분 안에 딴 나무 → 딴 시각(ms) */
  fruitPicks?: Record<string, number>;
  /** 집 확장 / 가구 배치 결과 */
  house?: HouseState;
  /** 낚시 결과: 잡은 물고기 ID (놓치면 null) */
  fish?: string | null;
  /** 낚시: 물고기가 빠져나감 */
  escaped?: boolean;
  /** 가지고 있는 낚싯대 → 남은 횟수 */
  rodUses?: Record<string, number>;
  /** 거지에게 뜯긴 돈 / 오늘 나를 털어 간 거지 */
  amount?: number;
  robbed?: number[];
  /** 이번에 낚싯대를 다 썼음 */
  rodBroken?: boolean;
  rodId?: string;
}

/** 집 안에 놓인 가구 (x, y: 바닥 칸 좌표, 왼쪽 위 기준) */
export interface HouseItem { id: number; type: string; color: number; x: number; y: number }

export interface HouseState {
  ownerId: string;
  ownerNickname: string;
  level: number;
  /** 바닥 크기 (칸) */
  w: number;
  h: number;
  items: HouseItem[];
}

/** 개인 알림 (예: 누가 내 밭에 물을 줬는지) — 문구는 서버가 만듦 */
export interface Notice { id: number; kind: string; body: string; createdAt: number }

export interface WaterResult {
  farm: FarmState;
  /** 최근 30분 안에 내가 물 준 농장 주인 → 시각(ms) */
  waterLogs: Record<string, number>;
  /** 물을 준 작물 수 (밭 전체) */
  count: number;
  cropId: string | null;
  serverNow: number;
}

export interface CasinoBet { playerId: string; nickname: string; amount: number; ready: boolean }

export interface CasinoState {
  serverNow: number;
  gold: number;
  /** stake: 이번 판 참가비 (아무도 없으면 null → 처음 참가하는 사람이 정함) */
  round: { id: number; pot: number; stake: number | null; bets: CasinoBet[] };
  last: { id: number; pot: number; roll: number; winnerId: string; winnerNickname: string; resolvedAt: number; bets: CasinoBet[] } | null;
}

export interface StorageLog { kind: 'deposit' | 'withdraw'; itemId: string; qty: number; at: number }

export interface StorageView {
  ownerId: string;
  ownerNickname: string;
  items: Inventory;
  recent: StorageLog[];
}

export interface GuestbookEntry {
  id: string;
  ownerId: string;
  authorId: string;
  nickname: string;
  body: string;
  createdAt: number;
}

export interface BoardPost {
  id: string;
  authorId: string;
  nickname: string;
  body: string;
  createdAt: number;
}

/** 실시간으로 주고받는 이동 데이터 */
export interface MovePacket {
  id: string;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  t: number;
  /** 걷는 방향의 속도 (-1..1, 걷기 속도 기준). 받는 쪽이 다음 패킷까지 움직임을 이어서 그림 */
  vx?: number;
  vy?: number;
}

export interface PresenceInfo {
  id: string;
  nickname: string;
  appearance: Appearance;
  x: number;
  y: number;
  dir: Direction;
  sessionId: string;
  joinedAt: number;
  space: SpaceKey;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  nickname: string;
  body: string;
  space: SpaceKey;
  createdAt: number;
  system?: boolean;
}

export type EmoteKind = 'heart' | 'wave' | 'hello' | 'note' | 'sit';

export interface EmotePacket {
  id: string;
  kind: EmoteKind;
}
