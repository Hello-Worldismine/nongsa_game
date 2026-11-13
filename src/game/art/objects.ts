/**
 * 마을/농장 소품 스프라이트 (나무, 꽃, 울타리, 벤치, 분수 등)
 */
import { darken, hash2, lighten, mix, PixelGrid } from './pixel';

const OUT = '#4a3a36';
const WOOD = '#cf9c66', WOOD_L = '#e6bb86', WOOD_D = '#a8744a';
const LEAF = '#7cc455', LEAF_L = '#a6dd72', LEAF_D = '#5aa244';

function canopy(g: PixelGrid, cx: number, cy: number, rx: number, ry: number, base = LEAF, fruit?: string, seed = 1) {
  const blobs: [number, number, number, number][] = [
    [cx, cy + 2, rx, ry - 1], [cx - rx * 0.45, cy, rx * 0.6, ry * 0.7], [cx + rx * 0.45, cy, rx * 0.6, ry * 0.7],
    [cx, cy - ry * 0.35, rx * 0.7, ry * 0.65],
  ];
  blobs.forEach(([x, y, a, b]) => g.ellipse(x, y, a, b, darken(base, 0.18)));
  // 밝은 윗면 (빛이 왼쪽 위에서)
  blobs.forEach(([x, y, a, b]) => g.ellipse(x - 0.8, y - 1.2, a * 0.85, b * 0.8, base));
  g.ellipse(cx - rx * 0.35, cy - ry * 0.45, rx * 0.4, ry * 0.32, lighten(base, 0.28));
  // 잎 질감
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.get(x, y);
    if (!c || hash2(x, y, seed) > 0.08) continue;
    g.set(x, y, c === base ? lighten(base, 0.2) : darken(base, 0.3));
  }
  if (fruit) {
    for (let i = 0; i < 7; i++) {
      const fx = Math.round(cx - rx * 0.7 + hash2(i, seed, 3) * rx * 1.4);
      const fy = Math.round(cy - ry * 0.4 + hash2(i, seed, 4) * ry * 1.1);
      if (g.get(fx, fy) && g.get(fx + 1, fy + 1)) {
        g.set(fx, fy, fruit); g.set(fx + 1, fy, fruit); g.set(fx, fy + 1, darken(fruit, 0.15)); g.set(fx + 1, fy + 1, darken(fruit, 0.15));
        g.set(fx, fy, lighten(fruit, 0.45));
      }
    }
  }
}

function trunk(g: PixelGrid, cx: number, top: number, bottom: number) {
  g.rect(cx - 2, top, 5, bottom - top + 1, '#a87650');
  g.vline(cx - 2, top, bottom - top + 1, '#c08c62');
  g.vline(cx + 2, top, bottom - top + 1, '#8c5c3c');
  g.set(cx - 3, bottom, '#a87650'); g.set(cx + 3, bottom, '#8c5c3c');
}

export function tree(fruit?: string, seed = 1, base = LEAF): PixelGrid {
  const g = new PixelGrid(32, 40);
  trunk(g, 16, 26, 36);
  canopy(g, 16, 16, 13, 11, base, fruit, seed);
  g.outline(OUT, 0.55);
  g.shadow(16, 37.5, 9, 2.4);
  return g;
}

export function pineTree(seed = 2): PixelGrid {
  const g = new PixelGrid(24, 40);
  g.rect(10, 30, 4, 6, '#9c6a46'); g.vline(10, 30, 6, '#b88058');
  const tiers = [[29, 10], [22, 8.5], [15, 6.5], [9, 4.5]];
  tiers.forEach(([y, r]) => {
    for (let j = 0; j < 8; j++) {
      const half = Math.round((r * (j + 1)) / 8 + 1);
      g.hline(12 - half, y - 8 + j, half * 2, j > 5 ? '#4f9446' : '#62ad53');
      g.set(12 - half, y - 8 + j, '#78c063');
    }
  });
  for (let y = 0; y < 40; y++) for (let x = 0; x < 24; x++) if (g.get(x, y) === '#62ad53' && hash2(x, y, seed) < 0.1) g.set(x, y, '#86cc6c');
  g.set(12, 0, '#ffe680');
  g.outline(OUT, 0.55);
  g.shadow(12, 37, 7, 2);
  return g;
}

