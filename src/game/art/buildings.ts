/**
 * 건물 스프라이트: 씨앗 상점, 농산물 판매소, 농장 집, 마을 집
 */
import { darken, lighten, PixelGrid } from './pixel';

const OUT = '#4a3036';

function roof(g: PixelGrid, x: number, y: number, w: number, h: number, color: string, overhang = 2) {
  const dark = darken(color, 0.18), light = lighten(color, 0.22);
  for (let j = 0; j < h; j++) {
    const inset = Math.max(0, Math.round((h - j - 1) * 0.55) - 1);
    const x0 = x - overhang + inset, x1 = x + w + overhang - inset;
    for (let i = x0; i < x1; i++) {
      // 비늘 모양 기와
      const row = Math.floor(j / 3);
      const k = (i - x0 + (row % 2) * 2) % 4;
      let c = color;
      if (j % 3 === 2) c = k === 0 || k === 3 ? dark : color;
      if (j % 3 === 0 && k === 1) c = light;
      g.set(i, y + j, c);
    }
  }
  // 처마 장식선
  g.hline(x - overhang, y + h, w + overhang * 2, darken(color, 0.32));
  g.hline(x - overhang + 1, y + h - 1, w + overhang * 2 - 2, dark);
  // 용마루 하이라이트
  g.hline(x + Math.round(h * 0.55) - 1, y, w - Math.round(h * 0.55) * 2 + 2, lighten(color, 0.35));
}

function walls(g: PixelGrid, x: number, y: number, w: number, h: number, color: string, planks = true) {
  g.rect(x, y, w, h, color);
  if (planks) for (let j = y + 3; j < y + h; j += 4) g.hline(x, j, w, darken(color, 0.1));
  g.vline(x, y, h, lighten(color, 0.15));
  g.vline(x + w - 1, y, h, darken(color, 0.15));
  g.hline(x, y + h - 1, w, darken(color, 0.2));
  // 기초석
  g.hline(x - 1, y + h, w + 2, '#b8ab98');
  g.hline(x - 1, y + h + 1, w + 2, '#9e917e');
}

function windowBox(g: PixelGrid, x: number, y: number, frame = '#a8744a', flowers = '#ff8fab') {
  g.rect(x, y, 10, 9, frame);
  g.rect(x + 1, y + 1, 8, 7, '#9fd6ec');
  g.rect(x + 1, y + 1, 8, 2, '#c8ecf8');
  g.vline(x + 5, y + 1, 7, frame); g.hline(x + 1, y + 4, 8, frame);
  g.set(x + 2, y + 2, '#ffffff'); g.set(x + 3, y + 2, '#ffffff');
  // 화분 상자
  g.rect(x - 1, y + 9, 12, 3, '#b8784e'); g.hline(x - 1, y + 9, 12, '#d0946a');
  for (let i = 0; i < 5; i++) { g.set(x + i * 2, y + 8, i % 2 ? '#7cc455' : flowers); g.set(x + i * 2 + 1, y + 8, '#7cc455'); }
}

function door(g: PixelGrid, x: number, y: number, color = '#b8784e', w = 10, h = 14) {
  g.rect(x, y + 2, w, h - 2, color);
  g.hline(x + 1, y + 1, w - 2, color); g.hline(x + 2, y, w - 4, color);
  g.vline(x + Math.floor(w / 2), y + 2, h - 2, darken(color, 0.2));
  g.rect(x + 2, y + 4, 2, 3, '#ffe9a8'); g.rect(x + w - 4, y + 4, 2, 3, '#ffe9a8');
  g.set(x + Math.floor(w / 2) - 2, y + 9, '#ffd84a'); g.set(x + Math.floor(w / 2) + 1, y + 9, '#ffd84a');
  g.vline(x, y + 2, h - 2, lighten(color, 0.15));
}

function chimney(g: PixelGrid, x: number, y: number) {
  g.rect(x, y, 6, 9, '#c0846a'); g.hline(x - 1, y, 8, '#9a6450'); g.vline(x, y + 1, 8, '#d89a80');
  g.hline(x + 1, y + 4, 4, '#a87060');
}

/** 씨앗 상점 (80×76): 크림색 벽 + 분홍 지붕 + 줄무늬 차양 + 씨앗 간판 */
export function seedShop(): PixelGrid {
  const g = new PixelGrid(80, 76);
  chimney(g, 58, 2);
  roof(g, 8, 6, 64, 24, '#f08aa6');
  walls(g, 8, 31, 64, 36, '#fbefd6');
  // 기둥
  [8, 71].forEach((x) => g.rect(x, 31, 2, 36, '#c8905a'));
  // 줄무늬 차양
  for (let i = 0; i < 64; i++) {
    const stripe = Math.floor(i / 4) % 2 === 0;
    g.vline(8 + i, 31, 5, stripe ? '#7cc485' : '#fffaf0');
    g.set(8 + i, 36, i % 4 === 1 || i % 4 === 2 ? (stripe ? '#7cc485' : '#fffaf0') : null);
  }
  g.hline(8, 31, 64, '#5aa465');
  windowBox(g, 14, 42, '#a8744a', '#ffd84a');
  windowBox(g, 56, 42, '#a8744a', '#ff8fab');
  door(g, 35, 52, '#b8784e', 10, 15);
  // 간판 (씨앗 모양)
  g.rect(28, 38, 24, 11, '#c8905a'); g.rect(29, 39, 22, 9, '#fff6e0');
  g.ellipse(36, 43.5, 3, 2.2, '#a8744a'); g.vline(36, 40, 3, '#7cc455'); g.set(35, 40, '#7cc455'); g.set(37, 39, '#9ad868');
  g.ellipse(44, 43.5, 3, 2.2, '#d8a050'); g.vline(44, 40, 2, '#7cc455'); g.set(45, 40, '#9ad868');
  g.outline(OUT, 0.5);
  g.shadow(40, 70, 36, 3);
  return g;
}

