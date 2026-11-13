/**
 * 농장 경작지 렌더링: 밭, 작물(성장 단계), 울타리, 확장 미리보기, 수확 효과
 */
import Phaser from 'phaser';
import { CROP_MAP } from '@/config/crops';
import { growthInfo } from '@/features/economy/rules';
import { serverNow } from '@/stores/gameStore';
import type { FarmState, PlantedCrop } from '@/types';
import { TS } from '../art/tiles';
import { PLOT_ORIGIN, plotCenter } from '../maps/farm';
import type { Rect } from '../maps/types';

export class FarmLayer {
  private plots = new Map<string, Phaser.GameObjects.Image>();
  private crops = new Map<string, { sprite: Phaser.GameObjects.Image; stage: number; crop: PlantedCrop; tween?: Phaser.Tweens.Tween }>();
  /** 비료 준 칸의 하얀 가루 */
  private powders = new Map<string, Phaser.GameObjects.Image>();
  private fences: Phaser.GameObjects.Image[] = [];
  private stakes: Phaser.GameObjects.Image[] = [];
  fenceRects: Rect[] = [];
  size = 0;
  farm: FarmState | null = null;
  private sparkleTimer = 0;
  private powderTimer = 0;

  constructor(private scene: Phaser.Scene, private add: (o: Phaser.GameObjects.GameObject) => void) {}

  private key = (x: number, y: number) => `${x},${y}`;

  setFarm(farm: FarmState, animate = false) {
    const grew = this.farm && farm.size > this.size;
    this.farm = farm;
    if (farm.size !== this.size) this.buildField(farm.size, animate && !!grew);
    this.syncCrops(farm.crops, animate);
  }

