import Phaser from 'phaser';
import type { Appearance } from '@/config/appearance';
import type { Direction } from '@/types';
import { CHAR_DIRS, CHAR_FRAMES } from '../art/characters';
import { ensureCharTexture } from '../systems/textures';

/** 플레이어 캐릭터 (내 캐릭터 / 다른 플레이어 공용) */
export class Avatar {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  dir: Direction = 'down';
  moving = false;
  sitting = false;
  texKey: string;
  private remote: { x: number; y: number; vx: number; vy: number; dir: Direction; moving: boolean; t: number } | null = null;
  private hopping = false;

  constructor(
    private scene: Phaser.Scene,
    public id: string,
    public nickname: string,
    public appearance: Appearance,
    x: number,
    y: number,
    public isMe: boolean,
  ) {
    this.texKey = ensureCharTexture(scene, appearance);
    this.shadow = scene.add.image(x, y + 1, 'shadow').setOrigin(0.5, 0.5);
    this.sprite = scene.add.sprite(x, y, this.texKey, 0).setOrigin(0.5, 1);
    this.syncDepth();
    if (!isMe) {
      this.sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
    }
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setAppearance(a: Appearance) {
    this.appearance = a;
    this.texKey = ensureCharTexture(this.scene, a);
    this.sprite.setTexture(this.texKey, this.frameIdx(0));
    this.applyAnim();
  }

  private frameIdx(f: number, dir: Direction = this.dir) {
    return CHAR_DIRS.indexOf(dir) * CHAR_FRAMES + f;
  }

  setPos(x: number, y: number) {
    this.sprite.setPosition(x, y);
    this.shadow.setPosition(x, y + 1);
    this.syncDepth();
  }

  private syncDepth() {
    this.sprite.setDepth(this.sprite.y + 0.5);
    this.shadow.setDepth(this.sprite.y - 0.6);
  }

  setState(dir: Direction, moving: boolean) {
    const changed = dir !== this.dir || moving !== this.moving;
    this.dir = dir;
    this.moving = moving;
    if (moving) this.sitting = false;
    if (changed) this.applyAnim();
  }

  sit(on: boolean) {
    this.sitting = on;
    if (on) { this.dir = 'down'; this.moving = false; }
    this.applyAnim();
  }

  private applyAnim() {
    if (this.sitting) {
      this.sprite.anims.stop();
      this.sprite.setFrame(this.frameIdx(3, 'down'));
      this.shadow.setVisible(false);
      return;
    }
    this.shadow.setVisible(true);
    if (this.moving) this.sprite.anims.play(`${this.texKey}_walk_${this.dir}`, true);
    else { this.sprite.anims.stop(); this.sprite.setFrame(this.frameIdx(0)); }
  }

  /** 원격 이동 패킷 반영 */
  pushRemote(p: { x: number; y: number; dir: Direction; moving: boolean; vx?: number; vy?: number }) {
    const now = performance.now();
    if (Math.hypot(p.x - this.x, p.y - this.y) > 160) this.setPos(p.x, p.y); // 순간이동(공간 이동 등)
    this.remote = { x: p.x, y: p.y, vx: p.moving ? p.vx ?? 0 : 0, vy: p.moving ? p.vy ?? 0 : 0, dir: p.dir, moving: p.moving, t: now };
  }

  /**
   * 원격 캐릭터 업데이트: 마지막 패킷 위치에서 받은 속도로 계속 걸어간다고 가정해 목표 위치를 구하고,
   * 화면 위치를 목표 쪽으로 부드럽게 따라가게 합니다. (패킷이 드물어도 끊기지 않게)
   */
  updateRemote(dtMs: number, walkSpeed: number) {
    const r = this.remote;
    if (!r) return;
    const elapsed = Math.min(1.2, (performance.now() - r.t) / 1000); // 최대 1.2초까지만 예측
    const tx = r.x + r.vx * walkSpeed * elapsed;
    const ty = r.y + r.vy * walkSpeed * elapsed;
    const ex = tx - this.x, ey = ty - this.y;
    const err = Math.hypot(ex, ey);
    if (err > 120) this.setPos(tx, ty);
    else if (err > 0.05) {
      const k = Math.min(1, (dtMs / 1000) * 12);
      this.setPos(this.x + ex * k, this.y + ey * k);
    }
    const walking = (r.moving && elapsed < 1.2) || err > 1.5;
    this.setState(r.dir, walking);
  }

  hop() {
    if (this.hopping) return;
    this.hopping = true;
    this.scene.tweens.add({
      targets: this.sprite, y: this.sprite.y - 4, duration: 110, yoyo: true, repeat: 1, ease: 'Quad.easeOut',
      onComplete: () => { this.hopping = false; },
    });
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
