/**
 * 작물 스프라이트: 10종 × 4단계(씨앗/새싹/성장/수확) — 작물마다 실루엣이 다릅니다.
 * 캔버스 16×24, 아래쪽 16px 가 밭 한 칸과 겹칩니다. 뿌리 위치 ≈ (8, 19)
 */
import { darken, lighten, PixelGrid } from './pixel';

export const CROP_W = 16;
export const CROP_H = 24;

const LEAF = '#6cbf4a';
const LEAF_D = '#4d9a3c';
const LEAF_L = '#9ad868';
const STEM = '#5a9a3a';
const SOIL = '#9a6a45';
const SOIL_L = '#b9865a';

type Draw = (g: PixelGrid) => void;

function mound(g: PixelGrid, seedColor: string, pattern: 'dots' | 'row' | 'chunk' = 'dots') {
  g.ellipse(8, 19.5, 3.6, 1.7, SOIL);
  g.hline(6, 18, 4, SOIL_L);
  if (pattern === 'dots') { g.set(6, 19, seedColor); g.set(9, 18, seedColor); g.set(10, 20, seedColor); }
  if (pattern === 'row') { [5, 7, 9, 11].forEach((x, i) => g.set(x, 19 + (i % 2), seedColor)); }
  if (pattern === 'chunk') { g.ellipse(8, 18.5, 1.6, 1.1, seedColor); g.set(7, 18, lighten(seedColor, 0.4)); }
}

const blob = (g: PixelGrid, cx: number, cy: number, rx: number, ry: number, c: string, hi = true) => {
  g.ellipse(cx, cy, rx, ry, c);
  if (hi && rx >= 1.5) g.set(Math.round(cx - rx / 2), Math.round(cy - ry / 2), lighten(c, 0.35));
};

export function sprout(g: PixelGrid, h: number, color = LEAF) {
  g.vline(8, 19 - h, h + 1, STEM);
  g.set(7, 19 - h, color); g.set(9, 19 - h, color); g.set(6, 19 - h + 1, color); g.set(10, 19 - h + 1, color);
}

/** 작은 꽃 */
function flower(g: PixelGrid, x: number, y: number, petal: string, center = '#ffd84a') {
  g.set(x - 1, y, petal); g.set(x + 1, y, petal); g.set(x, y - 1, petal); g.set(x, y + 1, petal); g.set(x, y, center);
}

const heartLeaf = (g: PixelGrid, x: number, y: number, c: string) => {
  g.set(x - 1, y, c); g.set(x + 1, y, c); g.rect(x - 2, y + 1, 5, 1, c); g.rect(x - 1, y + 2, 3, 1, c); g.set(x, y + 3, c);
  g.set(x - 1, y + 1, lighten(c, 0.3));
};

