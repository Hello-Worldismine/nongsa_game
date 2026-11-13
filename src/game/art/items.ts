/**
 * 가구 · 낚싯대 · 물고기 · 비료 · 집 안 소품 픽셀 아트.
 * 가구는 색상(base)을 받아 같은 모양을 8가지 색으로 그립니다.
 * 가구 그림의 아래쪽 (w×16, h×16) 영역이 실제로 차지하는 칸이고, 키 큰 가구는 위로 더 올라가요.
 */
import { darken, hash2, lighten, PixelGrid } from './pixel';

const OUT = '#4a3036';
const WOOD = '#c8905a', WOOD_D = '#9a6a44', WOOD_L = '#e0b07a';

// ───────────────────────── 가구 ─────────────────────────
function bed(c: string) {
  const g = new PixelGrid(16, 34);
  g.rect(1, 0, 14, 8, WOOD); g.hline(1, 0, 14, WOOD_L); g.rect(3, 2, 10, 3, WOOD_D);
  g.set(7, 3, '#ff8fab'); g.set(8, 3, '#ff8fab'); // 하트 장식
  g.rect(1, 7, 14, 24, '#fff8ee');
  g.rect(3, 8, 10, 5, '#ffffff'); g.hline(3, 12, 10, '#e8ddd2'); g.set(3, 8, '#f3ece0'); g.set(12, 8, '#f3ece0');
  g.rect(1, 14, 14, 17, c);
  g.hline(1, 14, 14, lighten(c, 0.45)); g.hline(1, 15, 14, lighten(c, 0.25));
  for (let y = 18; y < 30; y += 4) for (let x = 3 + ((y / 4) % 2) * 2; x < 14; x += 4) g.set(x, y, lighten(c, 0.5));
  g.vline(1, 15, 16, darken(c, 0.15)); g.vline(14, 15, 16, darken(c, 0.15));
  g.rect(1, 30, 14, 3, WOOD); g.hline(1, 30, 14, WOOD_L); g.hline(1, 32, 14, WOOD_D);
  g.set(1, 33, WOOD_D); g.set(14, 33, WOOD_D);
  return g.outline(OUT, 0.5);
}

function sofa(c: string) {
  const g = new PixelGrid(32, 22);
  const d = darken(c, 0.14), l = lighten(c, 0.3);
  g.rect(3, 1, 26, 11, c); g.hline(3, 1, 26, l); g.hline(4, 2, 24, lighten(c, 0.15));
  g.vline(16, 3, 8, d); for (const x of [9, 23]) g.set(x, 6, d);
  g.rect(1, 6, 5, 13, d); g.hline(1, 6, 5, c); g.rect(26, 6, 5, 13, d); g.hline(26, 6, 5, c);
  g.rect(6, 11, 20, 6, lighten(c, 0.12)); g.hline(6, 11, 20, l); g.vline(16, 11, 6, d);
  g.rect(3, 17, 26, 3, darken(c, 0.25));
  g.rect(3, 20, 2, 1, WOOD_D); g.rect(27, 20, 2, 1, WOOD_D);
  return g.outline(OUT, 0.5);
}

function chair(c: string) {
  const g = new PixelGrid(16, 22);
  g.rect(3, 1, 10, 10, WOOD); g.hline(3, 1, 10, WOOD_L); g.rect(4, 3, 8, 5, c); g.hline(4, 3, 8, lighten(c, 0.3));
  g.rect(2, 10, 12, 5, c); g.hline(2, 10, 12, lighten(c, 0.35)); g.hline(2, 14, 12, darken(c, 0.2));
  g.vline(3, 15, 6, WOOD_D); g.vline(12, 15, 6, WOOD_D); g.vline(4, 15, 4, WOOD);
  return g.outline(OUT, 0.5);
}

function table(c: string) {
  const g = new PixelGrid(16, 18);
  g.vline(7, 10, 6, WOOD_D); g.vline(8, 10, 6, WOOD); g.hline(4, 16, 8, WOOD_D);
  g.ellipse(8, 6.5, 7, 4.5, c); g.ellipse(8, 5.5, 6, 3.2, lighten(c, 0.2));
  for (let x = 2; x < 15; x += 2) g.set(x, 10, lighten(c, 0.5)); // 레이스
  g.rect(9, 3, 3, 3, '#ffffff'); g.hline(9, 5, 3, '#e8ddd2'); g.set(12, 4, '#ffffff'); // 찻잔
  g.set(5, 5, '#ff8fab'); g.set(4, 4, '#ffd84a'); g.set(6, 4, '#ffd84a'); // 작은 꽃
  return g.outline(OUT, 0.5);
}

