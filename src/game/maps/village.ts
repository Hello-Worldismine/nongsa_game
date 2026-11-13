/**
 * 햇살마을 지도 (56×42 타일, 16px)
 *  - 중앙 광장 + 분수 (스폰 지점)
 *  - 북서쪽 씨앗 상점 / 북동쪽 농산물 판매소
 *  - 광장 북쪽 마을 게시판
 *  - 남쪽 "농장 가는 길" 아치
 *  - 남동쪽 연못과 나무다리, 공원
 *  - 서쪽 주민 집들과 과수원
 */
import { GAME_CONFIG } from '@/config/game';
import { hash2 } from '../art/pixel';
import { T, TS } from '../art/tiles';
import { MapBuilder } from './builder';
import type { GameMap, Interactable } from './types';

let cached: GameMap | null = null;

export function buildVillage(): GameMap {
  if (cached) return cached;
  const b = new MapBuilder(56, 42, 'v');
  const patch = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && b.get(x, y) === T.Grass && hash2(x, y, 9) < 0.85) b.set(x, y, T.DarkGrass);
    }
  };

  // ── 지형 ──
  patch(10, 34, 6, 5); patch(47, 8, 5, 3); patch(33, 34, 4, 4); patch(12, 16, 5, 2.5); patch(50, 16, 4, 2);
  b.fill(4, 12, 45, 2, T.Path); // 북쪽 상점가 길
  b.fill(21, 14, 14, 12, T.Plaza); // 중앙 광장
  [[21, 14], [34, 14], [21, 25], [34, 25]].forEach(([x, y]) => b.set(x, y, T.Path));
  b.fill(3, 19, 18, 2, T.Path); // 서쪽 길
  b.fill(35, 19, 18, 2, T.Path); // 동쪽 길
  b.fill(27, 26, 2, 16, T.Path); // 남쪽 농장 길
  b.fill(9, 21, 2, 6, T.Path); // 파란 집 앞
  b.fill(16, 21, 2, 13, T.Path); // 초록 집 앞
  b.ellipse(45.5, 31, 7.5, 5, T.Water); // 연못
  b.fill(44, 21, 2, 5, T.Path);
  for (let y = 24; y <= 38; y++) for (let x = 44; x <= 45; x++) if (b.get(x, y) === T.Water) b.set(x, y, T.Bridge);
  b.fill(44, 37, 2, 2, T.Path);
  b.fill(41, 38, 8, 1, T.Path);

  // 장식 금지 구역 (건물 / 길 주변)
  b.reserve(9, 7, 7, 6); b.reserve(38, 7, 11, 6); b.reserve(2, 8, 6, 4);
  b.reserve(6, 23, 7, 4); b.reserve(13, 31, 7, 4); b.reserve(24, 36, 8, 6);
  b.reserve(20, 13, 16, 14);

  const px = (t: number) => t * TS;

  // ── 건물 ──
  b.add({ key: 'seed_shop', x: 200, y: 192, collide: { w: 66, h: 40, dy: 6 } });
  b.add({ key: 'seed_stand', x: 146, y: 190, collide: { w: 28, h: 8 } });
  b.add({ key: 'pot_pink', x: 176, y: 196 }); b.add({ key: 'pot_yellow', x: 226, y: 196 });
  b.add({ key: 'market', x: 696, y: 192, collide: { w: 70, h: 36, dy: 6 } });
  b.add({ key: 'basket_carrot', x: 646, y: 196, collide: { w: 12, h: 5 } });
  b.add({ key: 'basket_tomato', x: 748, y: 196, collide: { w: 12, h: 5 } });
  b.add({ key: 'basket_corn', x: 764, y: 196, collide: { w: 12, h: 5 } });
  b.add({ key: 'crate', x: 630, y: 192, collide: { w: 12, h: 6 } });
  b.add({ key: 'cottage_purple', x: 88, y: 186, collide: { w: 44, h: 22, dy: 5 } });
  b.add({ key: 'cottage_blue', x: 136, y: 432, collide: { w: 44, h: 22, dy: 5 } });
  b.add({ key: 'cottage_green', x: 248, y: 560, collide: { w: 44, h: 22, dy: 5 } });
  b.add({ key: 'mailbox', x: 112, y: 440, collide: { w: 6, h: 4 } });
  b.add({ key: 'barrel', x: 280, y: 548, collide: { w: 10, h: 5 } });

  // ── 광장 ──
  b.add({ key: 'board', x: 400, y: 240, collide: { w: 28, h: 6 } });
  // 분수대 바로 위: 주민 게시판 (주민이 글을 쓰고 모두가 읽음)
  b.add({ key: 'board', x: 448, y: 268, collide: { w: 28, h: 6 } });
  b.add({ key: 'fountain', x: 448, y: 346, collide: { w: 42, h: 22, dy: 2 }, anim: true });
  [[344, 236], [552, 236], [344, 414], [552, 414]].forEach(([x, y]) => b.add({ key: 'lamp', x, y, collide: { w: 6, h: 4 } }));
  b.add({ key: 'bench', x: 384, y: 402, collide: { w: 28, h: 5 } });
  b.add({ key: 'bench', x: 512, y: 402, collide: { w: 28, h: 5 } });
  b.add({ key: 'sign', x: 496, y: 240, collide: { w: 4, h: 4 } });
  // 광장 꽃밭
  [[360, 268, 'flowers_pink'], [360, 300, 'flowers_yellow'], [536, 268, 'flowers_purple'], [536, 300, 'flowers_white'],
    [408, 300, 'flowers_yellow'], [488, 300, 'flowers_pink'], [416, 386, 'flowers_blue'], [480, 386, 'flowers_pink']]
    .forEach(([x, y, k]) => b.add({ key: k as string, x: x as number, y: y as number, depth: -1 }));

  // ── 연못 ──
  [[668, 470], [776, 492], [700, 548], [790, 540], [656, 520]].forEach(([x, y]) => b.add({ key: 'lily', x, y, depth: -5 }));
  [[622, 468], [842, 500], [612, 520], [826, 560]].forEach(([x, y]) => b.add({ key: 'reeds', x, y }));
  b.add({ key: 'bench', x: 764, y: 636, collide: { w: 28, h: 5 } });
  b.add({ key: 'bench', x: 668, y: 636, collide: { w: 28, h: 5 } });
  [[640, 620, 'flowers_white'], [800, 620, 'flowers_pink'], [720, 650, 'flowers_yellow']].forEach(([x, y, k]) => b.add({ key: k as string, x: x as number, y: y as number, depth: -1 }));
  b.reserve(39, 36, 14, 4);

  // ── 농장 가는 길 아치 ──
  b.add({ key: 'farm_arch', x: 448, y: 664 });
  b.add({ key: 'sign', x: 488, y: 600, collide: { w: 4, h: 4 } });
  [[404, 590, 'flowers_pink'], [496, 640, 'flowers_yellow'], [400, 640, 'flowers_white']].forEach(([x, y, k]) => b.add({ key: k as string, x: x as number, y: y as number, depth: -1 }));

  // ── 햇살 카지노 (광장 동쪽) ──
  b.reserve(36, 13, 7, 6);
  b.add({ key: 'casino', x: 632, y: 300, collide: { w: 62, h: 26, dy: 5 } });

  // ── 과수원 / 숲 ──
  [[4, 31], [7, 33], [4, 35], [7, 37], [10, 38]].forEach(([x, y], i) => b.tree(x, y, i % 2 ? 'tree_apple' : 'tree_peach'));
  [[51, 5], [53, 8], [50, 9]].forEach(([x, y], i) => b.tree(x, y, i % 2 ? 'tree_apple' : 'tree_peach'));
  [[22, 34], [24, 31], [32, 30], [35, 36], [36, 27]].forEach(([x, y]) => b.tree(x, y));
  // 테두리 나무
  for (let x = 0; x < 56; x += 2) {
    const j = Math.floor(hash2(x, 0, 3) * 2);
    if (b.free(x, 1 + j)) b.tree(x, 1 + j);
    if ((x < 25 || x > 30) && b.free(x, 40)) b.tree(x, 40);
  }
  for (let y = 4; y < 40; y += 2) {
    if (b.free(0, y)) b.tree(0, y);
    if (b.free(55, y)) b.tree(55, y);
    if (hash2(1, y, 4) < 0.5 && b.free(2, y + 1)) b.tree(2, y + 1);
    if (hash2(53, y, 4) < 0.5 && b.free(53, y + 1)) b.tree(53, y + 1);
  }
  b.tree(20, 4); b.tree(24, 6); b.tree(31, 5); b.tree(35, 7); b.tree(28, 3, 'pine');

  // ── 흩뿌리기 장식 ──
  b.scatter(101, 0.07, ['flowers_pink', 'flowers_yellow', 'flowers_white', 'flowers_blue', 'flowers_purple']);
  b.scatter(202, 0.05, ['tall_grass', 'tall_grass', 'bush', 'bush_berry', 'rock_small']);
  b.scatter(303, 0.012, ['rock', 'stump']);

  const interactables: Interactable[] = [
    { id: 'shop', kind: 'shop', x: 200, y: 198, r: 26, prompt: '씨앗 상점 이용하기' },
    { id: 'stand', kind: 'shop', x: 146, y: 198, r: 18, prompt: '씨앗 상점 이용하기' },
    { id: 'market', kind: 'market', x: 696, y: 198, r: 34, prompt: '농산물 판매소 이용하기' },
    { id: 'board', kind: 'board', x: 400, y: 248, r: 22, prompt: '마을 안내판 보기' },
    { id: 'residentBoard', kind: 'residentBoard', x: 448, y: 276, r: 22, prompt: '주민 게시판 보기' },
    { id: 'casino', kind: 'casino', x: 632, y: 306, r: 26, prompt: '햇살 카지노 들어가기' },
    { id: 'fountain', kind: 'fountain', x: 448, y: 352, r: 34, prompt: '분수에 소원 빌기 (+30G, 1분마다)' },
    { id: 'farmGate', kind: 'farmGate', x: 448, y: 628, r: 30, prompt: '농장 가는 길 (농장 목록)' },
    { id: 'sign_farm', kind: 'farmGate', x: 488, y: 606, r: 14, prompt: '농장 가는 길 (농장 목록)' },
    { id: 'bench1', kind: 'bench', x: 384, y: 402, r: 18, prompt: '벤치에 앉기', data: { sx: 384, sy: 404 } },
    { id: 'bench2', kind: 'bench', x: 512, y: 402, r: 18, prompt: '벤치에 앉기', data: { sx: 512, sy: 404 } },
    { id: 'bench3', kind: 'bench', x: 764, y: 636, r: 18, prompt: '벤치에 앉기', data: { sx: 764, sy: 638 } },
    { id: 'bench4', kind: 'bench', x: 668, y: 636, r: 18, prompt: '벤치에 앉기', data: { sx: 668, sy: 638 } },
    { id: 'welcome', kind: 'board', x: 496, y: 246, r: 14, prompt: '안내판 읽기' },
  ];

  cached = b.build({
    id: 'village',
    interactables,
    labels: [
      { x: 200, y: 106, text: '씨앗 상점', style: 'banner' },
      { x: 696, y: 118, text: '농산물 판매소', style: 'banner' },
      { x: 400, y: 204, text: '마을 안내판', style: 'sign' },
      { x: 448, y: 230, text: '주민 게시판', style: 'banner' },
      { x: 632, y: 228, text: '햇살 카지노', style: 'banner' },
      { x: 448, y: 618, text: '농장 가는 길', style: 'banner' },
      { x: 496, y: 214, text: GAME_CONFIG.villageName, style: 'sign' },
    ],
    spawn: { x: 448, y: 392 },
    triggers: [{ rect: { x: px(25), y: 656, w: px(6), h: 16 }, kind: 'farmGate' }],
    walls: [{ x: 427, y: 652, w: 6, h: 10 }, { x: 465, y: 652, w: 6, h: 10 }],
  });
  return cached;
}
