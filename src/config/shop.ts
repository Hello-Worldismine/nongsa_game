/**
 * 상점 품목 (비료 · 낚싯대 · 가구) / 물고기 / 집 확장 단계.
 * ⚠ 서버 기준값은 supabase/migrations/20261113070000_fishing_fertilizer_house.sql 과 같아야 합니다.
 *   (tests/unit/configSync.test.ts 가 자동으로 비교합니다)
 */

// ───────────────────────── 비료 ─────────────────────────
export interface FertilizerDef { id: string; name: string; price: number; minutes: number; desc: string }
export const FERTILIZERS: FertilizerDef[] = [
  { id: 'fert:4', name: '4분 비료', price: 20, minutes: 4, desc: '자라는 작물 한 칸의 수확 시간을 4분 줄여 줘요.' },
  { id: 'fert:10', name: '10분 비료', price: 50, minutes: 10, desc: '자라는 작물 한 칸의 수확 시간을 10분이나 줄여 줘요!' },
];
export const FERT_MAP: Record<string, FertilizerDef> = Object.fromEntries(FERTILIZERS.map((f) => [f.id, f]));

// ───────────────────────── 낚시 ─────────────────────────
export interface RodDef { id: string; name: string; price: number; tier: number; /** 쓸 수 있는 횟수 */ uses: number; desc: string }
/** 낚싯대는 소모품: 낚거나 놓칠 때마다 1회. 다 쓸 때까지 낚은 물고기를 팔면 구매가보다 이득이 나도록 설계 */
export const RODS: RodDef[] = [
  { id: 'rod:1', name: '나무 낚싯대', price: 80, tier: 1, uses: 10, desc: '처음 낚시하기 좋은 나무 낚싯대.' },
  { id: 'rod:2', name: '대나무 낚싯대', price: 300, tier: 2, uses: 20, desc: '가볍고 잘 휘어서 송어·연어도 가끔 낚여요.' },
  { id: 'rod:3', name: '은빛 낚싯대', price: 900, tier: 3, uses: 30, desc: '반짝이는 은빛! 뱀장어와 황금잉어도 노려 봐요.' },
  { id: 'rod:4', name: '황금 낚싯대', price: 2000, tier: 4, uses: 40, desc: '전설의 낚싯대. 비싼 물고기가 아주 잘 잡혀요!' },
];
export const ROD_MAP: Record<string, RodDef> = Object.fromEntries(RODS.map((r) => [r.id, r]));

export interface FishDef { id: string; name: string; price: number }
export const FISH: FishDef[] = [
  { id: 'minnow', name: '피라미', price: 6 },
  { id: 'crucian', name: '붕어', price: 12 },
  { id: 'carp', name: '잉어', price: 25 },
  { id: 'catfish', name: '메기', price: 45 },
  { id: 'trout', name: '송어', price: 70 },
  { id: 'salmon', name: '연어', price: 120 },
  { id: 'eel', name: '뱀장어', price: 200 },
  { id: 'goldfish', name: '황금잉어', price: 500 },
];
export const FISH_MAP: Record<string, FishDef> = Object.fromEntries(FISH.map((f) => [f.id, f]));
export const fishItemId = (id: string) => `fish:${id}`;

/** 낚싯대 등급 → 물고기 가중치 (서버 fish_weights 와 같음) */
export const FISH_WEIGHTS: Record<number, Record<string, number>> = {
  1: { minnow: 45, crucian: 35, carp: 15, catfish: 5 },
  2: { minnow: 25, crucian: 30, carp: 25, catfish: 12, trout: 6, salmon: 2 },
  3: { minnow: 10, crucian: 20, carp: 25, catfish: 20, trout: 13, salmon: 8, eel: 3, goldfish: 1 },
  4: { minnow: 5, crucian: 10, carp: 18, catfish: 22, trout: 18, salmon: 15, eel: 8, goldfish: 4 },
};

export const FISHING = {
  /** 찌를 던진 뒤 입질까지 (서버가 정함) */
  minWaitSec: 8,
  maxWaitSec: 20,
  /** 입질 후 이 시간 안에 E (화면 기준, 서버는 통신 지연을 감안해 1초 더 기다려 줌) */
  biteWindowMs: 3000,
};

/** 가방에서 가장 좋은 낚싯대 */
export function bestRod(inv: Record<string, number>): RodDef | null {
  let best: RodDef | null = null;
  for (const r of RODS) if ((inv[r.id] ?? 0) > 0 && (!best || r.tier > best.tier)) best = r;
  return best;
}

/** 한 번 낚을 때 평균 판매액 (G) */
export function fishAvgValue(tier: number): number {
  const w = FISH_WEIGHTS[tier] ?? {};
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return FISH.reduce((a, f) => a + (w[f.id] ?? 0) * f.price, 0) / total;
}

/** 확률표: 등급별 물고기 확률(%) */
export function fishOdds(tier: number): { fish: FishDef; pct: number }[] {
  const w = FISH_WEIGHTS[tier] ?? {};
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return FISH.filter((f) => w[f.id]).map((f) => ({ fish: f, pct: Math.round((w[f.id] / total) * 1000) / 10 }));
}