export function bush(berry = false): PixelGrid {
  const g = new PixelGrid(16, 14);
  g.ellipse(8, 8, 7, 5, LEAF_D);
  g.ellipse(7.2, 7, 6, 4.2, LEAF);
  g.ellipse(5.5, 5.5, 2.5, 1.6, LEAF_L);
  if (berry) [[4, 8], [9, 6], [11, 9], [7, 10]].forEach(([x, y]) => { g.set(x, y, '#e8506a'); g.set(x, y - 1, '#ff9ab0'); });
  g.outline(OUT, 0.55);
  return g;
}

export function flowers(color: string, seed = 1): PixelGrid {
  const g = new PixelGrid(16, 12);
  const spots = [[3, 5], [8, 3], [12, 6], [6, 8], [11, 9]];
  spots.forEach(([x, y], i) => {
    g.vline(x, y + 1, 3, LEAF_D);
    g.set(x - 1, y + 3, LEAF); g.set(x + 1, y + 2, LEAF);
    if (hash2(i, seed, 1) < 0.8) {
      g.set(x, y - 1, color); g.set(x - 1, y, color); g.set(x + 1, y, color); g.set(x, y + 1, darken(color, 0.12));
      g.set(x, y, '#ffe36a');
    }
  });
  g.outline(OUT, 0.65);
  return g;
}

export function tallGrass(): PixelGrid {
  const g = new PixelGrid(16, 10);
  [[2, 3], [5, 1], [8, 2], [11, 0], [13, 3]].forEach(([x, top], i) => g.line(x, 9, x + (i % 2 ? 1 : -1), top, i % 2 ? LEAF : LEAF_D));
  return g;
}

export function rock(big = true): PixelGrid {
  const g = new PixelGrid(16, 12);
  if (big) {
    g.ellipse(8, 7.5, 6.5, 4.3, '#b8b0a8');
    g.ellipse(7, 6.2, 5, 3, '#d0c9c0');
    g.ellipse(5.5, 5, 2, 1.2, '#e6e0d8');
    g.set(10, 9, '#9e958e'); g.set(11, 8, '#9e958e');
  } else {
    g.ellipse(8, 8.5, 4, 2.6, '#b8b0a8'); g.ellipse(7.5, 7.8, 3, 1.7, '#d0c9c0');
  }
  g.outline(OUT, 0.5);
  return g;
}

export function stump(): PixelGrid {
  const g = new PixelGrid(16, 12);
  g.rect(3, 4, 10, 6, '#a87650'); g.vline(3, 4, 6, '#c08c62'); g.vline(12, 4, 6, '#8c5c3c');
  g.ellipse(8, 4, 5, 2, '#e8c890'); g.ellipse(8, 4, 2.5, 1, '#c8a070');
  g.set(2, 9, '#a87650'); g.set(13, 9, '#8c5c3c');
  g.outline(OUT, 0.5);
  return g;
}

/** 울타리: kind = h(가로) / v(세로) / post */
export function fence(kind: 'h' | 'v' | 'post'): PixelGrid {
  const g = new PixelGrid(16, 16);
  const post = (x: number) => { g.rect(x, 3, 3, 12, WOOD); g.vline(x, 3, 12, WOOD_L); g.vline(x + 2, 3, 12, WOOD_D); g.hline(x, 3, 3, WOOD_L); };
  if (kind === 'h') {
    g.rect(0, 6, 16, 2, WOOD); g.hline(0, 6, 16, WOOD_L);
    g.rect(0, 10, 16, 2, WOOD); g.hline(0, 11, 16, WOOD_D);
    post(1); post(12);
  } else if (kind === 'v') {
    g.rect(6, 0, 3, 16, WOOD); g.vline(6, 0, 16, WOOD_L); g.vline(8, 0, 16, WOOD_D);
    g.rect(6, 1, 3, 1, WOOD_D); g.rect(6, 9, 3, 1, WOOD_D);
  } else post(6);
  g.outline(OUT, 0.5);
  return g;
}

