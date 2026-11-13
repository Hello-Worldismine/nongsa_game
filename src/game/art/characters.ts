/**
 * SD(2~2.5등신) 캐릭터 스프라이트 생성기.
 * 프레임 16×22, 방향 4개(아래/왼쪽/오른쪽/위) × 프레임 4개(서기, 걸음A, 걸음B, 앉기)
 */
import {
  HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, sanitizeAppearance, type Appearance,
} from '@/config/appearance';
import { darken, lighten, mix, PixelGrid, sheet } from './pixel';

export const CHAR_W = 16;
export const CHAR_H = 22;
export const CHAR_DIRS = ['down', 'left', 'right', 'up'] as const;
export const CHAR_FRAMES = 4; // 0 서기, 1 걸음A, 2 걸음B, 3 앉기

interface Pal {
  skin: string; skinSh: string; blush: string; mouth: string;
  hair: string; hairHi: string; hairSh: string;
  out: string; outSh: string; outHi: string;
  shirt: string; shirtSh: string; pants: string; pantsSh: string;
  shoe: string; eye: string; ribbon: string;
}

function palette(a: Appearance): Pal {
  const skin = SKIN_TONES[a.skin].base;
  const hair = HAIR_COLORS[a.hairColor].base;
  const out = OUTFIT_COLORS[a.outfitColor].base;
  const pants = a.outfit === 0 ? out : a.outfit === 1 ? '#5f6a9a' : a.outfit === 3 ? '#8a6248' : skin;
  return {
    skin, skinSh: mix(skin, '#c27a6a', 0.28), blush: mix(skin, '#ff6f86', 0.42), mouth: mix(skin, '#a8404c', 0.55),
    hair, hairHi: lighten(hair, 0.32), hairSh: darken(hair, 0.22),
    out, outSh: darken(out, 0.2), outHi: lighten(out, 0.3),
    shirt: '#fff8ea', shirtSh: '#e8dcc6',
    pants, pantsSh: darken(pants, 0.2),
    shoe: '#8b5a3e', eye: '#3a2633',
    ribbon: a.hairColor === 3 ? '#ffffff' : '#ff7d93',
  };
}

const inHead = (x: number, y: number, cy: number) => {
  const dx = (x + 0.5 - 8) / 5.6, dy = (y + 0.5 - cy) / 4.9;
  return dx * dx + dy * dy <= 1;
};

/** 머리 윗부분(모자처럼 덮는 머리카락) */
function hairCap(g: PixelGrid, p: Pal, top: number, bottom: number, cy: number) {
  for (let y = top; y <= bottom; y++) for (let x = 0; x < 16; x++) {
    const dx = (x + 0.5 - 8) / 6.0, dy = (y + 0.5 - (cy - 0.4)) / 5.3;
    if (dx * dx + dy * dy <= 1) g.set(x, y, p.hair);
  }
}

function drawLegs(g: PixelGrid, p: Pal, dir: string, frame: number, torsoBottom: number, dress: boolean) {
  if (frame === 3) return; // 앉기: 다리 숨김
  const ground = 20;
  const legColor = dress ? p.skin : p.pants;
  const legShade = dress ? p.skinSh : p.pantsSh;
  const leg = (x: number, bottom: number, shade = false) => {
    for (let y = torsoBottom + 1; y <= bottom; y++) {
      const isFoot = y === bottom;
      g.set(x, y, isFoot ? p.shoe : shade ? legShade : legColor);
      g.set(x + 1, y, isFoot ? darken(p.shoe, 0.15) : legShade);
    }
  };
  if (dir === 'down' || dir === 'up') {
    const lb = frame === 1 ? ground - 1 : ground;
    const rb = frame === 2 ? ground - 1 : ground;
    leg(5, lb);
    leg(9, rb);
  } else {
    // 옆모습: 앞다리/뒷다리
    if (frame === 0) { leg(8, ground, true); leg(6, ground); }
    else if (frame === 1) { leg(9, ground, true); leg(5, ground - 1); }
    else { leg(5, ground, true); leg(9, ground - 1); }
  }
}

