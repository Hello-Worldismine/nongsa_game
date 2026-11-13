/**
 * 개인 농장 지도 (34×26 타일). 모든 농장은 같은 지형을 쓰고,
 * 경작지 크기·작물·울타리는 농장 데이터에 따라 장면에서 그려집니다.
 */
import { hash2 } from '../art/pixel';
import { T, TS } from '../art/tiles';
import { MapBuilder } from './builder';
import type { GameMap } from './types';

/** 경작지 (0,0) 칸의 왼쪽 위 타일 좌표 */
export const PLOT_ORIGIN = { tx: 14, ty: 8 };
export const plotCenter = (x: number, y: number) => ({
  x: (PLOT_ORIGIN.tx + x) * TS + TS / 2,
  y: (PLOT_ORIGIN.ty + y) * TS + TS / 2,
});

let cached: GameMap | null = null;

export function buildFarm(): GameMap {
  if (cached) return cached;
  const b = new MapBuilder(34, 26, 'f');
  b.fill(13, 7, 12, 12, T.DarkGrass); // 경작 가능 구역 (확장되면 밭이 생김)
  b.fill(5, 8, 2, 12, T.Dirt);
  b.fill(5, 19, 14, 2, T.Dirt);
  b.fill(17, 21, 2, 5, T.Dirt);
  b.fill(7, 8, 6, 1, T.Dirt);
  b.ellipse(29.5, 21.5, 3.4, 2.3, T.Water);

  b.reserve(1, 1, 10, 8); b.reserve(12, 6, 14, 14); b.reserve(24, 5, 4, 4); b.reserve(15, 20, 6, 6);

  b.add({ key: 'farm_house', x: 96, y: 128, collide: { w: 48, h: 26, dy: 7 } });
  b.add({ key: 'mailbox', x: 128, y: 136, collide: { w: 6, h: 4 } });
  b.add({ key: 'shipping_box', x: 164, y: 134, collide: { w: 18, h: 8 } });
  b.add({ key: 'sign', x: 200, y: 118, collide: { w: 4, h: 4 } });
  b.add({ key: 'scarecrow', x: 424, y: 124, collide: { w: 6, h: 4 } });
  b.add({ key: 'barrel', x: 44, y: 140, collide: { w: 10, h: 5 } });
  b.add({ key: 'crate', x: 60, y: 144, collide: { w: 12, h: 6 } });
  b.add({ key: 'sign', x: 320, y: 392, collide: { w: 4, h: 4 } });
  [[56, 124, 'flowers_pink'], [136, 124, 'flowers_yellow'], [72, 160, 'flowers_white'], [120, 160, 'flowers_purple'],
    [400, 300, 'flowers_yellow'], [430, 330, 'flowers_pink']].forEach(([x, y, k]) => b.add({ key: k as string, x: x as number, y: y as number, depth: -1 }));
  [[452, 324], [492, 360]].forEach(([x, y]) => b.add({ key: 'reeds', x, y }));
  b.add({ key: 'lily', x: 476, y: 350, depth: -5 });

  // 테두리 나무
  for (let x = 0; x < 34; x += 2) {
    if (b.free(x, 1)) b.tree(x, 1);
    if ((x < 15 || x > 20) && b.free(x, 25)) b.tree(x, 25);
  }
  for (let y = 3; y < 25; y += 2) {
    if (b.free(0, y)) b.tree(0, y);
    if (b.free(33, y)) b.tree(33, y);
  }
  [[4, 14], [8, 22], [27, 13], [30, 9], [24, 23], [2, 20]].forEach(([x, y], i) => b.free(x, y) && b.tree(x, y, i % 2 ? 'tree_apple' : 'tree_peach'));
  b.scatter(11, 0.08, ['flowers_pink', 'flowers_yellow', 'flowers_white', 'tall_grass', 'tall_grass']);
  b.scatter(12, 0.03, ['bush', 'bush_berry', 'rock_small']);
  void hash2;

  cached = b.build({
    id: 'farm',
    interactables: [
      { id: 'house', kind: 'house', x: 96, y: 132, r: 18, prompt: '집에 들어가기' },
      { id: 'mailbox', kind: 'mailbox', x: 128, y: 140, r: 14, prompt: '방명록 보기' },
      { id: 'ship', kind: 'ship', x: 164, y: 140, r: 22, prompt: '보관함 열기' },
      { id: 'expand', kind: 'expand', x: 200, y: 124, r: 18, prompt: '농장 확장 안내판' },
      { id: 'scarecrow', kind: 'scarecrow', x: 424, y: 128, r: 18, prompt: '허수아비에게 말 걸기' },
      { id: 'exit', kind: 'exit', x: 320, y: 398, r: 16, prompt: '마을로 돌아가기' },
    ],
    labels: [{ x: 200, y: 92, text: '농장 확장', style: 'sign' }, { x: 164, y: 106, text: '보관함', style: 'sign' }, { x: 122, y: 108, text: '방명록', style: 'sign' }, { x: 320, y: 366, text: '마을로 가는 길', style: 'sign' }],
    spawn: { x: 288, y: 380 },
    triggers: [{ rect: { x: 17 * TS, y: 25 * TS + 10, w: 32, h: 6 }, kind: 'exit' }],
    walls: [],
  });
  return cached;
}