export function bench(): PixelGrid {
  const g = new PixelGrid(32, 18);
  g.rect(2, 3, 28, 3, WOOD); g.hline(2, 3, 28, WOOD_L); // 등받이
  g.rect(2, 8, 28, 4, WOOD); g.hline(2, 8, 28, WOOD_L); g.hline(2, 11, 28, WOOD_D);
  [4, 26].forEach((x) => { g.rect(x, 5, 2, 3, WOOD_D); g.rect(x, 12, 2, 4, '#7a5a40'); });
  g.outline(OUT, 0.5);
  g.shadow(16, 16.5, 13, 1.5);
  return g;
}

export function lamp(): PixelGrid {
  const g = new PixelGrid(16, 32);
  g.rect(7, 10, 2, 19, '#5b5470'); g.vline(7, 10, 19, '#7a7290');
  g.rect(5, 28, 6, 2, '#5b5470');
  g.rect(4, 3, 8, 7, '#ffeaa0'); g.rect(5, 4, 6, 5, '#fff6cc');
  g.hline(3, 2, 10, '#5b5470'); g.hline(4, 1, 8, '#5b5470'); g.hline(4, 10, 8, '#5b5470');
  g.vline(4, 3, 7, '#5b5470'); g.vline(11, 3, 7, '#5b5470');
  g.outline(OUT, 0.5);
  g.shadow(8, 30.5, 4, 1.2);
  return g;
}

export function signPost(): PixelGrid {
  const g = new PixelGrid(16, 20);
  g.rect(7, 8, 2, 11, WOOD_D);
  g.rect(1, 2, 14, 7, WOOD); g.hline(1, 2, 14, WOOD_L); g.hline(1, 8, 14, WOOD_D);
  g.hline(3, 4, 8, '#8a5a3a'); g.hline(3, 6, 6, '#8a5a3a');
  g.set(15, 5, WOOD); g.set(15, 4, WOOD);
  g.outline(OUT, 0.5);
  return g;
}

export function board(): PixelGrid {
  const g = new PixelGrid(32, 30);
  g.rect(3, 10, 2, 18, WOOD_D); g.rect(27, 10, 2, 18, WOOD_D);
  g.rect(1, 4, 30, 18, WOOD); g.rect(3, 6, 26, 14, '#e8d4ac');
  g.hline(0, 3, 32, '#b97a52'); g.hline(1, 2, 30, '#d08a5a'); // 지붕
  g.rect(5, 8, 7, 8, '#fffaf0'); g.hline(6, 10, 5, '#c9b9a0'); g.hline(6, 12, 4, '#c9b9a0'); g.set(8, 8, '#e8506a');
  g.rect(14, 7, 6, 6, '#fff3b0'); g.hline(15, 9, 4, '#d9c080'); g.set(16, 7, '#5aa0e0');
  g.rect(22, 9, 6, 8, '#d9f0ff'); g.hline(23, 11, 4, '#a0c0d8'); g.hline(23, 13, 3, '#a0c0d8'); g.set(24, 9, '#7cc455');
  g.rect(14, 15, 6, 4, '#ffe0ea');
  g.outline(OUT, 0.5);
  g.shadow(16, 28.5, 13, 1.5);
  return g;
}

/** 분수 (3프레임 애니메이션) */
export function fountainFrames(): PixelGrid[] {
  return [0, 1, 2].map((f) => {
    const g = new PixelGrid(48, 44);
    // 바깥 수반
    g.ellipse(24, 32, 22, 10, '#c9bfae');
    g.ellipse(24, 31, 21, 9, '#e6dccb');
    g.ellipse(24, 32, 18, 7, '#7cc6de');
    g.ellipse(24, 33, 16, 5.5, '#8fd5e8');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + f * 0.6; g.set(Math.round(24 + Math.cos(a) * 13), Math.round(33 + Math.sin(a) * 3.5), '#d4f4fa'); }
    // 기둥과 위쪽 그릇
    g.rect(21, 18, 6, 14, '#ddd2bf'); g.vline(21, 18, 14, '#efe6d6'); g.vline(26, 18, 14, '#c2b6a2');
    g.ellipse(24, 18, 9, 3.4, '#ddd2bf'); g.ellipse(24, 17.4, 8, 2.6, '#8fd5e8');
    // 물줄기
    const h = [0, 1, 0][f];
    g.rect(23, 6 - h, 2, 11, '#bdeaf5');
    g.set(23, 5 - h, '#e9fbff'); g.set(24, 5 - h, '#e9fbff');
    const drops = [[19, 9 + f], [29, 10 - f + 1], [17, 13 + (f % 2)], [31, 13 + ((f + 1) % 2)], [22, 7 + f], [26, 8 + ((f + 1) % 3)]];
    drops.forEach(([x, y]) => g.set(x, y, '#cff3fb'));
    [[16, 15], [32, 15], [15, 21], [33, 21]].forEach(([x, y], i) => g.vline(x, y + ((f + i) % 2), 4, '#bdeaf5'));
    g.outline(OUT, 0.45);
    return g;
  });
}