function drawTorso(g: PixelGrid, p: Pal, a: Appearance, dir: string, top: number) {
  const side = dir === 'left';
  const x0 = side ? 6 : 5, w = side ? 5 : 6;
  const bottom = top + 4;
  for (let y = top; y <= bottom; y++) for (let x = x0; x < x0 + w; x++) {
    let c = p.out;
    if (a.outfit === 0 || a.outfit === 3) c = p.shirt;
    g.set(x, y, c);
  }
  const front = dir === 'down';
  switch (a.outfit) {
    case 0: // 멜빵 바지: 셔츠 위 가슴판 + 멜빵끈
      if (dir !== 'up') {
        g.rect(x0 + (side ? 1 : 1), top + 2, side ? 3 : 4, 3, p.out);
        if (front) { g.set(x0 + 1, top, p.out); g.set(x0 + 4, top, p.out); g.set(x0 + 1, top + 1, p.out); g.set(x0 + 4, top + 1, p.out); g.set(x0 + 2, top + 3, p.outHi); }
        else g.set(x0 + 2, top + 1, p.out);
      } else {
        g.line(x0 + 1, top, x0 + 4, top + 3, p.out); g.line(x0 + 4, top, x0 + 1, top + 3, p.out);
        g.hline(x0, top + 4, w, p.out);
      }
      break;
    case 1: // 후드티: 후드 테두리 + 주머니
      if (front) { g.hline(x0 + 1, top + 3, 4, p.outSh); g.set(x0 + 2, top, p.shirt); g.set(x0 + 3, top, p.shirt); g.set(x0 + 2, top + 1, p.outHi); }
      if (dir === 'up') { g.rect(x0 + 1, top, 4, 2, p.outSh); }
      if (side) g.set(x0 + 3, top, p.outSh);
      break;
    case 2: // 원피스: 아래로 퍼지는 치마 + 리본
      for (let y = bottom - 1; y <= bottom + 1; y++) {
        const spread = y - (bottom - 1) + 1;
        for (let x = x0 - spread + (side ? 1 : 0); x < x0 + w + spread - (side ? 0 : 0); x++) g.set(x, y, y === bottom + 1 ? p.outSh : p.out);
      }
      if (front) { g.set(x0 + 2, top, p.shirt); g.set(x0 + 3, top, p.shirt); g.hline(x0, top + 2, w, p.outHi); }
      break;
    case 3: // 농부 조끼: 양옆 조끼 + 단추
      if (dir === 'up') g.rect(x0, top, w, 5, p.out);
      else if (front) { g.rect(x0, top, 2, 5, p.out); g.rect(x0 + 4, top, 2, 5, p.out); g.set(x0 + 1, top + 2, p.outHi); }
      else g.rect(x0 + 2, top, 3, 5, p.out);
      g.hline(x0, bottom, w, a.outfit === 3 ? p.pants : p.out);
      break;
  }
  // 음영 (오른쪽 / 아래)
  for (let y = top; y <= bottom + (a.outfit === 2 ? 1 : 0); y++) {
    for (let x = 0; x < 16; x++) {
      const c = g.get(x, y);
      if (c && (g.get(x + 1, y) === null || x === x0 + w - 1) && x >= x0 + w - 1) g.set(x, y, darken(c, 0.14));
    }
  }
}

function drawArms(g: PixelGrid, p: Pal, a: Appearance, dir: string, frame: number, top: number) {
  const sleeve = a.outfit === 0 || a.outfit === 3 ? p.shirt : p.out;
  const sleeveSh = a.outfit === 0 || a.outfit === 3 ? p.shirtSh : p.outSh;
  if (dir === 'down' || dir === 'up') {
    const swingL = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    const swingR = -swingL;
    const arm = (x: number, sw: number) => {
      const t = top + 1 + Math.max(0, sw);
      g.set(x, t - 1 + (sw < 0 ? 0 : 0), sleeve);
      g.set(x, t, sleeve);
      g.set(x, t + 1, sleeveSh);
      g.set(x, t + 2, frame === 3 ? p.skinSh : p.skin);
    };
    if (frame === 3) { arm(4, 0); arm(11, 0); return; }
    arm(4, swingL);
    arm(11, swingR);
  } else {
    const ax = frame === 1 ? 6 : frame === 2 ? 9 : 8;
    g.set(ax, top + 1, sleeve); g.set(ax, top + 2, sleeveSh); g.set(ax, top + 3, p.skin);
    if (frame !== 0) g.set(ax + (frame === 1 ? -1 : 1), top + 3, p.skin);
  }
}

