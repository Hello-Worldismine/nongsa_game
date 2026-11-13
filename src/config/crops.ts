/**
 * 작물 기준 데이터.
 * ⚠ 서버 기준값은 supabase/migrations 의 crop_types 시드와 같아야 합니다.
 *   (tests/unit/configSync.test.ts 가 두 값이 일치하는지 자동으로 확인합니다)
 */
export interface CropDef {
  id: string;
  name: string;
  seedPrice: number;
  growSeconds: number;
  sellPrice: number;
  /** 반복 수확 작물 확장용 (0 = 1회 수확 후 빈 밭) */
  regrowSeconds: number;
  description: string;
}

export const CROPS: CropDef[] = [
  { id: 'carrot', name: '당근', seedPrice: 20, growSeconds: 30, sellPrice: 35, regrowSeconds: 0, description: '아삭아삭 주황빛 당근이에요.' },
  { id: 'potato', name: '감자', seedPrice: 35, growSeconds: 60, sellPrice: 60, regrowSeconds: 0, description: '포슬포슬한 감자예요.' },
  { id: 'rice', name: '벼', seedPrice: 50, growSeconds: 120, sellPrice: 90, regrowSeconds: 0, description: '황금빛으로 익는 벼예요.' },
  { id: 'sweet_potato', name: '고구마', seedPrice: 80, growSeconds: 240, sellPrice: 145, regrowSeconds: 0, description: '달콤한 보랏빛 고구마예요.' },
  { id: 'tomato', name: '토마토', seedPrice: 110, growSeconds: 360, sellPrice: 200, regrowSeconds: 0, description: '새콤달콤 빨간 토마토예요.' },
  { id: 'corn', name: '옥수수', seedPrice: 150, growSeconds: 480, sellPrice: 275, regrowSeconds: 0, description: '키가 쑥쑥 자라는 옥수수예요.' },
  { id: 'strawberry', name: '딸기', seedPrice: 200, growSeconds: 600, sellPrice: 370, regrowSeconds: 0, description: '하얀 꽃 뒤에 열리는 딸기예요.' },
  { id: 'cabbage', name: '양배추', seedPrice: 250, growSeconds: 720, sellPrice: 470, regrowSeconds: 0, description: '동글동글 겹겹이 양배추예요.' },
  { id: 'pumpkin', name: '호박', seedPrice: 300, growSeconds: 900, sellPrice: 570, regrowSeconds: 0, description: '통통한 주황 호박이에요.' },
  { id: 'watermelon', name: '수박', seedPrice: 450, growSeconds: 1200, sellPrice: 880, regrowSeconds: 0, description: '줄무늬가 예쁜 커다란 수박이에요.' },
];

export const CROP_MAP: Record<string, CropDef> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

export const seedItemId = (cropId: string) => `seed:${cropId}`;
export const cropItemId = (cropId: string) => `crop:${cropId}`;

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}초`;
  if (r === 0) return `${m}분`;
  return `${m}분 ${r}초`;
}