export function lily(): PixelGrid {
  const g = new PixelGrid(12, 8);
  g.ellipse(6, 4, 5, 3, '#6cbf5a'); g.set(6, 3, null); g.set(7, 2, null); g.set(6, 2, null);
  g.set(4, 3, '#ffd6e4'); g.set(3, 4, '#ffb0c8'); g.set(4, 4, '#ffe36a'); g.set(5, 4, '#ffb0c8');
  g.outline('#3a7a5a', 0.4);
  return g;
}

export function reeds(): PixelGrid {
  const g = new PixelGrid(16, 18);
  [[3, 5], [6, 2], [9, 4], [12, 6]].forEach(([x, top], i) => {
    g.vline(x, top, 17 - top, i % 2 ? LEAF_D : LEAF);
    if (i % 2 === 0) { g.rect(x, top, 2, 4, '#9a6a45'); g.set(x, top, '#b8865a'); }
  });
  g.outline(OUT, 0.6);
  return g;
}

export function shippingBox(): PixelGrid {
  const g = new PixelGrid(20, 18);
  g.rect(1, 5, 18, 11, WOOD); g.hline(1, 9, 18, WOOD_D); g.hline(1, 12, 18, WOOD_D);
  g.vline(1, 5, 11, WOOD_D); g.vline(18, 5, 11, WOOD_D);
  g.rect(0, 2, 20, 4, '#b8865a'); g.hline(0, 2, 20, WOOD_L);
  // 별 스티커
  g.set(10, 8, '#ffe066'); g.hline(9, 9, 3, '#ffe066'); g.set(10, 10, '#ffe066'); g.set(9, 11, '#ffe066'); g.set(11, 11, '#ffe066');
  g.outline(OUT, 0.5);
  g.shadow(10, 16.5, 9, 1.4);
  return g;
}

export function mailbox(): PixelGrid {
  const g = new PixelGrid(12, 20);
  g.rect(5, 9, 2, 10, WOOD_D);
  g.rect(1, 2, 10, 7, '#ef8a8a'); g.hline(1, 2, 10, '#ffb0a8'); g.rect(2, 1, 8, 1, '#ef8a8a');
  g.rect(2, 4, 3, 3, '#fff6e0');
  g.vline(10, 1, 4, '#5b5470'); g.rect(10, 1, 2, 2, '#ffd84a');
  g.outline(OUT, 0.5);
  return g;
}

export function scarecrow(): PixelGrid {
  const g = new PixelGrid(20, 30);
  g.rect(9, 12, 2, 17, WOOD_D);
  g.rect(2, 13, 16, 2, WOOD);
  g.rect(6, 12, 8, 9, '#7fb8e6'); g.rect(6, 17, 8, 1, '#5f98c6'); g.set(8, 14, '#ffe066'); g.set(11, 15, '#e8506a');
  g.set(3, 15, '#e8c66a'); g.set(16, 15, '#e8c66a'); g.set(2, 16, '#e8c66a'); g.set(17, 16, '#e8c66a');
  g.ellipse(10, 7.5, 4.6, 4.2, '#f2e1b0');
  g.set(8, 7, OUT); g.set(12, 7, OUT); g.hline(9, 9, 3, '#c8805a'); g.set(7, 9, '#ffb0a8'); g.set(13, 9, '#ffb0a8');
  g.rect(3, 3, 14, 2, '#c8905a'); g.rect(6, 0, 8, 4, '#d8a06a'); g.hline(6, 3, 8, '#e8506a');
  g.outline(OUT, 0.55);
  g.shadow(10, 28.5, 5, 1.3);
  return g;
}

export function crate(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.rect(1, 3, 14, 12, WOOD); g.rect(1, 3, 14, 1, WOOD_L); g.hline(1, 8, 14, WOOD_D);
  g.line(2, 4, 13, 13, WOOD_D);
  g.outline(OUT, 0.5);
  return g;
}

