/**
 * 농장 확장 단계. ⚠ 서버의 farm_levels 시드와 같아야 합니다.
 */
export interface FarmLevelDef {
  level: number;
  size: number;
  cost: number;
}

export const FARM_LEVELS: FarmLevelDef[] = [
  { level: 1, size: 3, cost: 0 },
  { level: 2, size: 4, cost: 500 },
  { level: 3, size: 5, cost: 1200 },
  { level: 4, size: 6, cost: 2500 },
  { level: 5, size: 7, cost: 5000 },
  { level: 6, size: 8, cost: 10000 },
  { level: 7, size: 9, cost: 20000 },
  { level: 8, size: 10, cost: 40000 },
];

export const MAX_FARM_LEVEL = FARM_LEVELS[FARM_LEVELS.length - 1].level;
export const MAX_FARM_SIZE = FARM_LEVELS[FARM_LEVELS.length - 1].size;
export const farmLevel = (level: number) => FARM_LEVELS.find((l) => l.level === level);
