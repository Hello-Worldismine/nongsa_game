/**
 * 작은 픽셀 아트 엔진. 모든 게임 그래픽은 이 엔진으로 코드에서 직접 그립니다.
 * (외부 에셋 없음 → 라이선스 걱정 없는 100% 오리지널 그래픽)
 */
export type Px = string | null;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** t: 0 → a, 1 → b */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
/** 따뜻한 그림자 / 하이라이트 (순수 검정·흰색 대신 색조가 있는 톤으로 섞어 부드럽게) */
export const darken = (c: string, t: number) => mix(c, '#3a2340', t);
export const lighten = (c: string, t: number) => mix(c, '#fff8e6', t);

/** 결정적 의사난수 (좌표 기반) — 매번 같은 맵이 그려지도록 */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export class PixelGrid {
  readonly px: Px[];
  constructor(public readonly w: number, public readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): Px { return this.inside(x, y) ? this.px[y * this.w + x] : null; }
  set(x: number, y: number, c: Px) {
    x = Math.round(x); y = Math.round(y);
    if (this.inside(x, y)) this.px[y * this.w + x] = c;
  }
  /** 이미 칠해진 곳에만 칠하기 (음영 표현용) */
  tint(x: number, y: number, c: string) { if (this.get(x, y)) this.set(x, y, c); }
  rect(x: number, y: number, w: number, h: number, c: Px) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  hline(x: number, y: number, len: number, c: Px) { return this.rect(x, y, len, 1, c); }
  vline(x: number, y: number, len: number, c: Px) { return this.rect(x, y, 1, len, c); }
  /** 픽셀 중심 기준 타원 채우기 */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Px, onlyPainted = false) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          if (onlyPainted) { if (this.get(x, y)) this.set(x, y, c); } else this.set(x, y, c);
        }
      }
    }
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Px) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** 문자열 도트 패턴 그리기. '.' 와 ' ' 는 투명 */
  rows(lines: string[], pal: Record<string, Px>, ox = 0, oy = 0) {
    lines.forEach((line, j) => {
      [...line].forEach((ch, i) => {
        if (ch === '.' || ch === ' ') return;
        const c = pal[ch];
        if (c !== undefined) this.set(ox + i, oy + j, c);
      });
    });
    return this;
  }
  stamp(g: PixelGrid, ox: number, oy: number) {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const c = g.get(x, y);
      if (c) this.set(ox + x, oy + y, c);
    }
    return this;
  }
  mirror(): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(this.w - 1 - x, y, this.get(x, y));
    return g;
  }
  clone(): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    g.px.splice(0, g.px.length, ...this.px);
    return g;
  }
  /**
   * 자동 외곽선: 칠해진 픽셀 바깥쪽에 이웃 색을 어둡게 한 선을 그립니다 (셀아웃 스타일).
   * 귀여운 느낌을 위해 순수 검정이 아닌 따뜻한 갈색 계열을 섞습니다.
   */
  outline(base = '#4a3036', amount = 0.55, diagonal = false) {
    const src = this.px.slice();
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : null);
    const dirs = diagonal
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y)) continue;
      let n: Px = null;
      for (const [dx, dy] of dirs) { const c = at(x + dx, y + dy); if (c) { n = c; break; } }
      if (n) this.px[y * this.w + x] = mix(mix(n, base, amount), base, 0.35);
    }
    return this;
  }
  /** 바닥에 닿는 부드러운 그림자 타원 */
  shadow(cx: number, cy: number, rx: number, ry: number, color = 'rgba(60,40,50,0.22)') {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && !this.get(x, y)) this.set(x, y, color);
      }
    }
    return this;
  }
  drawTo(ctx: CanvasRenderingContext2D, ox = 0, oy = 0, scale = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.px[y * this.w + x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
  toCanvas(scale = 1): HTMLCanvasElement {
    const cv = makeCanvas(this.w * scale, this.h * scale);
    this.drawTo(cv.getContext('2d')!, 0, 0, scale);
    return cv;
  }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 여러 프레임 그리드를 가로로 이어 붙여 스프라이트시트 캔버스로 */
export function sheet(frames: PixelGrid[], cols = frames.length): HTMLCanvasElement {
  const fw = frames[0].w, fh = frames[0].h;
  const rows = Math.ceil(frames.length / cols);
  const cv = makeCanvas(fw * cols, fh * rows);
  const ctx = cv.getContext('2d')!;
  frames.forEach((f, i) => f.drawTo(ctx, (i % cols) * fw, Math.floor(i / cols) * fh));
  return cv;
}