const CROP_ART: Record<string, [Draw, Draw, Draw, Draw]> = {
  carrot: [
    (g) => mound(g, '#d68b4c'),
    (g) => { g.line(8, 19, 6, 15, LEAF); g.line(8, 19, 8, 14, LEAF_L); g.line(8, 19, 10, 15, LEAF); g.set(5, 14, LEAF_L); g.set(11, 14, LEAF_L); },
    (g) => {
      [[4, 11], [6, 9], [9, 9], [11, 11], [8, 8]].forEach(([x, y]) => g.line(8, 18, x, y, STEM));
      [[4, 11], [6, 9], [9, 9], [11, 11], [8, 8]].forEach(([x, y]) => blob(g, x, y, 1.5, 1.2, LEAF, false));
      g.rect(7, 18, 2, 2, '#f39443');
    },
    (g) => {
      [[3, 9], [5, 6], [8, 5], [11, 6], [13, 9]].forEach(([x, y]) => g.line(8, 17, x, y, LEAF_D));
      [[3, 9], [5, 6], [8, 5], [11, 6], [13, 9], [6, 11], [10, 11]].forEach(([x, y]) => blob(g, x, y, 1.8, 1.4, LEAF, false));
      blob(g, 8, 18.5, 3, 2.2, '#f58a3a');
      g.hline(6, 19, 4, '#d86f28'); g.set(6, 17, '#ffc08a');
    },
  ],
  potato: [
    (g) => mound(g, '#d9b77a', 'chunk'),
    (g) => { g.vline(8, 16, 4, STEM); blob(g, 6, 15, 2, 1.4, LEAF); blob(g, 10, 15, 2, 1.4, LEAF); },
    (g) => { g.vline(8, 14, 6, STEM); [[5, 14], [11, 14], [8, 11], [6, 11], [10, 11]].forEach(([x, y]) => blob(g, x, y, 2.3, 1.9, LEAF)); },
    (g) => {
      g.vline(8, 13, 7, STEM);
      [[4, 14], [12, 14], [8, 10], [5, 10], [11, 10], [8, 14]].forEach(([x, y]) => blob(g, x, y, 2.5, 2, LEAF_D));
      [[6, 9], [10, 8], [8, 7]].forEach(([x, y]) => flower(g, x, y, '#e6c9f5', '#ffe066'));
      blob(g, 5, 19, 2, 1.4, '#dcb878'); blob(g, 11, 19.5, 2.2, 1.4, '#d4ae6c');
    },
  ],
  rice: [
    (g) => mound(g, '#f0e3b0', 'row'),
    (g) => { [6, 8, 10].forEach((x, i) => g.vline(x, 14 + (i % 2), 5 - (i % 2), i === 1 ? LEAF_L : LEAF)); },
    (g) => {
      [[4, 10], [6, 8], [8, 7], [10, 8], [12, 10]].forEach(([x, top]) => g.line(8, 19, x, top, x === 8 ? LEAF_L : LEAF));
      [[5, 12], [11, 12]].forEach(([x, y]) => g.line(8, 19, x, y, LEAF_D));
    },
    (g) => {
      const gold = '#f0c84a', goldD = '#cf9b2e';
      [[4, 9], [6, 7], [8, 6], [10, 7], [12, 9]].forEach(([x, top]) => g.line(8, 19, x, top, '#b8c860'));
      [[3, 8], [5, 6], [8, 5], [11, 6], [13, 8]].forEach(([x, y], i) => {
        g.line(x, y, x + (i < 2 ? -1 : 1), y + 3, gold);
        g.set(x, y, goldD); g.set(x + (i < 2 ? -1 : 1), y + 4, goldD);
        g.set(x + (i < 2 ? -1 : 1) * 0, y + 1, lighten(gold, 0.4));
      });
    },
  ],
  sweet_potato: [
    (g) => mound(g, '#a45fb4', 'chunk'),
    (g) => { g.vline(8, 16, 4, '#6d8a3a'); heartLeaf(g, 8, 13, LEAF); },
    (g) => {
      g.line(8, 19, 3, 17, '#7a5a8a'); g.line(8, 19, 13, 17, '#7a5a8a'); g.vline(8, 14, 6, '#7a5a8a');
      heartLeaf(g, 3, 13, LEAF); heartLeaf(g, 13, 13, LEAF); heartLeaf(g, 8, 10, LEAF_L); heartLeaf(g, 6, 15, LEAF_D);
    },
    (g) => {
      g.line(8, 18, 2, 15, '#7a5a8a'); g.line(8, 18, 14, 15, '#7a5a8a');
      heartLeaf(g, 2, 11, LEAF_D); heartLeaf(g, 14, 11, LEAF_D); heartLeaf(g, 5, 9, LEAF); heartLeaf(g, 11, 9, LEAF); heartLeaf(g, 8, 7, LEAF_L);
      blob(g, 8, 18.5, 3.8, 1.9, '#a24fb3'); g.set(6, 17, '#d79ae0'); g.set(10, 19, '#7a3a8a');
    },
  ],
  tomato: [
    (g) => mound(g, '#e8d66a'),
    (g) => { g.vline(8, 14, 6, STEM); g.line(8, 16, 5, 14, LEAF); g.line(8, 15, 11, 13, LEAF); g.set(5, 13, LEAF_L); g.set(11, 12, LEAF_L); },
    (g) => {
      g.vline(11, 6, 14, '#b8895a');
      g.vline(8, 9, 11, STEM);
      [[5, 11], [10, 9], [5, 15], [11, 14], [8, 8]].forEach(([x, y]) => blob(g, x, y, 2.2, 1.5, LEAF));
      blob(g, 7, 13, 1.4, 1.4, '#9fd060'); blob(g, 10, 16, 1.4, 1.4, '#9fd060');
    },
    (g) => {
      g.vline(12, 4, 16, '#b8895a'); g.set(12, 4, '#8a6040');
      g.vline(8, 6, 14, STEM);
      [[4, 9], [11, 7], [4, 15], [12, 13], [8, 5], [7, 11]].forEach(([x, y]) => blob(g, x, y, 2.2, 1.6, LEAF_D));
      [[6, 12], [10, 11], [8, 16], [5, 17]].forEach(([x, y]) => {
        blob(g, x, y, 1.9, 1.8, '#ec4a3e'); g.set(x, y - 2, LEAF); g.set(x - 1, y - 1, '#ffb0a0');
      });
    },
  ],
  corn: [
    (g) => mound(g, '#f6d24a'),
    (g) => { g.line(8, 19, 8, 13, STEM); g.line(8, 15, 5, 12, LEAF); g.line(8, 16, 11, 14, LEAF_L); },
    (g) => {
      g.vline(8, 6, 14, STEM); g.vline(9, 7, 13, LEAF_D);
      [[8, 15, 3, 12], [9, 13, 14, 10], [8, 11, 3, 7], [9, 9, 13, 5]].forEach(([a, b, c, d]) => g.line(a, b, c, d, LEAF));
      g.set(3, 13, LEAF_D); g.set(14, 11, LEAF_D);
    },
    (g) => {
      g.vline(8, 2, 18, STEM); g.vline(9, 3, 17, LEAF_D);
      [[8, 16, 2, 13], [9, 15, 15, 12], [8, 10, 3, 6], [9, 8, 14, 5]].forEach(([a, b, c, d]) => g.line(a, b, c, d, LEAF));
      g.line(8, 1, 6, 0, '#d8b45a'); g.line(8, 1, 10, 0, '#d8b45a'); g.set(8, 0, '#e8c66a'); // 수염꽃
      blob(g, 11, 11, 1.8, 3, '#f7d33e'); g.vline(10, 9, 5, '#8fc05a'); g.set(12, 8, '#8fc05a');
      g.set(11, 10, '#fff0a0'); g.set(11, 12, '#e0b030');
    },
  ],
  strawberry: [
    (g) => mound(g, '#e8505a'),
    (g) => { g.vline(8, 17, 3, STEM); blob(g, 6, 16, 1.6, 1.2, LEAF); blob(g, 10, 16, 1.6, 1.2, LEAF); blob(g, 8, 14.5, 1.6, 1.2, LEAF_L); },
    (g) => {
      [[4, 15], [8, 13], [12, 15], [6, 17], [10, 17]].forEach(([x, y]) => { blob(g, x - 1, y, 1.5, 1.2, LEAF); blob(g, x + 1, y, 1.5, 1.2, LEAF); blob(g, x, y - 1, 1.5, 1.2, LEAF_L); });
      flower(g, 5, 11, '#ffffff'); flower(g, 11, 12, '#ffffff');
    },
    (g) => {
      [[4, 14], [8, 12], [12, 14], [6, 16], [10, 16]].forEach(([x, y]) => { blob(g, x - 1, y, 1.6, 1.3, LEAF_D); blob(g, x + 1, y, 1.6, 1.3, LEAF_D); blob(g, x, y - 1, 1.6, 1.3, LEAF); });
      [[5, 17], [10, 18], [8, 15], [13, 17]].forEach(([x, y]) => {
        g.rect(x - 1, y, 3, 2, '#ee3f55'); g.set(x, y + 2, '#ee3f55'); g.hline(x - 1, y - 1, 3, LEAF_L);
        g.set(x - 1, y + 1, '#ffd84a'); g.set(x + 1, y, '#ffd84a');
      });
      flower(g, 11, 10, '#ffffff');
    },
  ],
  cabbage: [
    (g) => mound(g, '#d8e8a0'),
    (g) => { [[6, 17], [10, 17], [8, 15], [8, 18]].forEach(([x, y]) => blob(g, x, y, 1.6, 1.3, LEAF_L)); },
    (g) => {
      [[4, 16], [12, 16], [5, 12], [11, 12], [8, 18]].forEach(([x, y]) => blob(g, x, y, 2.6, 2, LEAF));
      blob(g, 8, 14.5, 2.6, 2.3, '#b9e48a');
    },
    (g) => {
      [[3, 16], [13, 16], [4, 11], [12, 11], [8, 19]].forEach(([x, y]) => blob(g, x, y, 2.8, 2.2, LEAF_D, false));
      blob(g, 8, 14.5, 5, 4.4, '#aee07c');
      g.line(8, 11, 8, 18, '#d4f0b0'); g.line(8, 14, 5, 12, '#d4f0b0'); g.line(8, 14, 11, 12, '#d4f0b0');
      g.set(6, 11, '#e6f8cc'); g.set(5, 12, '#e6f8cc');
    },
  ],
  pumpkin: [
    (g) => mound(g, '#f4ead0'),
    (g) => { g.vline(8, 17, 3, STEM); blob(g, 5.5, 16, 2.6, 1.7, LEAF_D); blob(g, 10.5, 16, 2.6, 1.7, LEAF_D); },
    (g) => {
      g.line(2, 18, 14, 17, STEM);
      [[3, 15], [8, 13], [13, 14]].forEach(([x, y]) => { blob(g, x, y, 2.6, 2.2, LEAF); g.set(x, y - 2, LEAF_D); });
      flower(g, 6, 11, '#ffd23a', '#f08a2a'); blob(g, 11, 18, 1.8, 1.5, '#8fc860');
    },
    (g) => {
      g.line(2, 19, 14, 18, STEM);
      [[2, 14], [14, 13]].forEach(([x, y]) => blob(g, x, y, 2.6, 2.2, LEAF));
      blob(g, 8, 16.5, 5.6, 4.2, '#f39236');
      [5, 8, 11].forEach((x) => g.vline(x, 13, 7, '#d8701e'));
      g.set(5, 14, '#ffc07a'); g.set(6, 13, '#ffc07a');
      g.rect(7, 11, 2, 2, '#7a5a30'); g.set(9, 11, LEAF);
    },
  ],
  watermelon: [
    (g) => mound(g, '#2d2a2a'),
    (g) => { g.vline(8, 17, 3, STEM); blob(g, 6, 16, 2, 1.3, LEAF); blob(g, 10, 16, 2, 1.3, LEAF); g.set(11, 14, STEM); g.set(12, 13, STEM); g.set(13, 14, STEM); },
    (g) => {
      g.line(1, 17, 15, 18, STEM);
      [[3, 14], [8, 13], [13, 15]].forEach(([x, y]) => blob(g, x, y, 2.4, 1.9, LEAF));
      blob(g, 9, 17.5, 2.4, 1.9, '#7cc25a'); g.vline(9, 16, 3, '#3f8a3a');
      g.set(5, 11, STEM); g.set(6, 10, STEM);
    },
    (g) => {
      blob(g, 12.5, 11, 2.2, 1.6, LEAF); g.set(11, 12, STEM); g.set(10, 12, STEM);
      g.ellipse(8, 16.5, 6, 4.6, '#5fb54e');
      [4, 7, 10, 13].forEach((x, i) => { for (let y = 12; y <= 21; y++) { const xx = x + ((y + i) % 3 === 0 ? 1 : 0); if (g.get(xx, y) === '#5fb54e') g.set(xx, y, '#2f7d3a'); } });
      g.set(5, 14, '#b5ec8f'); g.set(6, 13, '#b5ec8f'); g.set(4, 15, '#b5ec8f');
    },
  ],
};

