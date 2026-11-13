/**
 * 지형 렌더러: 타일 종류 배열을 받아 한 장의 바닥 이미지로 그립니다.
 * 이웃 타일을 보고 경계를 자연스럽게 섞어(오토타일) 블록 느낌을 없앱니다.
 */
import { hash2, makeCanvas } from './pixel';

export const T = {
  Grass: 0,
  Path: 1,
  Plaza: 2,
  Water: 3,
  Bridge: 4,
  Dirt: 5,
  DarkGrass: 6,
  /** 집 안: 나무 바닥 / 벽 / 문 */
  Floor: 7,
  Wall: 8,
  Door: 9,
} as const;

export const TS = 16;

const C = {
  grass: '#a8d973', grassL: '#b9e384', grassD: '#90c763', tuft: '#7fb957', tuftL: '#c9ee96',
  darkGrass: '#94cc66',
  path: '#ecd5a6', pathL: '#f5e4be', pathD: '#ddc08e', pathEdge: '#d2b17e', pebble: '#c9a878',
  dirt: '#dcb47e', dirtL: '#e8c796', dirtD: '#c99e68', dirtEdge: '#bf9160',
  stone: '#efe6d3', stoneL: '#faf4e8', stoneD: '#dfd2ba', mortar: '#cbbca1', stoneEdge: '#bfae90',
  water: '#8fd5e8', waterD: '#7cc6de', waterDD: '#6db9d6', foam: '#c3edf6', bank: '#5fa4be', ripple: '#c9f0f7',
  plank: '#cf9c66', plankL: '#e2b682', plankD: '#a8744a', beam: '#8c5c38',
};

const FLOWER_DOTS = ['#ffffff', '#ffd6e4', '#fff1a8', '#d9c8ff'];