// ───────────────────────── 가구 ─────────────────────────
export interface FurnitureDef { id: string; type: string; name: string; price: number; w: number; h: number; walkable: boolean; desc: string }
export const FURNITURE: FurnitureDef[] = [
  { id: 'furn:bed', type: 'bed', name: '포근 침대', price: 400, w: 1, h: 2, walkable: false, desc: '구름처럼 폭신한 이불이 덮인 침대.' },
  { id: 'furn:sofa', type: 'sofa', name: '말랑 소파', price: 600, w: 2, h: 1, walkable: false, desc: '둘이 앉아도 넉넉한 말랑말랑 소파.' },
  { id: 'furn:chair', type: 'chair', name: '나무 의자', price: 120, w: 1, h: 1, walkable: false, desc: '방석이 붙은 아담한 나무 의자.' },
  { id: 'furn:table', type: 'table', name: '동그란 탁자', price: 200, w: 1, h: 1, walkable: false, desc: '차 한 잔 올려 두기 좋은 동그란 탁자.' },
  { id: 'furn:desk', type: 'desk', name: '작은 책상', price: 350, w: 2, h: 1, walkable: false, desc: '서랍 달린 귀여운 책상.' },
  { id: 'furn:bookshelf', type: 'bookshelf', name: '책장', price: 500, w: 2, h: 1, walkable: false, desc: '알록달록 책이 가득한 책장.' },
  { id: 'furn:wardrobe', type: 'wardrobe', name: '옷장', price: 450, w: 1, h: 1, walkable: false, desc: '하트 손잡이가 달린 키 큰 옷장.' },
  { id: 'furn:lamp', type: 'lamp', name: '스탠드 조명', price: 180, w: 1, h: 1, walkable: false, desc: '따뜻한 빛을 내는 스탠드.' },
  { id: 'furn:plant', type: 'plant', name: '화분', price: 100, w: 1, h: 1, walkable: false, desc: '쑥쑥 자라는 초록 화분.' },
  { id: 'furn:teddy', type: 'teddy', name: '곰인형', price: 150, w: 1, h: 1, walkable: false, desc: '꼬옥 안아 주고 싶은 곰인형.' },
  { id: 'furn:rug', type: 'rug', name: '폭신 러그', price: 300, w: 2, h: 2, walkable: true, desc: '밟고 지나갈 수 있는 동그란 러그. 위에 가구도 올릴 수 있어요.' },
  { id: 'furn:cushion', type: 'cushion', name: '방석', price: 80, w: 1, h: 1, walkable: true, desc: '바닥에 두는 폭신 방석. 밟고 지나갈 수 있어요.' },
];
export const FURN_MAP: Record<string, FurnitureDef> = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

/** 가구 색상 (캐릭터 옷 색처럼 8가지) */
export const FURNITURE_COLORS = [
  { name: '딸기우유', base: '#f2a0b4' },
  { name: '하늘', base: '#86bde8' },
  { name: '새싹', base: '#94d070' },
  { name: '레몬', base: '#f4d46a' },
  { name: '라벤더', base: '#b9a0e4' },
  { name: '민트', base: '#82d6c4' },
  { name: '복숭아', base: '#f6a986' },
  { name: '우유', base: '#f3ece0' },
];

/** 가방 아이템 ID: furn:bed:3 */
export const furnItemId = (furnId: string, color: number) => `${furnId}:${color}`;
export function parseFurnItem(itemId: string): { def: FurnitureDef; color: number } | null {
  const m = /^(furn:[a-z]+):(\d)$/.exec(itemId);
  if (!m) return null;
  const def = FURN_MAP[m[1]];
  const color = Number(m[2]);
  return def && color >= 0 && color < FURNITURE_COLORS.length ? { def, color } : null;
}

// ───────────────────────── 집 ─────────────────────────
export interface HouseLevelDef { level: number; w: number; h: number; cost: number }
export const HOUSE_LEVELS: HouseLevelDef[] = [
  { level: 1, w: 6, h: 4, cost: 0 },
  { level: 2, w: 8, h: 5, cost: 1500 },
  { level: 3, w: 10, h: 6, cost: 4000 },
  { level: 4, w: 12, h: 7, cost: 10000 },
  { level: 5, w: 14, h: 8, cost: 25000 },
];
export const MAX_HOUSE_LEVEL = HOUSE_LEVELS[HOUSE_LEVELS.length - 1].level;
export const HOUSE_MAX_ITEMS = 80;

/** 집 안 문 앞 칸 (아래쪽 가운데) — 밟는 가구만 둘 수 있음 */
export const doorTile = (w: number, h: number) => ({ x: Math.floor(w / 2), y: h - 1 });

/** 서버 _house_fits 와 같은 배치 규칙 */
export function canPlace(
  house: { w: number; h: number; items: { id: number; type: string; x: number; y: number }[] },
  furnId: string, x: number, y: number, ignoreId?: number,
): boolean {
  const t = FURN_MAP[furnId];
  if (!t || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x + t.w > house.w || y + t.h > house.h) return false;
  const door = doorTile(house.w, house.h);
  if (!t.walkable && door.x >= x && door.x < x + t.w && door.y >= y && door.y < y + t.h) return false;
  return !house.items.some((i) => {
    if (i.id === ignoreId) return false;
    const s = FURN_MAP[i.type];
    if (!s || s.walkable !== t.walkable) return false;
    return i.x < x + t.w && x < i.x + s.w && i.y < y + t.h && y < i.y + s.h;
  });
}

/** 상점 품목 이름 (가방 / 알림용) */
export function shopItemName(itemId: string): string | null {
  if (FERT_MAP[itemId]) return FERT_MAP[itemId].name;
  if (ROD_MAP[itemId]) return ROD_MAP[itemId].name;
  if (itemId.startsWith('fish:')) return FISH_MAP[itemId.slice(5)]?.name ?? null;
  const f = parseFurnItem(itemId);
  if (f) return `${FURNITURE_COLORS[f.color].name} ${f.def.name}`;
  return null;
}