  private buildField(size: number, animate: boolean) {
    const oldSize = this.size;
    this.size = size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const k = this.key(x, y);
      if (this.plots.has(k)) continue;
      const c = plotCenter(x, y);
      const img = this.scene.add.image(c.x, c.y, 'plot').setDepth(-500);
      this.add(img);
      this.plots.set(k, img);
      if (animate && (x >= oldSize || y >= oldSize)) {
        img.setScale(0).setAlpha(0);
        this.scene.tweens.add({ targets: img, scale: 1, alpha: 1, delay: (x + y) * 45, duration: 320, ease: 'Back.easeOut' });
      }
    }
    this.buildFence(size, animate);
  }

  private buildFence(size: number, animate: boolean) {
    this.fences.forEach((f) => f.destroy());
    this.fences = [];
    this.fenceRects = [];
    const x0 = PLOT_ORIGIN.tx - 1, y0 = PLOT_ORIGIN.ty - 1;
    const x1 = PLOT_ORIGIN.tx + size, y1 = PLOT_ORIGIN.ty + size;
    const gateX = PLOT_ORIGIN.tx + Math.floor(size / 2);
    const place = (key: string, tx: number, ty: number, rect: Rect | null) => {
      const img = this.scene.add.image(tx * TS + 8, ty * TS + 16, key).setOrigin(0.5, 1).setDepth(ty * TS + 14);
      this.add(img);
      this.fences.push(img);
      if (rect) this.fenceRects.push(rect);
      if (animate) {
        img.setAlpha(0).setY(img.y - 6);
        this.scene.tweens.add({ targets: img, alpha: 1, y: img.y + 6, duration: 300, delay: 200 + Math.random() * 250, ease: 'Bounce.easeOut' });
      }
    };
    for (let tx = x0; tx <= x1; tx++) {
      const corner = tx === x0 || tx === x1;
      place(corner ? 'fence_post' : 'fence_h', tx, y0, { x: tx * TS, y: y0 * TS + 9, w: TS, h: 6 });
      if (tx === gateX) continue; // 아래쪽 가운데 문
      place(corner ? 'fence_post' : 'fence_h', tx, y1, { x: tx * TS, y: y1 * TS + 9, w: TS, h: 6 });
    }
    for (let ty = y0 + 1; ty < y1; ty++) {
      place('fence_v', x0, ty, { x: x0 * TS + 5, y: ty * TS, w: 6, h: TS });
      place('fence_v', x1, ty, { x: x1 * TS + 5, y: ty * TS, w: 6, h: TS });
    }
  }

  /** 확장 미리보기: 새로 생길 칸에 말뚝 표시 */
  preview(size: number | null) {
    this.stakes.forEach((s) => s.destroy());
    this.stakes = [];
    if (!size || size <= this.size) return;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x < this.size && y < this.size) continue;
      const c = plotCenter(x, y);
      const s = this.scene.add.image(c.x, c.y + 8, 'stake').setOrigin(0.5, 1).setDepth(c.y + 6).setAlpha(0.9);
      this.add(s);
      this.scene.tweens.add({ targets: s, y: s.y - 2, yoyo: true, repeat: -1, duration: 500 + (x + y) * 20, ease: 'Sine.easeInOut' });
      this.stakes.push(s);
    }
  }

  private syncCrops(list: PlantedCrop[], animate: boolean) {
    const seen = new Set<string>();
    for (const c of list) {
      const k = this.key(c.x, c.y);
      seen.add(k);
      const existing = this.crops.get(k);
      this.syncPowder(k, c, animate);
      if (existing && existing.crop.cropId === c.cropId && existing.crop.plantedAt === c.plantedAt) {
        // 같은 작물: 물/비료로 수확 시각이 당겨졌을 수 있으니 데이터는 항상 새 값으로
        existing.crop = c;
        continue;
      }
      existing?.sprite.destroy();
      existing?.tween?.remove();
      const p = plotCenter(c.x, c.y);
      const stage = growthInfo(c, serverNow()).stage;
      const sprite = this.scene.add.image(p.x, p.y + 8, `crop_${c.cropId}_${stage}`).setOrigin(0.5, 1).setDepth(p.y + 5);
      this.add(sprite);
      const entry = { sprite, stage, crop: c, tween: undefined as Phaser.Tweens.Tween | undefined };
      this.crops.set(k, entry);
      if (animate) {
        sprite.setScale(0.2, 0.2);
        this.scene.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
      }
      if (stage === 3) this.readyWiggle(entry);
    }
    for (const [k, v] of this.crops) {
      if (!seen.has(k)) { v.tween?.remove(); v.sprite.destroy(); this.crops.delete(k); }
    }
    for (const [k, p] of this.powders) if (!seen.has(k)) { p.destroy(); this.powders.delete(k); }
  }

  /** 비료 준 칸: 흙 위에 하얀 가루 */
  private syncPowder(k: string, c: PlantedCrop, animate: boolean) {
    const has = this.powders.get(k);
    if (!c.fertilized) { if (has) { has.destroy(); this.powders.delete(k); } return; }
    if (has) return;
    const p = plotCenter(c.x, c.y);
    // 작물보다 살짝 앞에 (큰 작물에 가려지지 않도록)
    const img = this.scene.add.image(p.x, p.y, 'fert_powder').setDepth(p.y + 6).setAlpha(0.95);
    this.add(img);
    this.powders.set(k, img);
    if (animate) { img.setAlpha(0); this.scene.tweens.add({ targets: img, alpha: 1, duration: 500 }); }
  }

  private readyWiggle(entry: { sprite: Phaser.GameObjects.Image; tween?: Phaser.Tweens.Tween }) {
    entry.tween?.remove();
    entry.tween = this.scene.tweens.add({
      targets: entry.sprite, scaleY: { from: 1, to: 1.06 }, scaleX: { from: 1, to: 0.96 },
      yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut', delay: Math.random() * 400,
    });
  }

  /** 주기적으로 성장 단계 갱신 */
  tick(delta: number) {
    const now = serverNow();
    for (const v of this.crops.values()) {
      const stage = growthInfo(v.crop, now).stage;
      if (stage !== v.stage) {
        v.stage = stage;
        v.sprite.setTexture(`crop_${v.crop.cropId}_${stage}`);
        this.scene.tweens.add({ targets: v.sprite, scaleY: { from: 0.8, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        if (stage === 3) this.readyWiggle(v);
      }
    }
    // 비료 준 칸: 가끔 하얀 가루가 살랑
    this.powderTimer -= delta;
    if (this.powderTimer <= 0 && this.powders.size) {
      this.powderTimer = 450;
      const list = [...this.powders.values()];
      const p = list[Math.floor(Math.random() * list.length)];
      const d = this.scene.add.rectangle(p.x + (Math.random() - 0.5) * 12, p.y + 2, 1, 1, 0xffffff).setDepth(p.depth + 1);
      this.add(d);
      this.scene.tweens.add({ targets: d, y: d.y - 8 - Math.random() * 6, alpha: 0, duration: 900, ease: 'Sine.easeOut', onComplete: () => d.destroy() });
    }
    this.sparkleTimer -= delta;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 700;
      const ready = [...this.crops.values()].filter((v) => v.stage === 3);
      if (ready.length) {
        const v = ready[Math.floor(Math.random() * ready.length)];
        const s = this.scene.add.sprite(v.sprite.x + (Math.random() * 10 - 5), v.sprite.y - 12 - Math.random() * 6, 'sparkle', 0).setDepth(v.sprite.depth + 1);
        this.add(s);
        s.play('sparkle_play');
        s.once('animationcomplete', () => s.destroy());
      }
    }
  }

  cropAt(x: number, y: number) { return this.crops.get(this.key(x, y))?.crop ?? null; }
  isPlot(x: number, y: number) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }

  /** 월드 좌표 → 밭 칸 좌표 */
  plotAtWorld(wx: number, wy: number): { x: number; y: number } | null {
    const x = Math.floor(wx / TS) - PLOT_ORIGIN.tx;
    const y = Math.floor(wy / TS) - PLOT_ORIGIN.ty;
    return this.isPlot(x, y) ? { x, y } : null;
  }

  harvestFx(x: number, y: number, cropId: string, target: { x: number; y: number }) {
    const p = plotCenter(x, y);
    const icon = this.scene.add.image(p.x, p.y, `icon_crop_${cropId}`).setDepth(1e6);
    this.add(icon);
    this.scene.tweens.add({
      targets: icon, y: p.y - 22, duration: 260, ease: 'Quad.easeOut',
      onComplete: () => this.scene.tweens.add({
        targets: icon, x: target.x, y: target.y - 14, scale: 0.5, alpha: 0.4, duration: 380, delay: 160, ease: 'Quad.easeIn',
        onComplete: () => icon.destroy(),
      }),
    });
    for (let i = 0; i < 6; i++) {
      const s = this.scene.add.sprite(p.x + Math.random() * 16 - 8, p.y - Math.random() * 12, 'sparkle', 0).setDepth(1e6);
      this.add(s);
      s.play({ key: 'sparkle_play', delay: i * 40 });
      s.once('animationcomplete', () => s.destroy());
    }
    void CROP_MAP;
  }

  plantFx(x: number, y: number) {
    const p = plotCenter(x, y);
    for (let i = 0; i < 7; i++) {
      const d = this.scene.add.rectangle(p.x, p.y + 4, 2, 2, i % 2 ? 0x9a6a45 : 0xc49464).setDepth(p.y + 6);
      this.add(d);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      this.scene.tweens.add({
        targets: d, x: p.x + Math.cos(ang) * (6 + Math.random() * 6), y: p.y + 4 + Math.sin(ang) * (5 + Math.random() * 5),
        alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => d.destroy(),
      });
    }
  }

  destroy() {
    this.plots.forEach((p) => p.destroy());
    this.crops.forEach((c) => { c.tween?.remove(); c.sprite.destroy(); });
    this.powders.forEach((p) => p.destroy());
    this.fences.forEach((f) => f.destroy());
    this.stakes.forEach((s) => s.destroy());
  }
}
