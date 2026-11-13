/**
 * 밤에 마을을 돌아다니는 거지들.
 *  - 밤이 되면 나타나고 아침이 되면 사라짐
 *  - 평소엔 길/광장을 어슬렁, 주민이 가까이 오면 빠르게 쫓아옴 (주민보다 조금 느림)
 *  - 나를 잡으면 'onCatch' → 서버가 돈을 뜯을지 결정 (거지마다 하루 1번)
 * 위치는 각 화면에서 계산하지만, 나타나는 자리/돌아다니는 목표를 시각 기준으로 정해서 모두 비슷하게 보여요.
 */
import Phaser from 'phaser';
import { BEGGAR, BEGGAR_WAYPOINTS, BEGGARS, type BeggarDef } from '@/config/night';
import { hash2 } from '../art/pixel';
import { Avatar } from '../entities/Avatar';
import type { Overlay } from './Overlay';

interface Beggar {
  def: BeggarDef;
  av: Avatar;
  key: string;
  mode: 'wander' | 'chase' | 'flee';
  targetId: string | null;
  modeSince: number;
  cooldownUntil: number;
  caught: boolean;
}

export interface BeggarHost {
  me: Avatar;
  others: Map<string, Avatar>;
  blocked(x: number, y: number): boolean;
  add(objs: Phaser.GameObjects.GameObject[]): void;
  overlay: Overlay;
}

export class Beggars {
  private list: Beggar[] = [];
  private fading = false;

  constructor(private scene: Phaser.Scene, private host: BeggarHost) {}

  get active() { return this.list.length > 0 && !this.fading; }

  /** 밤 시작: 거지들 등장 */
  spawn(cycleIndex: number) {
    if (this.list.length) return;
    this.fading = false;
    BEGGARS.forEach((def, i) => {
      const wp = BEGGAR_WAYPOINTS[Math.floor(hash2(cycleIndex, i, 17) * BEGGAR_WAYPOINTS.length)];
      const av = new Avatar(this.scene, `beggar-${def.id}`, def.name, def.appearance, wp[0] + (i - 2) * 6, wp[1], true);
      av.sprite.setTint(0xd2c4b0);
      av.sprite.setAlpha(0);
      this.scene.tweens.add({ targets: av.sprite, alpha: 1, duration: 900 });
      this.host.add([av.shadow, av.sprite]);
      this.host.overlay.setNameTag(av.id, `거지 ${def.name}`, false);
      this.list.push({ def, av, key: av.id, mode: 'wander', targetId: null, modeSince: 0, cooldownUntil: 0, caught: false });
    });
  }

  /** 아침: 슬금슬금 사라짐 */
  despawn() {
    if (!this.list.length || this.fading) return;
    this.fading = true;
    const list = this.list;
    this.scene.tweens.add({
      targets: list.map((b) => b.av.sprite), alpha: 0, duration: 900,
      onComplete: () => this.clear(),
    });
  }

  clear() {
    this.list.forEach((b) => { b.av.destroy(); this.host.overlay.removeNameTag(b.key); });
    this.list = [];
    this.fading = false;
  }

  /** 잡힌 뒤: 히히 웃으며 도망 */
  afterRob(beggarId: number, text: string | null) {
    const b = this.list.find((x) => x.def.id === beggarId);
    if (!b) return;
    b.mode = 'flee';
    b.modeSince = performance.now();
    b.cooldownUntil = performance.now() + 8000;
    b.targetId = null;
    if (text) this.host.overlay.showBubble(b.key, text);
  }

