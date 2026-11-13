/**
 * 집 안 가구 그리기 + 충돌 + 배치 미리보기(고스트).
 */
import Phaser from 'phaser';
import { canPlace, FURN_MAP } from '@/config/shop';
import type { HouseItem, HouseState } from '@/types';
import { TS } from '../art/tiles';
import { HOUSE_ORIGIN } from '../maps/house';
import type { Rect } from '../maps/types';

export class HouseLayer {
  /** 밟을 수 없는 가구의 충돌 상자 */
  rects: Rect[] = [];
  house: HouseState | null = null;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private ghost: Phaser.GameObjects.Image;
  private ghostBox: Phaser.GameObjects.Graphics;
  private selBox: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private add: (o: Phaser.GameObjects.GameObject) => void) {
    this.ghost = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 1).setAlpha(0.65).setVisible(false).setDepth(1e5);
    this.ghostBox = scene.add.graphics().setDepth(1e5 - 1).setVisible(false);
    this.selBox = scene.add.graphics().setDepth(1e5 - 2).setVisible(false);
    add(this.ghost); add(this.ghostBox); add(this.selBox);
    scene.tweens.add({ targets: this.ghost, alpha: { from: 0.75, to: 0.45 }, yoyo: true, repeat: -1, duration: 500 });
  }

  /** 바닥 칸 → 월드 좌표 (칸 왼쪽 위) */
  static tileToWorld(x: number, y: number) { return { x: (HOUSE_ORIGIN.tx + x) * TS, y: (HOUSE_ORIGIN.ty + y) * TS }; }

  tileAtWorld(wx: number, wy: number): { x: number; y: number } | null {
    if (!this.house) return null;
    const x = Math.floor(wx / TS) - HOUSE_ORIGIN.tx, y = Math.floor(wy / TS) - HOUSE_ORIGIN.ty;
    return x >= 0 && y >= 0 && x < this.house.w && y < this.house.h ? { x, y } : null;
  }

  /** 그 칸에 놓인 가구 (일반 가구 먼저, 없으면 러그 같은 바닥 가구) */
  itemAt(tx: number, ty: number): HouseItem | null {
    if (!this.house) return null;
    const hit = (i: HouseItem) => { const d = FURN_MAP[i.type]; return d && tx >= i.x && tx < i.x + d.w && ty >= i.y && ty < i.y + d.h; };
    const list = this.house.items.filter(hit);
    return list.find((i) => !FURN_MAP[i.type].walkable) ?? list[list.length - 1] ?? null;
  }

  setHouse(h: HouseState) {
    this.house = h;
    const keep = new Set<number>();
    this.rects = [];
    for (const it of h.items) {
      const d = FURN_MAP[it.type];
      if (!d) continue;
      keep.add(it.id);
      const key = `furn_${d.type}_${it.color}`;
      const p = HouseLayer.tileToWorld(it.x, it.y);
      const bottom = p.y + d.h * TS;
      let img = this.sprites.get(it.id);
      if (!img) {
        img = this.scene.add.image(p.x, bottom, key).setOrigin(0, 1);
        this.add(img);
        this.sprites.set(it.id, img);
        img.setScale(0.6);
        this.scene.tweens.add({ targets: img, scale: 1, duration: 260, ease: 'Back.easeOut' });
      }
      if (img.texture.key !== key) img.setTexture(key);
      img.setPosition(p.x, bottom).setDepth(d.walkable ? -900 + it.y * 0.01 + it.x * 0.0001 : bottom - 1);
      if (!d.walkable) this.rects.push({ x: p.x + 1, y: p.y + (d.h > 1 ? 2 : 4), w: d.w * TS - 2, h: d.h * TS - (d.h > 1 ? 3 : 5) });
    }
    for (const [id, img] of this.sprites) if (!keep.has(id)) { img.destroy(); this.sprites.delete(id); }
  }

  /** 배치 미리보기. 놓을 수 있으면 초록, 없으면 빨강 */
  showGhost(furnId: string, color: number, tx: number, ty: number, ignoreId?: number): boolean {
    const d = FURN_MAP[furnId];
    if (!d || !this.house) { this.hideGhost(); return false; }
    const ok = canPlace(this.house, furnId, tx, ty, ignoreId);
    const p = HouseLayer.tileToWorld(tx, ty);
    this.ghost.setTexture(`furn_${d.type}_${color}`).setPosition(p.x, p.y + d.h * TS).setVisible(true);
    this.ghost.setTint(ok ? 0xffffff : 0xff9a9a);
    this.ghostBox.clear().setVisible(true);
    this.ghostBox.fillStyle(ok ? 0x9fdc6e : 0xff7a7a, 0.28).fillRect(p.x, p.y, d.w * TS, d.h * TS);
    this.ghostBox.lineStyle(1, ok ? 0x5a9a3a : 0xc0404a, 1).strokeRect(p.x + 0.5, p.y + 0.5, d.w * TS - 1, d.h * TS - 1);
    return ok;
  }
  hideGhost() { this.ghost.setVisible(false); this.ghostBox.setVisible(false); }

  /** 옮기려고 고른 가구 표시 (원래 자리는 반투명) */
  highlight(id: number | null) {
    for (const [iid, img] of this.sprites) img.setAlpha(iid === id ? 0.35 : 1);
    this.selBox.clear().setVisible(false);
    if (id === null || !this.house) return;
    const it = this.house.items.find((i) => i.id === id);
    const d = it && FURN_MAP[it.type];
    if (!it || !d) return;
    const p = HouseLayer.tileToWorld(it.x, it.y);
    this.selBox.setVisible(true).lineStyle(1, 0xffd84a, 1).strokeRect(p.x + 0.5, p.y + 0.5, d.w * TS - 1, d.h * TS - 1);
  }

  /** 편집 모드: 바닥에 칸 표시 */
  private grid: Phaser.GameObjects.Graphics | null = null;
  showGrid(on: boolean) {
    if (!this.house) return;
    if (!on) { this.grid?.destroy(); this.grid = null; return; }
    if (this.grid) return;
    const g = this.scene.add.graphics().setDepth(-899);
    g.lineStyle(1, 0xffffff, 0.22);
    const o = HouseLayer.tileToWorld(0, 0);
    for (let x = 0; x <= this.house.w; x++) g.lineBetween(o.x + x * TS + 0.5, o.y, o.x + x * TS + 0.5, o.y + this.house.h * TS);
    for (let y = 0; y <= this.house.h; y++) g.lineBetween(o.x, o.y + y * TS + 0.5, o.x + this.house.w * TS, o.y + y * TS + 0.5);
    this.add(g);
    this.grid = g;
  }

  destroy() {
    this.sprites.forEach((s) => s.destroy());
    this.sprites.clear();
    this.grid?.destroy();
    this.ghost.destroy(); this.ghostBox.destroy(); this.selBox.destroy();
  }
}
