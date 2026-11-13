/**
 * 화면 좌표 오버레이 (닉네임, 말풍선, 간판 글씨, 떠오르는 숫자).
 * 픽셀 폰트가 카메라 확대로 흐려지지 않도록 1배율 UI 카메라에 그립니다.
 */
import Phaser from 'phaser';
import { GAME_CONFIG } from '@/config/game';

export const FONT = 'Galmuri11, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const RES = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));

let measureCtx: CanvasRenderingContext2D | null = null;
export function wrapText(text: string, maxWidth: number, font = `12px ${FONT}`): string[] {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = font;
  const lines: string[] = [];
  let line = '';
  // 글자 단위로 줄바꿈 (한글은 띄어쓰기가 없어도 자연스럽게)
  for (const word of text.split(/(\s+)/)) {
    if (ctx.measureText(line + word).width <= maxWidth) { line += word; continue; }
    if (line.trim()) { lines.push(line.trimEnd()); line = ''; }
    for (const ch of word.trimStart()) {
      if (ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ''; }
      line += ch;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.slice(0, 6);
}

interface Tag { cont: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }
interface Bubble { cont: Phaser.GameObjects.Container; until: number; h: number }

export class Overlay {
  readonly layer: Phaser.GameObjects.Layer;
  private tags = new Map<string, Tag>();
  private bubbles = new Map<string, Bubble>();
  private labels: { cont: Phaser.GameObjects.Container; x: number; y: number }[] = [];

  constructor(private scene: Phaser.Scene) {
    this.layer = scene.add.layer();
    this.layer.setDepth(1e9);
  }

  private text(str: string, color: string, size = 12) {
    return this.scene.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${size}px`, color, resolution: RES,
    }).setOrigin(0.5, 0.5);
  }

  setNameTag(id: string, name: string, isMe: boolean) {
    this.removeNameTag(id);
    const text = this.text(name, isMe ? '#fffbe0' : '#ffffff');
    const w = Math.ceil(text.width) + 10, h = 16;
    const bg = this.scene.add.graphics();
    bg.fillStyle(isMe ? 0x5c8a3a : 0x4a3036, isMe ? 0.82 : 0.68);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    const cont = this.scene.add.container(0, 0, [bg, text]);
    this.layer.add(cont);
    this.tags.set(id, { cont, text, bg });
  }

  removeNameTag(id: string) {
    this.tags.get(id)?.cont.destroy();
    this.tags.delete(id);
    this.bubbles.get(id)?.cont.destroy();
    this.bubbles.delete(id);
  }

  showBubble(id: string, message: string) {
    this.bubbles.get(id)?.cont.destroy();
    const lines = wrapText(message, 150);
    const text = this.scene.add.text(0, 0, lines.join('\n'), {
      fontFamily: FONT, fontSize: '12px', color: '#4a3036', resolution: RES, lineSpacing: 3, align: 'center',
    }).setOrigin(0.5, 0.5);
    const w = Math.max(28, Math.ceil(text.width) + 16), h = Math.ceil(text.height) + 12;
    const g = this.scene.add.graphics();
    // 그림자
    g.fillStyle(0x4a3036, 0.18); g.fillRoundedRect(-w / 2 + 2, -h + 2, w, h, 7);
    // 본체
    g.fillStyle(0xfffcf2, 1); g.fillRoundedRect(-w / 2, -h, w, h, 7);
    g.lineStyle(2, 0x7a5444, 1); g.strokeRoundedRect(-w / 2, -h, w, h, 7);
    // 꼬리
    g.fillStyle(0xfffcf2, 1); g.fillTriangle(-5, -1, 5, -1, 0, 6);
    g.lineStyle(2, 0x7a5444, 1); g.lineBetween(-5, 0, 0, 6); g.lineBetween(5, 0, 0, 6);
    g.fillStyle(0xfffcf2, 1); g.fillRect(-4, -3, 8, 3);
    text.setPosition(0, -h / 2);
    const cont = this.scene.add.container(0, 0, [g, text]);
    cont.setScale(0.6).setAlpha(0);
    this.scene.tweens.add({ targets: cont, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });
    this.layer.add(cont);
    this.bubbles.set(id, { cont, until: performance.now() + GAME_CONFIG.chat.bubbleMs, h });
  }

  addLabel(x: number, y: number, str: string, style: 'sign' | 'banner' = 'sign') {
    const text = this.text(str, style === 'banner' ? '#fff8e6' : '#5a3a2e', 12);
    const w = Math.ceil(text.width) + 14, h = 18;
    const g = this.scene.add.graphics();
    if (style === 'banner') {
      g.fillStyle(0x7a4e36, 1); g.fillRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 4);
      g.fillStyle(0xc0845a, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 3);
      g.fillStyle(0xd89a6a, 1); g.fillRect(-w / 2 + 3, -h / 2 + 2, w - 6, 2);
    } else {
      g.fillStyle(0x7a5444, 0.9); g.fillRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 5);
      g.fillStyle(0xfff6e0, 0.95); g.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    }
    const cont = this.scene.add.container(0, 0, [g, text]);
    this.layer.add(cont);
    this.labels.push({ cont, x, y });
    return cont;
  }

  /** 떠오르는 글자 (+35G 등) — 월드 좌표 기준 */
  floatText(wx: number, wy: number, str: string, color = '#fff3a0') {
    const cam = this.scene.cameras.main;
    const t = this.text(str, color, 12).setStroke('#5a3a2e', 4);
    const p = this.toScreen(cam, wx, wy);
    t.setPosition(p.x, p.y);
    this.layer.add(t);
    this.scene.tweens.add({ targets: t, y: p.y - 34, alpha: { from: 1, to: 0 }, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  toScreen(cam: Phaser.Cameras.Scene2D.Camera, wx: number, wy: number) {
    return { x: Math.round((wx - cam.worldView.x) * cam.zoom), y: Math.round((wy - cam.worldView.y) * cam.zoom) };
  }

  /** 매 프레임: 캐릭터 위치에 맞춰 이름표·말풍선 이동, 화면 밖은 숨김 */
  update(avatars: { id: string; x: number; y: number; visible: boolean }[]) {
    const cam = this.scene.cameras.main;
    const now = performance.now();
    const view = cam.worldView;
    for (const a of avatars) {
      const tag = this.tags.get(a.id);
      const onScreen = a.visible && a.x > view.x - 40 && a.x < view.right + 40 && a.y > view.y - 10 && a.y < view.bottom + 60;
      const p = this.toScreen(cam, a.x, a.y - 22);
      if (tag) {
        tag.cont.setVisible(onScreen);
        tag.cont.setPosition(p.x, p.y - 10);
      }
      const b = this.bubbles.get(a.id);
      if (b) {
        if (now > b.until) {
          this.bubbles.delete(a.id);
          this.scene.tweens.add({ targets: b.cont, alpha: 0, y: b.cont.y - 6, duration: 350, onComplete: () => b.cont.destroy() });
        } else {
          b.cont.setVisible(onScreen); // 화면 밖 캐릭터의 말풍선은 그리지 않음
          b.cont.setPosition(p.x, p.y - 24);
        }
      }
    }
    for (const l of this.labels) {
      const p = this.toScreen(cam, l.x, l.y);
      l.cont.setPosition(p.x, p.y);
    }
  }

  destroy() {
    this.tags.forEach((t) => t.cont.destroy());
    this.bubbles.forEach((b) => b.cont.destroy());
    this.labels.forEach((l) => l.cont.destroy());
    this.layer.destroy();
  }
}