function drawHead(g: PixelGrid, p: Pal, cy: number) {
  for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) if (inHead(x, y, cy)) g.set(x, y, p.skin);
}

function drawFace(g: PixelGrid, p: Pal, dir: string, cy: number) {
  const ey = Math.round(cy) + 0;
  if (dir === 'down') {
    // 크고 반짝이는 눈
    g.set(4, ey, p.eye); g.set(5, ey, p.eye); g.set(4, ey + 1, p.eye); g.set(5, ey + 1, p.eye);
    g.set(10, ey, p.eye); g.set(11, ey, p.eye); g.set(10, ey + 1, p.eye); g.set(11, ey + 1, p.eye);
    g.set(5, ey, '#ffffff'); g.set(11, ey, '#ffffff');
    g.set(3, ey + 2, p.blush); g.set(4, ey + 2, p.blush);
    g.set(11, ey + 2, p.blush); g.set(12, ey + 2, p.blush);
    g.set(7, ey + 2, p.mouth); g.set(8, ey + 2, p.mouth);
  } else if (dir === 'left') {
    g.set(3, ey, p.eye); g.set(4, ey, p.eye); g.set(3, ey + 1, p.eye); g.set(4, ey + 1, p.eye);
    g.set(3, ey, '#ffffff');
    g.set(4, ey + 2, p.blush); g.set(5, ey + 2, p.blush);
    g.set(2, ey + 2, p.mouth);
    g.set(9, ey + 1, p.skinSh); // 귀
  }
}

