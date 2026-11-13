/**
 * 집 안 지도. 바닥 크기(w×h 칸)는 집 단계에 따라 달라지고,
 * 위쪽 3줄은 벽(윗면 1 + 벽지 2), 양옆·아래는 벽 테두리, 아래 가운데가 문이에요.
 * 가구 좌표 (0,0) = 바닥의 왼쪽 위 칸.
 */
import { doorTile } from '@/config/shop';
import { T, TS } from '../art/tiles';
import { MapBuilder } from './builder';
import type { GameMap } from './types';

/** 바닥 (0,0) 칸의 타일 좌표 */
export const HOUSE_ORIGIN = { tx: 1, ty: 3 };
export const houseTileCenter = (x: number, y: number) => ({
  x: (HOUSE_ORIGIN.tx + x) * TS + TS / 2,
  y: (HOUSE_ORIGIN.ty + y) * TS + TS / 2,
});

const cache = new Map<string, GameMap>();

export function buildHouse(w: number, h: number): GameMap {
  const key = `${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = w + 2, H = h + 4;
  const b = new MapBuilder(W, H, 'h');
  b.fill(0, 0, W, H, T.Wall);
  b.fill(HOUSE_ORIGIN.tx, HOUSE_ORIGIN.ty, w, h, T.Floor);
  const door = doorTile(w, h);
  const doorTx = HOUSE_ORIGIN.tx + door.x;
  b.set(doorTx, H - 1, T.Door);

  // 벽 장식: 창문 (넓을수록 많이), 벽시계
  const windows = Math.max(1, Math.floor(w / 4));
  for (let i = 0; i < windows; i++) {
    const x = Math.round(((i + 1) / (windows + 1)) * w * TS) + HOUSE_ORIGIN.tx * TS;
    b.add({ key: 'house_window', x, y: 3 * TS - 2, depth: -50 });
  }
  b.add({ key: 'wall_clock', x: HOUSE_ORIGIN.tx * TS + 12, y: 2 * TS + 6, depth: -50 });

  const doorX = doorTx * TS + TS / 2;
  const map = b.build({
    id: 'house',
    interactables: [{ id: 'houseExit', kind: 'houseExit', x: doorX, y: (H - 1) * TS + 8, r: 12, prompt: '밖으로 나가기' }],
    labels: [],
    spawn: { x: doorX, y: (H - 1) * TS - 2 },
    triggers: [{ rect: { x: doorTx * TS + 2, y: H * TS - 5, w: TS - 4, h: 4 }, kind: 'houseExit' }],
    walls: [],
  });
  cache.set(key, map);
  return map;
}