export function drawCrop(cropId: string, stage: number): PixelGrid {
  const g = new PixelGrid(CROP_W, CROP_H);
  const art = CROP_ART[cropId] ?? CROP_ART.carrot;
  art[Math.max(0, Math.min(3, stage))](g);
  g.outline('#3d3a2a', 0.55);
  return g;
}

// ───────────────────────── 아이콘 (16×16) ─────────────────────────
const ICONS: Record<string, Draw> = {
  carrot: (g) => {
    for (let i = 0; i < 9; i++) { const w = Math.max(1, 3 - Math.floor(i / 3)); g.rect(4 + i - Math.floor(w / 2), 13 - i - Math.floor(w / 2) + 0, w + 1, w, '#f58a3a'); }
    g.set(6, 10, '#ffc08a'); g.set(7, 9, '#ffc08a'); g.set(8, 10, '#d86f28'); g.set(6, 12, '#d86f28');
    g.line(12, 4, 14, 1, LEAF); g.line(12, 4, 11, 1, LEAF_L); g.line(12, 4, 15, 4, LEAF_D);
  },
  potato: (g) => { blob(g, 8, 9, 5.5, 4.2, '#d8b06a'); [[6, 8], [10, 10], [9, 6]].forEach(([x, y]) => g.set(x, y, '#a87e42')); g.set(5, 7, '#f2d8a0'); },
  rice: (g) => {
    for (let x = 5; x <= 10; x++) g.line(x, 14, 8 + (x - 7.5) * 1.6, 3, '#d8b44a');
    [3, 5, 7, 9, 11, 13].forEach((x, i) => { g.set(x, 2 + (i % 2), '#f6d45a'); g.set(x, 4 + (i % 2), '#f6d45a'); });
    g.hline(5, 10, 6, '#c8574a');
  },
  sweet_potato: (g) => { blob(g, 8, 9, 6, 3.4, '#a24fb3'); g.set(1, 9, '#7a3a8a'); g.set(14, 9, '#7a3a8a'); g.hline(5, 7, 4, '#d79ae0'); g.set(9, 10, '#7a3a8a'); },
  tomato: (g) => { blob(g, 8, 9, 5.4, 4.8, '#ec4a3e'); g.hline(6, 4, 5, LEAF); g.set(8, 3, LEAF_D); g.set(5, 6, '#ffb0a0'); g.set(6, 6, '#ffb0a0'); g.set(5, 7, '#ffb0a0'); },
  corn: (g) => {
    blob(g, 8, 8, 3, 6, '#f7d33e', false);
    for (let y = 3; y <= 13; y += 2) for (let x = 6; x <= 10; x += 2) g.tint(x + (y % 4 === 1 ? 1 : 0), y, '#e8b72a');
    g.line(4, 14, 6, 6, LEAF); g.line(12, 14, 10, 6, LEAF_D); g.line(5, 14, 7, 9, LEAF_L); g.set(7, 4, '#fff0a0');
  },
  strawberry: (g) => {
    g.rect(4, 5, 9, 4, '#ee3f55'); g.rect(5, 9, 7, 2, '#ee3f55'); g.rect(6, 11, 5, 1, '#ee3f55'); g.rect(7, 12, 3, 1, '#ee3f55'); g.set(8, 13, '#ee3f55');
    g.hline(4, 4, 9, LEAF); g.set(6, 3, LEAF_D); g.set(8, 2, LEAF_D); g.set(10, 3, LEAF_D);
    [[5, 6], [9, 6], [7, 8], [11, 7], [6, 10], [9, 10], [8, 12]].forEach(([x, y]) => g.set(x, y, '#ffe066'));
    g.set(5, 5, '#ff9aa8');
  },
  cabbage: (g) => {
    blob(g, 8, 9, 6, 5.2, '#8fd062', false); blob(g, 8, 8, 4.2, 3.8, '#c0ea94', false);
    g.line(8, 5, 8, 12, '#e3f6c8'); g.line(8, 9, 5, 6, '#e3f6c8'); g.line(8, 9, 11, 6, '#e3f6c8');
  },
  pumpkin: (g) => {
    blob(g, 8, 9.5, 6.4, 4.8, '#f39236'); [5, 8, 11].forEach((x) => g.vline(x, 6, 8, '#d8701e'));
    g.rect(7, 3, 2, 3, '#7a5a30'); g.set(9, 3, LEAF); g.set(10, 2, LEAF); g.set(4, 7, '#ffc07a'); g.set(4, 8, '#ffc07a');
  },
  watermelon: (g) => {
    blob(g, 8, 8.5, 6.6, 5.4, '#5fb54e');
    [3, 6, 9, 12].forEach((x, i) => { for (let y = 3; y <= 14; y++) { const xx = x + ((y + i) % 3 === 0 ? 1 : 0); if (g.get(xx, y)) g.set(xx, y, '#2f7d3a'); } });
    g.set(4, 5, '#b5ec8f'); g.set(5, 4, '#b5ec8f');
  },
};

