import { create } from 'zustand';
import { GAME_CONFIG, type SpaceKey } from '@/config/game';
import type { ConnStatus } from '@/services/backend/types';
import {
  DEFAULT_SETTINGS, type AuthUser, type ChatMessage, type FarmState, type HouseState, type Inventory, type PlayerSettings,
  type PlayerStats, type PresenceInfo, type Profile,
} from '@/types';

export type Phase = 'boot' | 'auth' | 'recovery' | 'slot' | 'character' | 'loading' | 'playing' | 'kicked';
export type ModalKind =
  | 'shop' | 'market' | 'inventory' | 'residents' | 'board' | 'expand' | 'settings' | 'stats' | 'quests' | 'player' | 'help'
  | 'storage' | 'residentBoard' | 'guestbook' | 'casino' | 'houseExpand' | 'notice';

export interface Toast { id: number; text: string; kind: 'info' | 'success' | 'error' | 'gold' }

export interface GameStore {
  phase: Phase;
  user: AuthUser | null;
  slotMessage: string | null;
  profile: Profile | null;
  inventory: Inventory;
  myFarm: FarmState | null;
  stats: PlayerStats | null;
  serverOffset: number;
  space: SpaceKey;
  viewFarm: FarmState | null;
  traveling: boolean;
  travelText: string;
  online: PresenceInfo[];
  peers: PresenceInfo[];
  conn: ConnStatus;
  chatLog: ChatMessage[];
  blocked: string[];
  selectedSeed: string | null;
  modal: ModalKind | null;
  modalData: Record<string, unknown> | null;
  chatOpen: boolean;
  toasts: Toast[];
  settings: PlayerSettings;
  tutorialStep: number;
  busy: boolean;
  /** "E: 씨앗 상점 이용하기" 같은 상호작용 안내 */
  prompt: string | null;
  /** 작물 정보 툴팁 (화면 좌표) */
  hoverInfo: { title: string; lines: string[]; x: number; y: number; ready?: boolean } | null;
  /** 값이 바뀌면 게임 장면을 다시 시작 (공간 이동) */
  sceneNonce: number;
  /** 모바일 가상 방향키 입력 (-1..1) */
  touch: { x: number; y: number };
  arrival: 'start' | 'gate' | 'farm' | 'house';
  /** 마을 안에서 외형 수정 중인지 (true 면 캐릭터 화면에 "취소" 표시) */
  editingCharacter: boolean;
  /** 새 버전이 배포됨 (편할 때 새로고침 안내) */
  newVersion: boolean;
  /** 마을 정원 (서버 설정값) */
  maxPlayers: number;
  /** 최근 30분 안에 내가 딴 과일 나무 → 딴 시각(서버 ms) */
  fruitPicks: Record<string, number>;
  /** 최근 30분 안에 내가 물 준 친구 농장 → 시각(서버 ms) */
  waterLogs: Record<string, number>;
  /** 오늘 나를 이미 털어 간 거지 ID (그 거지는 더 안 쫓아옴) */
  beggarRobbed: number[];
  /** 가지고 있는 낚싯대 → 남은 횟수 (체력바) */
  rodUses: Record<string, number>;
  /** 퀵슬롯에서 고른 비료 (고르면 씨앗 선택은 풀림) */
  selectedFert: string | null;
  /** 지금 보고 있는 집 (집 안에 있을 때) */
  viewHouse: HouseState | null;
  /** 집 꾸미기 모드 (내 집에서만) */
  houseEdit: boolean;
  /** 놓으려는 가구 (새 가구 = itemId 있음 / 옮기기 = moveId 있음) */
  housePlacing: { furnId: string; color: number; moveId?: number } | null;
  /** 낚시 중: wait = 찌 기다리는 중, bite = 입질! */
  fishing: { phase: 'cast' | 'wait' | 'bite'; rodTier: number } | null;

  set:(p: Partial<GameStore>) => void;
  openModal: (m: ModalKind, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  addChat: (m: ChatMessage) => void;
}

let toastId = 1;

export const useGame = create<GameStore>((set, get) => ({
  phase: 'boot',
  user: null,
  slotMessage: null,
  profile: null,
  inventory: {},
  myFarm: null,
  stats: null,
  serverOffset: 0,
  space: 'village',
  viewFarm: null,
  traveling: false,
  travelText: '',
  online: [],
  peers: [],
  conn: 'connecting',
  chatLog: [],
  blocked: [],
  selectedSeed: null,
  modal: null,
  modalData: null,
  chatOpen: false,
  toasts: [],
  settings: { ...DEFAULT_SETTINGS },
  tutorialStep: 0,
  busy: false,
  prompt: null,
  hoverInfo: null,
  sceneNonce: 0,
  touch: { x: 0, y: 0 },
  arrival: 'start',
  editingCharacter: false,
  newVersion: false,
  maxPlayers: GAME_CONFIG.maxPlayers,
  fruitPicks: {},
  waterLogs: {},
  selectedFert: null,
  rodUses: {},
  beggarRobbed: [],
  viewHouse: null,
  houseEdit: false,
  housePlacing: null,
  fishing: null,

  set: (p) => set(p),
  openModal: (modal, modalData) => set({ modal, modalData: modalData ?? null }),
  closeModal: () => set({ modal: null, modalData: null }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 3800 : 2600);
  },
  addChat: (m) => {
    const log = get().chatLog;
    if (log.some((x) => x.id === m.id)) return;
    set({ chatLog: [...log.slice(-59), m] });
  },
}));

/** 서버 기준 현재 시각 (작물 성장 계산용) */
export const serverNow = () => Date.now() + useGame.getState().serverOffset;

/** 캐릭터 입력을 막아야 하는 상태인지 (채팅 입력, 창 열림, 이동 중) */
export const inputLocked = () => {
  const s = useGame.getState();
  return s.chatOpen || s.modal !== null || s.traveling || s.phase !== 'playing';
};