function desk(c: string) {
  const g = new PixelGrid(32, 22);
  g.rect(1, 4, 30, 4, lighten(c, 0.15)); g.hline(1, 4, 30, lighten(c, 0.45));
  g.rect(2, 8, 28, 10, c); g.hline(2, 17, 28, darken(c, 0.25));
  g.rect(18, 9, 10, 3, darken(c, 0.12)); g.rect(18, 13, 10, 3, darken(c, 0.12));
  g.set(23, 10, '#ffd84a'); g.set(23, 14, '#ffd84a');
  g.rect(4, 9, 12, 8, darken(c, 0.32)); // 의자 넣는 공간
  g.vline(2, 18, 3, WOOD_D); g.vline(29, 18, 3, WOOD_D);
  // 책상 위: 책 + 연필꽂이
  g.rect(4, 1, 6, 3, '#7fb8e6'); g.hline(4, 1, 6, '#a8d4f4'); g.rect(11, 2, 3, 2, '#f2d266');
  g.rect(24, 0, 3, 4, '#ef8a8a'); g.set(24, 0, '#ffd84a'); g.set(26, 0, '#8fcf6a');
  return g.outline(OUT, 0.5);
}

const BOOK = ['#ef8a8a', '#7fb8e6', '#8fcf6a', '#f2d266', '#b39ae0', '#7fd1bf', '#f6a986'];
function bookshelf(c: string) {
  const g = new PixelGrid(32, 30);
  g.rect(1, 0, 30, 29, c); g.hline(1, 0, 30, lighten(c, 0.4)); g.vline(1, 1, 28, lighten(c, 0.15));
  for (let row = 0; row < 3; row++) {
    const y0 = 2 + row * 9;
    g.rect(3, y0, 26, 7, '#7a5040');
    let x = 4;
    let i = 0;
    while (x < 27) {
      const w = 2 + Math.floor(hash2(x, row, 3) * 2);
      const hgt = 4 + Math.floor(hash2(x, row, 4) * 3);
      if (hash2(x, row, 9) < 0.15) { x += 2; continue; }
      const bc = BOOK[(i + row * 3) % BOOK.length];
      g.rect(x, y0 + 7 - hgt, Math.min(w, 28 - x), hgt, bc); g.set(x, y0 + 7 - hgt, lighten(bc, 0.4));
      x += w + 1; i++;
    }
    g.hline(3, y0 + 7, 26, darken(c, 0.2));
  }
  g.hline(1, 28, 30, darken(c, 0.3));
  return g.outline(OUT, 0.5);
}

function wardrobe(c: string) {
  const g = new PixelGrid(16, 30);
  g.rect(1, 2, 14, 26, c); g.rect(0, 0, 16, 3, lighten(c, 0.2)); g.hline(0, 0, 16, lighten(c, 0.45));
  g.vline(8, 4, 23, darken(c, 0.25)); g.vline(1, 3, 25, lighten(c, 0.15));
  g.rect(3, 5, 4, 8, lighten(c, 0.12)); g.rect(9, 5, 4, 8, lighten(c, 0.12));
  for (const x of [6, 9]) { g.set(x, 16, '#ff8fab'); g.set(x, 17, '#ff8fab'); }
  g.hline(1, 27, 14, darken(c, 0.3));
  g.set(2, 28, WOOD_D); g.set(13, 28, WOOD_D); g.set(2, 29, WOOD_D); g.set(13, 29, WOOD_D);
  return g.outline(OUT, 0.5, false);
}

function lamp(c: string) {
  const g = new PixelGrid(16, 28);
  for (let y = 1; y <= 10; y++) { const half = 3 + Math.floor(y / 2.5); g.hline(8 - half, y, half * 2, y < 3 ? lighten(c, 0.4) : c); }
  g.hline(3, 10, 10, darken(c, 0.2));
  for (let y = 4; y < 10; y += 3) for (let x = 6; x < 11; x += 3) g.set(x, y, lighten(c, 0.45));
  g.ellipse(8, 12, 2, 1.3, '#fff3b0'); // 전구 빛
  g.vline(7, 11, 13, '#bba48a'); g.vline(8, 11, 13, '#d8c4a8');
  g.ellipse(8, 25, 5, 2, darken(c, 0.2)); g.hline(5, 24, 6, c);
  return g.outline(OUT, 0.5);
}

