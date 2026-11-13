import { hash2 } from '../art/pixel';
import { T, TS } from '../art/tiles';
import type { GameMap, MapObject, Rect } from './types';

export class MapBuilder {
  tiles: Uint8Array;
  objects: MapObject[] = [];
  reserved: Uint8Array;
  /** prefix: 과일 나무 ID 앞부분 (마을 v / 농장 f) */
  constructor(public w: number, public h: number, public prefix = '') {
    this.tiles = new Uint8Array(w * h).fill(T.Grass);
    this.reserved = new Uint8Array(w * h);
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.tiles[y * this.w + x]; }
  set(x: number, y: number, t: number) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t; }
  fill(x: number, y: number, w: number, h: number, t: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, t);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, t: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, t);
    }
  }
  /** 장식 배치를 막을 영역 (타일 단위) */
  reserve(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.reserved[yy * this.w + xx] = 1;
    }
  }
  free(x: number, y: number) {
    return this.get(x, y) === T.Grass && !this.reserved[y * this.w + x];
  }
  add(o: MapObject) { this.objects.push(o); return o; }
  /** 타일 좌표에 오브젝트 (타일 아래 가운데 기준) */
  at(key: string, tx: number, ty: number, extra: Partial<MapObject> = {}) {
    return this.add({ key, x: tx * TS + TS / 2, y: ty * TS + TS, ...extra });
  }
  tree(tx: number, ty: number, kind?: string) {
    const kinds = ['tree', 'tree2', 'tree', 'pine', 'tree2'];
    const key = kind ?? kinds[Math.floor(hash2(tx, ty, 77) * kinds.length)];
    this.reserve(tx - 1, ty - 1, 3, 2);
    const fruit = key === 'tree_apple' ? 'apple' : key === 'tree_peach' ? 'peach' : undefined;
    return this.at(key, tx, ty, {
      collide: { w: 12, h: 6 }, x: tx * TS + TS / 2 + Math.round((hash2(tx, ty, 5) - 0.5) * 6), sway: true,
      ...(fruit ? { fruit, fruitId: `${this.prefix}:${tx},${ty}` } : {}),
    } as Partial<MapObject>);
  }
  /** 남는 잔디에 꽃/풀/돌을 흩뿌리기 */
  scatter(seed: number, density: number, keys: string[], area?: Rect) {
    const x0 = area?.x ?? 1, y0 = area?.y ?? 1, x1 = area ? area.x + area.w : this.w - 1, y1 = area ? area.y + area.h : this.h - 1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!this.free(x, y) || hash2(x, y, seed) > density) continue;
      const key = keys[Math.floor(hash2(x, y, seed + 1) * keys.length)];
      const solid = key.startsWith('rock') || key.startsWith('bush') || key === 'stump';
      this.at(key, x, y, solid ? { collide: { w: 10, h: 5 } } : { depth: key === 'tall_grass' || key.startsWith('flowers') ? -1 : undefined });
      this.reserve(x, y, 1, 1);
    }
  }
  build(rest: Omit<GameMap, 'w' | 'h' | 'tiles' | 'objects'>): GameMap {
    return { w: this.w, h: this.h, tiles: this.tiles, objects: this.objects, ...rest };
  }
}
