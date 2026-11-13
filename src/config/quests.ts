/**
 * 일일 퀘스트 정의. ⚠ 서버의 quest_defs 시드와 같아야 합니다.
 * kind: harvest(수확) / sell(판매) / plant(심기), cropId 가 null 이면 모든 작물.
 */
export interface QuestDef {
  id: string;
  kind: 'harvest' | 'sell' | 'plant';
  cropId: string | null;
  target: number;
  reward: number;
  title: string;
}

export const QUESTS: QuestDef[] = [
  { id: 'harvest_carrot_5', kind: 'harvest', cropId: 'carrot', target: 5, reward: 50, title: '당근 5개 수확하기' },
  { id: 'sell_potato_3', kind: 'sell', cropId: 'potato', target: 3, reward: 60, title: '감자 3개 판매하기' },
  { id: 'plant_any_10', kind: 'plant', cropId: null, target: 10, reward: 80, title: '작물 10개 심기' },
  { id: 'harvest_any_20', kind: 'harvest', cropId: null, target: 20, reward: 150, title: '아무 작물 20개 수확하기' },
];