function plant(c: string) {
  const g = new PixelGrid(16, 22);
  const L1 = '#6fbf4a', L2 = '#8fd85e', L3 = '#4f9a3a';
  g.ellipse(8, 7, 5, 5, L1); g.ellipse(4.5, 9, 3.2, 3.5, L3); g.ellipse(11.5, 9, 3.2, 3.5, L3);
  g.ellipse(8, 4, 3, 3, L2); g.ellipse(5, 6, 2, 2, L2); g.ellipse(11, 6, 2, 2, L2);
  g.set(8, 1, L2); g.set(7, 9, L2); g.set(10, 3, '#b8ee8a');
  g.rect(4, 13, 8, 8, c); g.rect(3, 12, 10, 3, lighten(c, 0.25)); g.hline(3, 12, 10, lighten(c, 0.5));
  g.hline(4, 20, 8, darken(c, 0.25)); g.set(6, 16, lighten(c, 0.45)); g.set(9, 17, lighten(c, 0.45));
  return g.outline(OUT, 0.5);
}

function teddy(c: string) {
  const g = new PixelGrid(16, 18);
  const l = lighten(c, 0.35), d = darken(c, 0.18);
  g.ellipse(4, 3, 2, 2, c); g.ellipse(12, 3, 2, 2, c); g.set(4, 3, l); g.set(12, 3, l);
  g.ellipse(8, 13, 5.2, 4.5, c); g.ellipse(8, 13.5, 2.8, 2.6, l);
  g.ellipse(3.5, 12, 1.8, 2.2, d); g.ellipse(12.5, 12, 1.8, 2.2, d);
  g.ellipse(5, 16.5, 2, 1.4, d); g.ellipse(11, 16.5, 2, 1.4, d);
  g.ellipse(8, 6.5, 4.6, 4, c); g.ellipse(8, 8, 2.2, 1.6, l);
  g.set(6, 6, OUT); g.set(10, 6, OUT); g.set(8, 7, OUT); g.set(5, 8, '#ffb0c0'); g.set(11, 8, '#ffb0c0');
  g.rect(6, 10, 4, 1, '#ff8fab'); g.set(5, 10, '#ff6f95'); g.set(10, 10, '#ff6f95');
  return g.outline(OUT, 0.5);
}

function rug(c: string) {
  const g = new PixelGrid(32, 32);
  g.ellipse(16, 16, 15, 14, darken(c, 0.08)); g.ellipse(16, 16, 13, 12, c);
  g.ellipse(16, 16, 9, 8, lighten(c, 0.3)); g.ellipse(16, 16, 7, 6, c);
  g.ellipse(16, 16, 3, 2.5, lighten(c, 0.5));
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    g.set(16 + Math.cos(t) * 11, 16 + Math.sin(t) * 10, lighten(c, 0.55));
  }
  return g;
}

function cushion(c: string) {
  const g = new PixelGrid(16, 16);
  g.ellipse(8, 8.5, 6.5, 5.5, c); g.ellipse(7, 7, 4, 3, lighten(c, 0.25)); g.set(5, 5, lighten(c, 0.55));
  g.set(8, 8, darken(c, 0.3)); g.set(8, 9, darken(c, 0.2));
  for (const [x, y] of [[2, 4], [14, 4], [2, 13], [14, 13]]) g.set(x, y, '#ffd84a');
  return g.outline(OUT, 0.45);
}

export const FURNITURE_ART: Record<string, (c: string) => PixelGrid> = {
  bed, sofa, chair, table, desk, bookshelf, wardrobe, lamp, plant, teddy, rug, cushion,
};