export function barrel(): PixelGrid {
  const g = new PixelGrid(14, 18);
  g.ellipse(7, 9.5, 6, 7.5, WOOD); g.rect(1, 4, 12, 11, WOOD);
  g.hline(1, 5, 12, '#7a7290'); g.hline(1, 13, 12, '#7a7290');
  g.ellipse(7, 3.5, 5.5, 1.8, '#b8865a'); g.vline(3, 4, 11, WOOD_L);
  g.outline(OUT, 0.5);
  return g;
}

export function flowerPot(color: string): PixelGrid {
  const g = new PixelGrid(12, 14);
  g.rect(3, 8, 6, 5, '#d9805a'); g.hline(2, 8, 8, '#e89a70'); g.vline(8, 9, 4, '#b8603e');
  g.ellipse(6, 5, 4, 3.2, LEAF);
  [[4, 4], [7, 3], [6, 6], [8, 5]].forEach(([x, y]) => g.set(x, y, color));
  g.outline(OUT, 0.5);
  return g;
}

/** 상점 앞 씨앗 진열대 */
export function seedStand(): PixelGrid {
  const g = new PixelGrid(32, 22);
  g.rect(1, 8, 30, 10, WOOD); g.hline(1, 8, 30, WOOD_L); g.hline(1, 17, 30, WOOD_D);
  [3, 27].forEach((x) => g.rect(x, 18, 2, 3, WOOD_D));
  const colors = ['#f58a3a', '#d8b06a', '#e8c04a', '#a24fb3', '#ec4a3e', '#f7d33e', '#ee3f55'];
  colors.forEach((c, i) => {
    const x = 2 + i * 4, y = 2 + (i % 2) * 2;
    g.rect(x, y, 4, 6, '#f6ecd2'); g.rect(x, y, 4, 2, c); g.set(x + 1, y + 3, c);
  });
  g.outline(OUT, 0.5);
  return g;
}

export function produceBasket(color: string): PixelGrid {
  const g = new PixelGrid(16, 12);
  g.rect(2, 5, 12, 6, '#c8905a'); g.hline(2, 5, 12, '#e0b07a');
  for (let x = 3; x < 14; x += 2) g.vline(x, 6, 4, '#b07a48');
  [[4, 3], [7, 2], [10, 3], [12, 4], [6, 4], [9, 4]].forEach(([x, y]) => { g.set(x, y, color); g.set(x + 1, y, color); g.set(x, y + 1, darken(color, 0.15)); g.set(x + 1, y + 1, darken(color, 0.15)); g.set(x, y, lighten(color, 0.4)); });
  g.outline(OUT, 0.5);
  return g;
}

/** 경작지 (갈아놓은 흙) */
export function plotSoil(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.rect(1, 1, 14, 14, '#b07a4e');
  for (let y = 2; y < 15; y += 3) { g.hline(2, y, 12, '#8e5e3a'); g.hline(2, y + 1, 12, '#c48c5c'); }
  g.hline(1, 1, 14, '#c99a6a'); g.vline(1, 1, 14, '#c99a6a');
  g.hline(1, 14, 14, '#7e5232'); g.vline(14, 1, 14, '#7e5232');
  g.set(1, 1, null); g.set(14, 1, null); g.set(1, 14, null); g.set(14, 14, null);
  return g;
}

export function plotCursor(color = '#fffbe8'): PixelGrid {
  const g = new PixelGrid(18, 18);
  const L = 5;
  [[0, 0, 1, 1], [17, 0, -1, 1], [0, 17, 1, -1], [17, 17, -1, -1]].forEach(([x, y, dx, dy]) => {
    for (let i = 0; i < L; i++) { g.set(x + dx * i, y, color); g.set(x, y + dy * i, color); }
    for (let i = 1; i < L - 1; i++) { g.set(x + dx * i, y + dy, mix(color, '#7a5a40', 0.6)); g.set(x + dx, y + dy * i, mix(color, '#7a5a40', 0.6)); }
  });
  return g;
}