/** 바닥 색을 살짝 어둡게 (그림자) */
function mixShade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number, s: number) => Math.round(v + (s - v) * t);
  const r = f((n >> 16) & 255, 0x6a), g = f((n >> 8) & 255, 0x40), b = f(n & 255, 0x38);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function renderGround(tiles: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const W = w * TS, H = h * TS;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const at = (tx: number, ty: number): number => (tx < 0 || ty < 0 || tx >= w || ty >= h ? -1 : tiles[ty * w + tx]);
  const put = (x: number, y: number, hex: string) => {
    const i = (y * W + x) * 4;
    const n = parseInt(hex.slice(1), 16);
    data[i] = (n >> 16) & 255; data[i + 1] = (n >> 8) & 255; data[i + 2] = n & 255; data[i + 3] = 255;
  };

  // 물가까지 거리 (깊이 표현)
  const waterDepth = new Int16Array(w * h).fill(0);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (at(tx, ty) !== T.Water) continue;
    let d = 0;
    for (let r = 1; r <= 3; r++) {
      let ok = true;
      for (let j = -r; j <= r && ok; j++) for (let i = -r; i <= r && ok; i++) { const t = at(tx + i, ty + j); if (t !== T.Water && t !== T.Bridge) ok = false; }
      if (ok) d = r; else break;
    }
    waterDepth[ty * w + tx] = d;
  }

  const grassPixel = (x: number, y: number, tx: number, ty: number, dark = false): string => {
    const r = hash2(x, y, 1);
    const base = dark ? C.darkGrass : C.grass;
    // 작은 풀 포기 (v 모양)
    const seedT = hash2(tx, ty, 7);
    const tuftCount = seedT < 0.35 ? 0 : seedT < 0.8 ? 1 : 2;
    for (let k = 0; k < tuftCount; k++) {
      const ox = tx * TS + 2 + Math.floor(hash2(tx, ty, 11 + k) * 11);
      const oy = ty * TS + 3 + Math.floor(hash2(tx, ty, 21 + k) * 10);
      if ((x === ox && y === oy) || (x === ox + 2 && y === oy) || (x === ox + 1 && y === oy + 1)) return C.tuft;
      if ((x === ox && y === oy - 1) || (x === ox + 2 && y === oy - 1)) return C.tuftL;
    }
    // 아주 작은 들꽃
    if (hash2(tx, ty, 31) < 0.06) {
      const fx = tx * TS + 4 + Math.floor(hash2(tx, ty, 32) * 8), fy = ty * TS + 4 + Math.floor(hash2(tx, ty, 33) * 8);
      const fc = FLOWER_DOTS[Math.floor(hash2(tx, ty, 34) * FLOWER_DOTS.length)];
      if (x === fx && y === fy) return '#ffd84a';
      if (Math.abs(x - fx) + Math.abs(y - fy) === 1) return fc;
    }
    if (r < 0.1) return C.grassL;
    if (r > 0.93) return C.grassD;
    return base;
  };

  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const t = at(tx, ty);
    for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
      const x = tx * TS + px, y = ty * TS + py;
      let c: string;
      switch (t) {
        case T.Path:
        case T.Dirt: {
          const dirt = t === T.Dirt;
          const same = (tt: number) => tt === t || tt === T.Plaza || tt === T.Bridge || (dirt ? tt === T.Path : tt === T.Dirt);
          const n = hash2(x, y, 3);
          const edgeN = 1 + Math.floor(hash2(x, y >> 1, 5) * 2.2);
          // 가장자리: 잔디가 살짝 덮는 불규칙한 경계
          let dist = 99;
          if (!same(at(tx, ty - 1))) dist = Math.min(dist, py);
          if (!same(at(tx, ty + 1))) dist = Math.min(dist, TS - 1 - py);
          if (!same(at(tx - 1, ty))) dist = Math.min(dist, px);
          if (!same(at(tx + 1, ty))) dist = Math.min(dist, TS - 1 - px);
          // 바깥 모서리
          const corner = (dx: number, dy: number, cx: number, cy: number) =>
            same(at(tx + dx, ty)) && same(at(tx, ty + dy)) && !same(at(tx + dx, ty + dy)) ? Math.max(Math.abs(px - cx), Math.abs(py - cy)) : 99;
          dist = Math.min(dist, corner(-1, -1, 0, 0) + 1, corner(1, -1, 15, 0) + 1, corner(-1, 1, 0, 15) + 1, corner(1, 1, 15, 15) + 1);
          if (dist < edgeN) { c = grassPixel(x, y, tx, ty); break; }
          if (dist === edgeN) { c = dirt ? C.dirtEdge : C.pathEdge; break; }
          c = dirt ? C.dirt : C.path;
          if (n < 0.12) c = dirt ? C.dirtL : C.pathL;
          else if (n > 0.9) c = dirt ? C.dirtD : C.pathD;
          // 조약돌
          if (hash2(tx, ty, 41) < 0.5) {
            const sx = 3 + Math.floor(hash2(tx, ty, 42) * 9), sy = 3 + Math.floor(hash2(tx, ty, 43) * 9);
            if ((px === sx || px === sx + 1) && py === sy) c = C.pebble;
            if (px === sx && py === sy - 1) c = dirt ? C.dirtL : C.pathL;
          }
          break;
        }
        case T.Plaza: {
          const row = Math.floor(y / 8);
          const off = row % 2 ? 4 : 0;
          const bx = (x + off) % 8, by = y % 8;
          if (bx === 0 || by === 0) c = C.mortar;
          else if (bx === 1 || by === 1) c = C.stoneL;
          else if (bx === 7 || by === 7) c = C.stoneD;
          else c = hash2(Math.floor((x + off) / 8), row, 9) < 0.25 ? '#f3ead9' : C.stone;
          const edge = (at(tx, ty - 1) !== T.Plaza && py === 0) || (at(tx, ty + 1) !== T.Plaza && py === 15) ||
            (at(tx - 1, ty) !== T.Plaza && px === 0) || (at(tx + 1, ty) !== T.Plaza && px === 15);
          if (edge) c = C.stoneEdge;
          break;
        }
        case T.Water: {
          const d = waterDepth[ty * w + tx];
          c = d >= 2 ? C.waterDD : d === 1 ? C.waterD : C.water;
          // 깊이 경계를 부드럽게 디더링
          if (d === 1 && hash2(x, y, 13) < 0.25) c = C.water;
          if (d >= 2 && hash2(x, y, 14) < 0.2) c = C.waterD;
          const land = (tt: number) => tt !== T.Water && tt !== T.Bridge && tt !== -1;
          if (land(at(tx, ty - 1)) && py < 3) c = py < 2 ? C.bank : C.waterD; // 위쪽 둑 그림자
          else if (land(at(tx, ty + 1)) && py === 15) c = C.foam;
          else if (land(at(tx - 1, ty)) && px === 0) c = C.foam;
          else if (land(at(tx + 1, ty)) && px === 15) c = C.foam;
          // 잔물결
          const rx = Math.floor(hash2(tx, ty, 51) * 10), ry = 4 + Math.floor(hash2(tx, ty, 52) * 9);
          if (py === ry && px >= rx && px < rx + 4 && hash2(tx, ty, 53) < 0.55) c = C.ripple;
          break;
        }
        case T.Bridge: {
          const vertical = at(tx, ty - 1) === T.Bridge || at(tx, ty + 1) === T.Bridge;
          const a = vertical ? py : px, b = vertical ? px : py;
          const plankIdx = Math.floor(a / 4);
          c = a % 4 === 3 ? C.plankD : a % 4 === 0 ? C.plankL : hash2(plankIdx, ty * 99 + tx, 3) < 0.5 ? C.plank : '#d6a370';
          const sideA = vertical ? at(tx - 1, ty) !== T.Bridge : at(tx, ty - 1) !== T.Bridge;
          const sideB = vertical ? at(tx + 1, ty) !== T.Bridge : at(tx, ty + 1) !== T.Bridge;
          if ((sideA && b < 2) || (sideB && b > 13)) c = C.beam;
          if (a % 4 === 1 && (b === 3 || b === 12)) c = '#8a6a50';
          break;
        }
        case T.DarkGrass:
          c = grassPixel(x, y, tx, ty, true);
          break;
        case T.Floor:
        case T.Door: {
          // 따뜻한 나무 바닥 (가로 널빤지)
          const row = Math.floor(y / 4);
          const off = (row * 7) % 16;
          const seam = (x + off) % 16 === 0;
          const n = hash2(Math.floor((x + off) / 16), row, 61);
          c = py % 4 === 3 ? '#c4925e' : seam ? '#cf9c66' : n < 0.33 ? '#e6b67e' : n < 0.66 ? '#e0ae76' : '#eabd86';
          if (hash2(x, y, 62) < 0.04) c = '#d8a46e';
          // 벽 바로 아래 그림자
          if (at(tx, ty - 1) === T.Wall && py < 3) c = mixShade(c, 0.22 - py * 0.07);
          if (t === T.Door) {
            // 문 앞 매트
            if (px >= 2 && px <= 13 && py >= 4) c = (px + py) % 4 === 0 ? '#e8a07a' : px === 2 || px === 13 || py === 4 ? '#e0906a' : '#f2c09a';
          }
          break;
        }
        case T.Wall: {
          const below = at(tx, ty + 1), below2 = at(tx, ty + 2);
          const face = below === T.Floor || below === T.Door || below2 === T.Floor || below2 === T.Door;
          if (face && ty > 0 && at(tx - 1, ty) !== -1 && at(tx + 1, ty) !== -1) {
            // 벽지: 크림색 + 분홍 줄무늬, 아래쪽 걸레받이
            const nearFloor = below === T.Floor || below === T.Door;
            c = x % 8 < 2 ? '#f8dcd4' : '#fdf1e0';
            if (x % 8 === 4 && y % 6 === 0) c = '#f6c8c0';
            if (nearFloor && py >= 12) c = py === 12 ? '#e0b07a' : py === 15 ? '#9a6a44' : '#c8905a';
            if (at(tx, ty - 1) === T.Wall && !(at(tx, ty - 2) === T.Wall && face && ty > 1) && py < 2) c = '#e8cfc0';
          } else {
            // 벽 윗면 (어두운 나무 테두리)
            c = (x + y) % 6 === 0 ? '#9a6a44' : '#8c5c38';
            const inner = (tt: number) => tt === T.Floor || tt === T.Door;
            if (py === 15 && !inner(at(tx, ty + 1)) && at(tx, ty + 1) === T.Wall) c = '#8c5c38';
            if ((px === 15 && inner(at(tx + 1, ty))) || (px === 0 && inner(at(tx - 1, ty)))) c = '#b07a4e';
            if (py === 0 && inner(at(tx, ty - 1))) c = '#b07a4e';
          }
          break;
        }
        default:
          c = grassPixel(x, y, tx, ty);
      }
      put(x, y, c);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