/** 앞머리 + 머리 모양 */
function drawHair(g: PixelGrid, p: Pal, style: number, dir: string, cy: number) {
  const top = Math.round(cy - 5);
  const by = Math.round(cy - 1); // 앞머리 끝 줄
  const H = p.hair, S = p.hairSh, L = p.hairHi;

  if (dir === 'up') {
    for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) if (inHead(x, y, cy) && y <= cy + 3) g.set(x, y, H);
    hairCap(g, p, top - 1, Math.round(cy), cy);
    g.hline(5, top + 1, 4, L);
    switch (style) {
      case 0: g.rect(2, by, 12, 4, H); g.hline(2, by + 4, 12, S); break;
      case 1: [3, 6, 9, 12].forEach((x) => { g.set(x, top - 1, H); g.set(x + 1, top - 2, H); }); break;
      case 2: for (let y = by; y <= by + 6; y++) { g.set(1, y, H); g.set(2, y, S); g.set(13, y, S); g.set(14, y, H); } g.set(1, by, p.ribbon); g.set(14, by, p.ribbon); break;
      case 3: g.set(7, by + 2, p.ribbon); g.set(8, by + 2, p.ribbon); for (let y = by + 3; y <= by + 8; y++) { g.set(7, y, H); g.set(8, y, S); } break;
      case 4: g.ellipse(8, cy - 1.5, 7.2, 5.8, H); for (let i = 0; i < 6; i++) g.set(3 + i * 2, top + (i % 2), L); break;
      case 5: g.rect(2, by, 12, 9, H); g.vline(8, by, 9, S); g.hline(2, by + 9, 12, S); break;
      case 6: g.ellipse(8, top - 0.5, 2.6, 2.2, H); g.set(7, top - 2, L); g.hline(6, top + 1, 4, p.ribbon); break;
      case 7: for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === H && y > cy) g.set(x, y, p.skin); g.hline(4, top + 1, 8, L); break;
    }
    return;
  }

  if (dir === 'left') {
    hairCap(g, p, top - 1, by - 1, cy);
    // 뒤통수 덮기
    for (let y = by - 1; y <= by + 3; y++) for (let x = 7; x < 16; x++) if (inHead(x, y, cy)) g.set(x, y, H);
    // 앞머리
    for (let x = 2; x <= 7; x++) if (inHead(x, by, cy) && (x + by) % 3 !== 0) g.set(x, by, H);
    g.set(9, by + 1, p.skin); g.set(9, by + 2, p.skinSh); // 귀
    g.hline(4, top, 4, L);
    switch (style) {
      case 0: g.rect(8, by, 6, 5, H); g.hline(8, by + 5, 5, S); break;
      case 1: [[4, top - 2], [7, top - 2], [10, top - 1], [13, top + 1]].forEach(([x, y]) => { g.set(x, y, H); g.set(x + 1, y + 1, H); }); g.set(14, by, H); break;
      case 2: g.set(12, by, p.ribbon); for (let y = by + 1; y <= by + 6; y++) { g.set(12, y, H); g.set(13, y, S); } break;
      case 3: g.set(13, top + 2, p.ribbon); for (let i = 0; i < 6; i++) { g.set(14, top + 2 + i, H); g.set(15, top + 3 + i, S); } g.set(13, top + 3, H); break;
      case 4: g.ellipse(8.5, cy - 1.8, 7, 5.6, H); for (let i = 0; i < 4; i++) g.set(6 + i * 2, top + (i % 2), L); g.set(3, by, p.skin); g.set(4, by, p.skin); g.set(3, by + 1, p.skin); break;
      case 5: g.rect(8, by, 6, 10, H); g.vline(13, by, 10, S); g.hline(8, by + 10, 5, S); break;
      case 6: g.ellipse(12, top, 2.4, 2.2, H); g.set(11, top - 1, L); g.set(10, top + 1, p.ribbon); break;
      case 7: for (let y = by - 1; y <= by + 3; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === H && x < 10 && y >= by) g.set(x, y, p.skin); break;
    }
    // 머리카락 결 음영
    for (let x = 0; x < 16; x++) if (g.get(x, by) === H && g.get(x, by + 1) !== H) g.set(x, by, S);
    return;
  }

  // ── 정면 ──
  hairCap(g, p, top - 1, by - 1, cy);
  // 앞머리 (스타일마다 다른 결)
  const bangs: Record<number, number[]> = {
    0: [3, 4, 5, 7, 8, 10, 11, 12],
    1: [3, 4, 6, 7, 9, 11, 12],
    2: [3, 4, 5, 6, 9, 10, 11, 12],
    3: [3, 4, 5, 6, 7, 8, 12],
    4: [3, 5, 7, 8, 10, 12],
    5: [3, 4, 5, 6, 9, 10, 11, 12],
    6: [3, 4, 6, 7, 8, 9, 11, 12],
    7: [],
  };
  (bangs[style] ?? []).forEach((x) => g.set(x, by, H));
  // 옆머리
  if (style !== 7 && style !== 4) {
    for (let y = by; y <= by + 2; y++) { g.set(2, y, H); g.set(13, y, H); }
  }
  g.hline(5, top, 3, L); g.set(4, top + 1, L);
  switch (style) {
    case 0: for (let y = by; y <= by + 4; y++) { g.set(2, y, H); g.set(3, y, y > by ? S : H); g.set(12, y, y > by ? S : H); g.set(13, y, H); } break;
    case 1: [[3, top - 1], [6, top - 2], [9, top - 2], [12, top - 1]].forEach(([x, y]) => { g.set(x, y, H); g.set(x + 1, y + 1, H); g.set(x, y + 1, H); }); break;
    case 2:
      for (let y = by; y <= by + 6; y++) { g.set(1, y, H); g.set(2, y, y > by + 1 ? S : H); g.set(13, y, y > by + 1 ? S : H); g.set(14, y, H); }
      g.set(1, by + 7, S); g.set(14, by + 7, S);
      g.set(2, by, p.ribbon); g.set(13, by, p.ribbon); g.set(1, by - 1, p.ribbon); g.set(14, by - 1, p.ribbon);
      break;
    case 3: for (let y = by - 2; y <= by + 3; y++) { g.set(14, y, H); } g.set(14, by - 3, p.ribbon); g.set(13, by + 3, S); break;
    case 4:
      g.ellipse(8, cy - 1.8, 7.3, 5.6, H, false);
      for (let y = 0; y < 22; y++) for (let x = 3; x <= 12; x++) if (y >= by && inHead(x, y, cy)) g.set(x, y, p.skin);
      [3, 5, 7, 9, 11].forEach((x, i) => g.set(x + (i % 2), by, H));
      for (let i = 0; i < 6; i++) g.set(2 + i * 2 + (i % 2), top + 1 + (i % 3), L);
      g.set(1, by + 1, H); g.set(14, by + 1, H); g.set(1, by + 2, S); g.set(14, by + 2, S);
      break;
    case 5: for (let y = by; y <= by + 9; y++) { g.set(2, y, H); g.set(3, y, y > by + 2 ? S : H); g.set(12, y, y > by + 2 ? S : H); g.set(13, y, H); } break;
    case 6: g.ellipse(8, top - 0.6, 2.6, 2.2, H); g.set(7, top - 2, L); g.hline(6, top + 1, 4, p.ribbon); break;
    case 7: for (let x = 4; x <= 11; x++) g.set(x, by - 1, S); break;
  }
  // 앞머리 아래 그림자 (피부에 살짝)
  for (let x = 3; x <= 12; x++) {
    const c = g.get(x, by + 1);
    if (g.get(x, by) === H && c === p.skin) g.set(x, by + 1, p.skinSh);
  }
}