// ───────────────────────── 낚싯대 ─────────────────────────
const ROD_COLORS: Record<number, [string, string]> = {
  1: ['#b8865a', '#8a5c38'], 2: ['#a8d06a', '#6f9a3a'], 3: ['#d8e2ee', '#8894a4'], 4: ['#ffd45a', '#d89a2a'],
};
export function rodIcon(tier: number): PixelGrid {
  const [c, d] = ROD_COLORS[tier] ?? ROD_COLORS[1];
  const g = new PixelGrid(16, 16);
  g.line(2, 14, 12, 2, c); g.line(3, 14, 13, 2, d);
  if (tier === 2) for (const [x, y] of [[5, 11], [8, 7], [10, 5]]) g.set(x, y, '#5f8a30');
  g.ellipse(5, 11.5, 2, 2, '#9aa8b8'); g.set(5, 11, '#e0e8f0');
  g.vline(13, 3, 7, '#f4f4fa'); g.set(12, 10, '#9aa8b8'); g.set(12, 11, '#9aa8b8'); g.set(13, 11, '#9aa8b8');
  if (tier >= 3) { g.set(11, 1, '#ffffff'); g.set(9, 4, '#ffffff'); }
  if (tier === 4) { g.set(14, 1, '#fff6cc'); g.set(1, 9, '#fff6cc'); }
  return g.outline(OUT, 0.5);
}

// ───────────────────────── 물고기 ─────────────────────────
const FISH_ART: Record<string, { body: string; belly: string; fin: string; len?: number }> = {
  minnow: { body: '#b8c8d8', belly: '#eef4f8', fin: '#90a4b8', len: 4 },
  crucian: { body: '#c8a860', belly: '#f0dca8', fin: '#a08040' },
  carp: { body: '#e8904a', belly: '#ffd8a8', fin: '#c86a30' },
  catfish: { body: '#8a7a6a', belly: '#c8b8a4', fin: '#6a5a4a' },
  trout: { body: '#9ab890', belly: '#e8f0d8', fin: '#6a8a60' },
  salmon: { body: '#f29a7a', belly: '#ffd0bc', fin: '#d0705a' },
  eel: { body: '#6a7a50', belly: '#b8c890', fin: '#4a5a34', len: 6.8 },
  goldfish: { body: '#ffc832', belly: '#fff0a0', fin: '#f09a20' },
};
export function fishIcon(id: string): PixelGrid {
  const a = FISH_ART[id] ?? FISH_ART.minnow;
  const g = new PixelGrid(16, 16);
  const len = a.len ?? 5.2;
  const ry = id === 'eel' ? 2 : id === 'minnow' ? 2.4 : 3.2;
  g.ellipse(8.5, 8, len, ry, a.body);
  g.ellipse(8.5, 9.2, len - 1.2, ry * 0.45, a.belly);
  const tx = Math.round(8.5 - len);
  g.line(tx, 8, tx - 2, 5, a.fin); g.line(tx, 8, tx - 2, 11, a.fin); g.vline(tx - 2, 5, 7, a.fin); g.vline(tx - 1, 6, 5, a.fin);
  g.hline(7, Math.round(8 - ry), 3, a.fin);
  const ex = Math.round(8.5 + len - 2);
  g.set(ex, 7, '#ffffff'); g.set(ex, 7, OUT);
  if (id === 'catfish') { g.line(ex + 1, 9, ex + 3, 11, '#4a3a2a'); g.line(ex + 1, 8, ex + 3, 7, '#4a3a2a'); }
  if (id === 'trout' || id === 'salmon') g.hline(5, 8, 7, id === 'trout' ? '#f2a0b4' : '#ffb8a0');
  if (id === 'carp') { g.set(6, 7, '#ffffff'); g.set(9, 7, '#ffffff'); }
  g.outline(OUT, 0.5);
  if (id === 'goldfish') { g.set(2, 2, '#fff6cc'); g.set(13, 3, '#fff6cc'); g.set(12, 13, '#ffffff'); }
  return g;
}

// ───────────────────────── 비료 ─────────────────────────
export function fertIcon(minutes: number): PixelGrid {
  const big = minutes >= 10;
  const c = big ? '#b39ae0' : '#8fcf6a';
  const g = new PixelGrid(16, 16);
  g.rect(3, 4, 10, 10, c); g.rect(4, 2, 8, 3, darken(c, 0.12)); g.hline(4, 2, 8, lighten(c, 0.3));
  g.hline(3, 13, 10, darken(c, 0.25)); g.vline(3, 5, 8, lighten(c, 0.2));
  // 새싹 그림
  g.vline(8, 7, 4, '#4f9a3a'); g.set(7, 7, '#6fbf4a'); g.set(6, 6, '#6fbf4a'); g.set(9, 8, '#6fbf4a'); g.set(10, 7, '#6fbf4a');
  g.hline(6, 11, 5, '#a8744a');
  g.outline(OUT, 0.5);
  if (big) { g.set(13, 1, '#fff3a0'); g.set(14, 2, '#ffd84a'); g.set(12, 2, '#ffd84a'); g.set(13, 3, '#ffd84a'); }
  return g;
}