/** 농산물 판매소 (80×68): 열린 가판대 + 주황 줄무늬 차양 + 채소 바구니 */
export function market(): PixelGrid {
  const g = new PixelGrid(80, 68);
  roof(g, 6, 4, 68, 16, '#f2a65a');
  walls(g, 6, 21, 68, 38, '#e8c89a');
  // 열린 창구
  g.rect(12, 26, 56, 18, '#8a5a3e');
  g.rect(13, 27, 54, 16, '#a8744e');
  // 차양
  for (let i = 0; i < 60; i++) {
    const stripe = Math.floor(i / 5) % 2 === 0;
    for (let j = 0; j < 6; j++) g.set(10 + i, 21 + j, stripe ? '#f27a5a' : '#fff6ea');
    if (i % 5 === 2) g.set(10 + i, 27, stripe ? '#f27a5a' : '#fff6ea');
  }
  // 진열대 위 채소
  const veg = ['#f58a3a', '#ec4a3e', '#f7d33e', '#8fd062', '#a24fb3', '#5fb54e', '#ee3f55'];
  veg.forEach((c, i) => {
    const x = 15 + i * 7;
    g.rect(x, 38, 6, 5, '#c8905a');
    g.ellipse(x + 3, 37, 3, 2.2, c); g.set(x + 2, 36, lighten(c, 0.4));
  });
  g.rect(10, 43, 60, 4, '#c8905a'); g.hline(10, 43, 60, '#e0aa74');
  // 칠판 가격표
  g.rect(28, 30, 24, 7, '#4a6a5a'); g.hline(30, 32, 8, '#f6f0e0'); g.hline(41, 32, 8, '#ffe066'); g.hline(30, 34, 6, '#f6f0e0'); g.hline(41, 34, 7, '#ffe066');
  door(g, 56, 46, '#b8784e', 10, 12);
  windowBox(g, 14, 47, '#a8744a', '#ffd84a');
  g.outline(OUT, 0.5);
  g.shadow(40, 62, 36, 3);
  return g;
}

/** 농장 집 (64×64) */
export function farmHouse(roofColor = '#d0705a'): PixelGrid {
  const g = new PixelGrid(64, 64);
  chimney(g, 44, 2);
  roof(g, 6, 6, 52, 22, roofColor);
  walls(g, 8, 29, 48, 26, '#e8c08a');
  windowBox(g, 13, 34, '#9a6a44', '#ff8fab');
  windowBox(g, 41, 34, '#9a6a44', '#ffd84a');
  door(g, 27, 40, '#9a6a44', 10, 15);
  g.rect(25, 55, 14, 2, '#c9b89c');
  g.outline(OUT, 0.5);
  g.shadow(32, 59, 28, 2.5);
  return g;
}

/** 마을 장식용 집 (56×58) */
export function cottage(roofColor: string, wallColor = '#fbefd6'): PixelGrid {
  const g = new PixelGrid(56, 58);
  roof(g, 6, 4, 44, 20, roofColor);
  walls(g, 7, 25, 42, 24, wallColor);
  windowBox(g, 11, 30, '#9a6a44', '#ff8fab');
  door(g, 32, 35, '#9a6a44', 10, 14);
  g.outline(OUT, 0.5);
  g.shadow(28, 53, 24, 2.5);
  return g;
}

/** 햇살 카지노 (80×72): 라벤더 지붕 + 반짝이는 전구 + 룰렛 간판 */
export function casino(): PixelGrid {
  const g = new PixelGrid(80, 72);
  roof(g, 8, 6, 64, 20, '#a98ad8');
  walls(g, 8, 27, 64, 36, '#fff0f6');
  // 지붕 아래 전구 장식
  for (let x = 8; x < 72; x += 4) { g.set(x, 27, x % 8 === 0 ? '#ffe066' : '#ff8fab'); g.set(x + 1, 27, '#fffbe0'); }
  // 금색 기둥
  [8, 71].forEach((x) => { g.rect(x, 28, 2, 35, '#e8b84a'); g.vline(x, 28, 35, '#f6d47a'); });
  windowBox(g, 13, 40, '#c8905a', '#ffd84a');
  windowBox(g, 57, 40, '#c8905a', '#ff8fab');
  door(g, 35, 48, '#b06a9a', 10, 15);
  // 룰렛 간판
  g.rect(26, 30, 28, 15, '#7a4e8a'); g.rect(27, 31, 26, 13, '#fff6e0');
  g.ellipse(33, 37.5, 5, 5, '#e85a6a');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.line(33, 37, Math.round(33 + Math.cos(a) * 4), Math.round(37 + Math.sin(a) * 4), i % 2 ? '#ffe066' : '#5aa0e0');
  }
  g.set(33, 37, '#ffffff'); g.set(33, 31, '#4a3036');
  // 별 + 동전
  g.set(44, 34, '#ffd84a'); g.hline(43, 35, 3, '#ffd84a'); g.set(44, 36, '#ffd84a'); g.set(43, 37, '#ffd84a'); g.set(45, 37, '#ffd84a');
  g.ellipse(48, 40, 2.2, 2.2, '#f2b83a'); g.set(48, 39, '#fff3b0');
  g.outline('#4a3036', 0.5);
  g.shadow(40, 66, 36, 3);
  return g;
}