  /**
   * @param skipMe 나를 쫓지 않을 거지 (오늘 이미 돈을 뜯음)
   * @param canChaseMe 내가 마을에 있고 이동 중이 아님
   */
  update(dtMs: number, nowServerMs: number, skipMe: (id: number) => boolean, canChaseMe: boolean, onCatch: (id: number) => void) {
    if (!this.list.length || this.fading) return;
    const now = performance.now();
    const dt = Math.min(dtMs, 50) / 1000;
    const me = this.host.me;
    for (const [i, b] of this.list.entries()) {
      const pos = { x: b.av.x, y: b.av.y };
      // 쫓을 대상 고르기 (가장 가까운 주민)
      if (b.mode === 'wander' && now > b.cooldownUntil) {
        const cands: { id: string; a: Avatar }[] = [];
        if (canChaseMe && !skipMe(b.def.id)) cands.push({ id: me.id, a: me });
        this.host.others.forEach((a, id) => cands.push({ id, a }));
        let bestId: string | null = null, bestD = BEGGAR.sightRange;
        for (const c of cands) {
          const d = Math.hypot(c.a.x - pos.x, c.a.y - pos.y);
          if (d < bestD) { bestD = d; bestId = c.id; }
        }
        if (bestId) {
          b.mode = 'chase';
          b.targetId = bestId;
          b.modeSince = now;
          b.caught = false;
          if (b.targetId === me.id) this.host.overlay.showBubble(b.key, b.def.line);
        }
      }
      let tx: number, ty: number, speed: number;
      if (b.mode === 'chase') {
        const tgt = b.targetId === me.id ? me : this.host.others.get(b.targetId ?? '');
        const lost = !tgt || (b.targetId === me.id && (!canChaseMe || skipMe(b.def.id)));
        const d = tgt ? Math.hypot(tgt.x - pos.x, tgt.y - pos.y) : Infinity;
        if (lost || d > BEGGAR.giveUpRange || now - b.modeSince > BEGGAR.maxChaseSec * 1000) {
          b.mode = 'wander'; b.cooldownUntil = now + 4000; b.targetId = null;
          continue;
        }
        if (d < BEGGAR.catchRange) {
          if (b.targetId === me.id && !b.caught) { b.caught = true; onCatch(b.def.id); }
          if (b.targetId !== me.id) { b.mode = 'flee'; b.modeSince = now; b.cooldownUntil = now + 8000; }
          b.av.setState(b.av.dir, false);
          continue;
        }
        tx = tgt!.x; ty = tgt!.y; speed = BEGGAR.chaseSpeed;
      } else if (b.mode === 'flee') {
        if (now - b.modeSince > 2500) { b.mode = 'wander'; continue; }
        tx = pos.x + (pos.x - me.x) * 4; ty = pos.y + (pos.y - me.y) * 4; speed = BEGGAR.chaseSpeed * 0.8;
      } else {
        // 어슬렁: 7초마다 시각 기준으로 다음 목표
        const slot = Math.floor(nowServerMs / 7000) + i * 3;
        const wp = BEGGAR_WAYPOINTS[Math.floor(hash2(slot, i, 23) * BEGGAR_WAYPOINTS.length)];
        tx = wp[0] + (i - 2) * 5; ty = wp[1]; speed = BEGGAR.wanderSpeed;
      }
      const dx = tx - pos.x, dy = ty - pos.y;
      const len = Math.hypot(dx, dy);
      if (len < 2) { b.av.setState(b.av.dir, false); continue; }
      const step = Math.min(len, speed * dt);
      let nx = pos.x, ny = pos.y;
      const mx = (dx / len) * step, my = (dy / len) * step;
      if (!this.host.blocked(nx + mx, ny)) nx += mx; else if (!this.host.blocked(nx + mx, ny - 3)) { nx += mx; ny -= 1; } else if (!this.host.blocked(nx + mx, ny + 3)) { nx += mx; ny += 1; }
      if (!this.host.blocked(nx, ny + my)) ny += my; else if (!this.host.blocked(nx - 3, ny + my)) { ny += my; nx -= 1; } else if (!this.host.blocked(nx + 3, ny + my)) { ny += my; nx += 1; }
      b.av.setPos(nx, ny);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      b.av.setState(dir, Math.hypot(nx - pos.x, ny - pos.y) > 0.01);
    }
  }

  /** 이름표/말풍선 위치용 */
  tags(view: Phaser.Geom.Rectangle) {
    return this.list.map((b) => {
      const visible = b.av.x > view.x - 32 && b.av.x < view.right + 32 && b.av.y > view.y - 8 && b.av.y < view.bottom + 40;
      b.av.sprite.setVisible(visible); b.av.shadow.setVisible(visible);
      return { id: b.key, x: b.av.x, y: b.av.y, visible };
    });
  }

  destroy() { this.clear(); }
}
