import Phaser from 'phaser';
import { appearanceKey, type Appearance } from '@/config/appearance';
import { CHAR_DIRS, CHAR_FRAMES, CHAR_H, CHAR_W, renderCharacterSheet } from '../art/characters';
import { buildAllArt, type SpriteArt } from '../art/registry';

function addCanvasTexture(scene: Phaser.Scene, key: string, art: SpriteArt) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, art.canvas);
  if (!tex) return;
  if (art.frames && art.frameW && art.frameH) {
    const cols = Math.floor(art.canvas.width / art.frameW);
    for (let i = 0; i < art.frames; i++) {
      tex.add(i, 0, (i % cols) * art.frameW, Math.floor(i / cols) * art.frameH, art.frameW, art.frameH);
    }
  }
}

/** 모든 소품/작물/건물 텍스처 등록 + 기본 애니메이션 생성 */
export function registerArt(scene: Phaser.Scene) {
  const art = buildAllArt();
  for (const [k, v] of Object.entries(art)) addCanvasTexture(scene, k, v);
  const mk = (key: string, tex: string, frames: number[], rate: number, repeat = -1) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat });
  };
  mk('fountain_play', 'fountain', [0, 1, 2, 1], 6);
  mk('butterfly_pink_fly', 'butterfly_pink', [0, 1], 8);
  mk('butterfly_yellow_fly', 'butterfly_yellow', [0, 1], 8);
  mk('butterfly_white_fly', 'butterfly_white', [0, 1], 8);
  mk('sparkle_play', 'sparkle', [0, 1, 2, 1, 0], 12, 0);
}

/** 외형별 캐릭터 시트 텍스처 + 걷기 애니메이션 */
export function ensureCharTexture(scene: Phaser.Scene, appearance: Appearance): string {
  const key = `char_${appearanceKey(appearance)}`;
  if (!scene.textures.exists(key)) {
    const canvas = renderCharacterSheet(appearance);
    const tex = scene.textures.addCanvas(key, canvas)!;
    for (let r = 0; r < CHAR_DIRS.length; r++) for (let f = 0; f < CHAR_FRAMES; f++) {
      tex.add(r * CHAR_FRAMES + f, 0, f * CHAR_W, r * CHAR_H, CHAR_W, CHAR_H);
    }
  }
  CHAR_DIRS.forEach((d, r) => {
    const animKey = `${key}_walk_${d}`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: [1, 0, 2, 0].map((f) => ({ key, frame: r * CHAR_FRAMES + f })),
        frameRate: 8,
        repeat: -1,
      });
    }
  });
  return key;
}