// ───────────────────────── 낚시 / 집 소품 ─────────────────────────
export function bobber(): PixelGrid {
  const g = new PixelGrid(6, 8);
  g.vline(3, 0, 2, '#ffffff');
  g.ellipse(3, 5, 2.6, 2.6, '#ffffff');
  g.rect(1, 3, 4, 2, '#ef4a4a'); g.set(2, 2, '#ef4a4a'); g.set(3, 2, '#ef4a4a'); g.set(2, 3, '#ff8a8a');
  return g;
}

export function exclaim(): PixelGrid {
  const g = new PixelGrid(10, 14);
  g.ellipse(5, 6, 4.5, 5.5, '#fff3a0'); g.set(5, 13, '#fff3a0'); g.set(4, 12, '#fff3a0');
  g.vline(4, 2, 6, '#ef6a4a'); g.vline(5, 2, 6, '#ef6a4a'); g.rect(4, 9, 2, 2, '#ef6a4a');
  return g.outline(OUT, 0.4);
}

export function houseWindow(): PixelGrid {
  const g = new PixelGrid(24, 20);
  g.rect(2, 1, 20, 16, '#ffffff'); g.rect(4, 3, 16, 12, '#bfe8f6'); g.hline(4, 3, 16, '#e2f6fc');
  g.vline(11, 3, 12, '#ffffff'); g.vline(12, 3, 12, '#ffffff'); g.hline(4, 8, 16, '#ffffff');
  g.set(6, 5, '#ffffff'); g.set(7, 4, '#ffffff'); g.set(15, 5, '#ffffff');
  for (let y = 1; y < 15; y++) { g.set(2, y, '#f6a0b8'); g.set(3, y, y % 3 ? '#f8b8c8' : '#f6a0b8'); g.set(20, y, y % 3 ? '#f8b8c8' : '#f6a0b8'); g.set(21, y, '#f6a0b8'); }
  g.rect(0, 16, 24, 3, WOOD); g.hline(0, 16, 24, WOOD_L);
  g.set(5, 15, '#ff8fab'); g.set(7, 15, '#ffd84a'); g.set(17, 15, '#ff8fab'); g.set(6, 15, '#6fbf4a'); g.set(18, 15, '#6fbf4a');
  return g.outline(OUT, 0.5);
}

export function wallClock(): PixelGrid {
  const g = new PixelGrid(12, 12);
  g.ellipse(6, 6, 5, 5, WOOD); g.ellipse(6, 6, 3.8, 3.8, '#fff8ee');
  g.vline(6, 3, 3, OUT); g.hline(6, 6, 3, OUT); g.set(6, 6, '#ef6a4a');
  return g.outline(OUT, 0.4);
}

export function doorMat(): PixelGrid {
  const g = new PixelGrid(16, 10);
  g.rect(1, 1, 14, 8, '#e8a07a'); g.rect(2, 2, 12, 6, '#f2c09a');
  for (let x = 3; x < 13; x += 2) g.set(x, 5, '#e8a07a');
  return g;
}

/** 비료 준 밭: 칸 가장자리와 흙 위에 뿌려진 하얀 가루 (16×16, 작물 위에 살짝 겹쳐 그림) */
export function fertPowder(): PixelGrid {
  const g = new PixelGrid(16, 16);
  const W = ['#ffffff', '#f6f2ec', '#ffffff', '#e8e3da'];
  // 가장자리 점선 테두리 (작물이 커도 보이도록)
  for (let i = 0; i < 16; i++) {
    if ((i + 1) % 3 !== 0) {
      g.set(i, 0, W[i % 4]); g.set(i, 15, W[(i + 1) % 4]);
      g.set(0, i, W[(i + 2) % 4]); g.set(15, i, W[(i + 3) % 4]);
    }
  }
  // 흙 위 가루
  for (let i = 0; i < 30; i++) {
    const x = 1 + Math.floor(hash2(i, 3, 91) * 14), y = 8 + Math.floor(hash2(i, 7, 92) * 7);
    g.set(x, y, W[i % 4]);
  }
  // 반짝
  g.set(2, 2, '#fffbe0'); g.set(13, 13, '#fffbe0'); g.set(13, 2, '#fffbe0');
  return g;
}