export function stake(): PixelGrid {
  const g = new PixelGrid(16, 16);
  g.vline(8, 4, 10, WOOD_D);
  g.rect(9, 4, 4, 3, '#ffd84a'); g.set(12, 5, '#ffe98a');
  g.outline(OUT, 0.5);
  return g;
}

export function farmArch(): PixelGrid {
  const g = new PixelGrid(48, 40);
  [3, 41].forEach((x) => { g.rect(x, 8, 4, 31, WOOD); g.vline(x, 8, 31, WOOD_L); g.vline(x + 3, 8, 31, WOOD_D); });
  g.rect(0, 4, 48, 9, WOOD); g.hline(0, 4, 48, WOOD_L); g.hline(0, 12, 48, WOOD_D);
  g.rect(9, 5, 30, 7, '#f6ecd2');
  // 작은 새싹 그림 (글자는 게임에서 텍스트로 표시)
  g.vline(24, 8, 3, '#5a9a3a'); g.set(23, 7, LEAF); g.set(22, 7, LEAF); g.set(25, 7, LEAF_L); g.set(26, 6, LEAF_L);
  [[1, 3], [10, 2], [20, 3], [30, 2], [40, 3], [46, 3]].forEach(([x, y]) => { g.set(x, y, '#ff9ab0'); g.set(x + 1, y, LEAF); });
  g.outline(OUT, 0.5);
  return g;
}

export function butterflyFrames(color: string): PixelGrid[] {
  return [0, 1].map((f) => {
    const g = new PixelGrid(8, 6);
    g.vline(4, 1, 4, '#5a4040');
    if (f === 0) { g.rect(1, 0, 3, 3, color); g.rect(5, 0, 3, 3, color); g.set(2, 3, color); g.set(6, 3, color); }
    else { g.rect(2, 1, 2, 3, color); g.rect(5, 1, 2, 3, color); }
    return g;
  });
}

export function sparkleFrames(): PixelGrid[] {
  return [0, 1, 2].map((f) => {
    const g = new PixelGrid(9, 9);
    const r = [1, 3, 2][f];
    const c = '#fff6b0';
    for (let i = -r; i <= r; i++) { g.set(4 + i, 4, c); g.set(4, 4 + i, c); }
    g.set(4, 4, '#ffffff');
    if (f === 1) { g.set(3, 3, c); g.set(5, 5, c); g.set(3, 5, c); g.set(5, 3, c); }
    return g;
  });
}

export function heartIcon(color = '#ff6f8f'): PixelGrid {
  const g = new PixelGrid(9, 8);
  g.rows([
    '.HH.HH.',
    'HWHHHHH',
    'HHHHHHH',
    '.HHHHH.',
    '..HHH..',
    '...H...',
  ], { H: color, W: '#ffd0dc' }, 1, 1);
  g.outline('#7a3040', 0.5);
  return g;
}

export function noteIcon(): PixelGrid {
  const g = new PixelGrid(8, 9);
  g.rows([
    '...KKK',
    '...KKK',
    '...K..',
    '...K..',
    '.KKK..',
    'KKKK..',
    '.KK...',
  ], { K: '#6a5acd' }, 1, 1);
  return g;
}

export function shadowBlob(): PixelGrid {
  const g = new PixelGrid(14, 5);
  g.ellipse(7, 2.5, 6.5, 2.3, 'rgba(70,45,55,0.25)');
  return g;
}

/** 과일 나무 위에 띄우는 "딸 수 있어요" 표시 (사과 / 복숭아) */
export function fruitMarker(kind: 'apple' | 'peach'): PixelGrid {
  const g = new PixelGrid(11, 12);
  const body = kind === 'apple' ? '#ef4a4a' : '#ffab9a';
  const shade = kind === 'apple' ? '#c0303a' : '#f08a7a';
  g.ellipse(5.5, 7, 4.6, 4.2, body);
  g.ellipse(6.5, 8.2, 3.2, 2.6, shade, true);
  g.ellipse(4.2, 5.6, 1.4, 1.2, kind === 'apple' ? '#ffb0a8' : '#fff0e8');
  g.vline(5, 1, 3, '#8a5a3a');
  g.set(6, 2, '#7cc455'); g.set(7, 1, '#7cc455'); g.set(7, 2, '#a6dd72');
  if (kind === 'peach') g.vline(6, 4, 5, shade);
  g.outline('#5a2a2a', 0.5);
  return g;
}