/** 긴머리 등 몸 뒤로 내려오는 머리카락 */
function drawBackHair(g: PixelGrid, p: Pal, style: number, dir: string, cy: number) {
  if (style !== 5 || dir === 'up') return;
  const by = Math.round(cy - 1);
  if (dir === 'down') g.rect(3, by + 2, 10, 8, p.hairSh);
  else g.rect(9, by + 2, 4, 8, p.hairSh);
}

export function drawCharacterFrame(app: Appearance, dir: 'down' | 'left' | 'up', frame: number): PixelGrid {
  const a = sanitizeAppearance(app);
  const p = palette(a);
  const g = new PixelGrid(CHAR_W, CHAR_H);
  const bob = frame === 1 || frame === 2 ? -1 : frame === 3 ? 2 : 0;
  const cy = 8 + bob; // 머리 중심
  const torsoTop = 13 + bob;
  drawBackHair(g, p, a.hair, dir, cy);
  drawLegs(g, p, dir, frame, torsoTop + 4, a.outfit === 2);
  drawTorso(g, p, a, dir, torsoTop);
  if (dir !== 'up') drawArms(g, p, a, dir, frame, torsoTop);
  else drawArms(g, p, a, 'down', frame, torsoTop);
  drawHead(g, p, cy);
  if (dir !== 'up') drawFace(g, p, dir, cy);
  drawHair(g, p, a.hair, dir, cy);
  g.outline('#4a3036', 0.6);
  return g;
}

/** 4방향 × 4프레임 스프라이트시트 (행: down, left, right, up) */
export function renderCharacterSheet(app: Appearance): HTMLCanvasElement {
  const frames: PixelGrid[] = [];
  for (const d of CHAR_DIRS) {
    for (let f = 0; f < CHAR_FRAMES; f++) {
      if (d === 'right') frames.push(drawCharacterFrame(app, 'left', f).mirror());
      else frames.push(drawCharacterFrame(app, d, f));
    }
  }
  return sheet(frames, CHAR_FRAMES);
}

export const charFrameIndex = (dir: (typeof CHAR_DIRS)[number], frame: number) => CHAR_DIRS.indexOf(dir) * CHAR_FRAMES + frame;
