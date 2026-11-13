/**
 * 과일 나무 / 카지노 설정.
 * ⚠ 과일 나무 목록은 supabase 마이그레이션의 fruit_trees 시드, 그리고 지도(game/maps)의 과일 나무 위치와 같아야 해요.
 *   (tests/unit/configSync.test.ts 가 세 곳이 일치하는지 자동으로 확인합니다)
 */
export const FRUIT_REWARD = 30;
export const FRUIT_COOLDOWN_SEC = 30 * 60;

export type FruitKind = 'apple' | 'peach';
export const FRUIT_NAMES: Record<FruitKind, string> = { apple: '사과', peach: '복숭아' };

export interface FruitTreeDef { id: string; place: 'village' | 'farm'; fruit: FruitKind }

export const FRUIT_TREES: FruitTreeDef[] = [
  { id: 'v:4,31', place: 'village', fruit: 'peach' }, { id: 'v:7,33', place: 'village', fruit: 'apple' },
  { id: 'v:4,35', place: 'village', fruit: 'peach' }, { id: 'v:7,37', place: 'village', fruit: 'apple' },
  { id: 'v:10,38', place: 'village', fruit: 'peach' }, { id: 'v:51,5', place: 'village', fruit: 'peach' },
  { id: 'v:53,8', place: 'village', fruit: 'apple' }, { id: 'v:50,9', place: 'village', fruit: 'peach' },
  { id: 'f:4,14', place: 'farm', fruit: 'peach' }, { id: 'f:8,22', place: 'farm', fruit: 'apple' },
  { id: 'f:27,13', place: 'farm', fruit: 'peach' }, { id: 'f:30,9', place: 'farm', fruit: 'apple' },
  { id: 'f:24,23', place: 'farm', fruit: 'peach' }, { id: 'f:2,20', place: 'farm', fruit: 'apple' },
];

export const CASINO = {
  minBet: 10,
  maxBet: 1_000_000,
  maxPlayers: 8,
  /** 준비하지 않은 채 이 시간이 지나면 자동 환불 후 퇴장 */
  idleRefundSec: 5 * 60,
  spinMs: 4800,
};

/** 친구 밭에 물 주기: 한 칸의 수확까지 시간 5분 단축, 친구마다 30분에 한 번 */
export const WATER = { reduceSec: 5 * 60, cooldownSec: 30 * 60 };
/** 분수 소원: 1분에 한 번, 빌 때마다 30G 확정 */
export const WISH = { cooldownSec: 60, reward: 30 };