export const CROP_COLORS: Record<string, string> = {
  carrot: '#f58a3a', potato: '#d8b06a', rice: '#e8c04a', sweet_potato: '#a24fb3', tomato: '#ec4a3e',
  corn: '#f7d33e', strawberry: '#ee3f55', cabbage: '#8fd062', pumpkin: '#f39236', watermelon: '#5fb54e',
};

export function drawCropIcon(cropId: string): PixelGrid {
  const g = new PixelGrid(16, 16);
  (ICONS[cropId] ?? ICONS.carrot)(g);
  g.outline('#3d2a2a', 0.6);
  return g;
}

/** 씨앗 봉투 아이콘: 봉투 색 띠 + 작물 그림 미니 스탬프 */
export function drawSeedIcon(cropId: string): PixelGrid {
  const g = new PixelGrid(16, 16);
  const band = CROP_COLORS[cropId] ?? '#f58a3a';
  g.rect(3, 2, 10, 13, '#f6ecd2');
  g.rect(3, 2, 10, 3, band);
  g.hline(3, 5, 10, darken(band, 0.2));
  g.hline(4, 1, 8, '#e6d8b8');
  g.vline(12, 5, 10, '#e0d0ae');
  g.hline(3, 14, 10, '#e0d0ae');
  // 작물 미니 아이콘 (아이콘을 절반 크기로 샘플링)
  const icon = new PixelGrid(16, 16);
  (ICONS[cropId] ?? ICONS.carrot)(icon);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const c = icon.get(x * 2, y * 2) ?? icon.get(x * 2 + 1, y * 2 + 1) ?? icon.get(x * 2 + 1, y * 2);
    if (c) g.set(4 + x, 6 + y, c);
  }
  g.set(4, 3, lighten(band, 0.5));
  g.outline('#5a4030', 0.5);
  return g;
}
