/**
 * 모든 스프라이트를 한 곳에서 생성/캐시합니다.
 * Phaser(BootScene) 와 React UI(아이콘) 가 같은 그래픽을 공유합니다.
 */
import { CROPS } from '@/config/crops';
import * as B from './buildings';
import { drawCrop, drawCropIcon, drawSeedIcon } from './crops';
import { UI_ICON_ART } from './icons';
import * as IT from './items';
import { FISH, FURNITURE, FURNITURE_COLORS, RODS, FERTILIZERS } from '@/config/shop';
import * as O from './objects';
import { PixelGrid, sheet } from './pixel';

export interface SpriteArt {
  canvas: HTMLCanvasElement;
  frameW?: number;
  frameH?: number;
  frames?: number;
}

const one = (g: PixelGrid): SpriteArt => ({ canvas: g.toCanvas() });
const anim = (frames: PixelGrid[]): SpriteArt => ({ canvas: sheet(frames), frameW: frames[0].w, frameH: frames[0].h, frames: frames.length });

let cache: Record<string, SpriteArt> | null = null;

export function buildAllArt(): Record<string, SpriteArt> {
  if (cache) return cache;
  const a: Record<string, SpriteArt> = {};
  // 건물
  a.seed_shop = one(B.seedShop());
  a.market = one(B.market());
  a.farm_house = one(B.farmHouse());
  a.cottage_blue = one(B.cottage('#7aa8e0'));
  a.cottage_green = one(B.cottage('#7cc485', '#fff3e0'));
  a.cottage_purple = one(B.cottage('#b39ae0', '#fbefd6'));
  a.casino = one(B.casino());
  // 자연
  a.tree = one(O.tree(undefined, 1));
  a.tree2 = one(O.tree(undefined, 7, '#86c95c'));
  a.tree_apple = one(O.tree('#ef5a5a', 3));
  a.tree_peach = one(O.tree('#ffab9a', 5, '#8fcf62'));
  // 과일을 딴 뒤의 모습 (같은 나무에서 열매만 없음)
  a.tree_apple_bare = one(O.tree(undefined, 3));
  a.tree_peach_bare = one(O.tree(undefined, 5, '#8fcf62'));
  a.fruit_marker_apple = one(O.fruitMarker('apple'));
  a.fruit_marker_peach = one(O.fruitMarker('peach'));
  a.pine = one(O.pineTree());
  a.bush = one(O.bush());
  a.bush_berry = one(O.bush(true));
  a.flowers_pink = one(O.flowers('#ff8fab', 1));
  a.flowers_yellow = one(O.flowers('#ffd84a', 2));
  a.flowers_white = one(O.flowers('#ffffff', 3));
  a.flowers_blue = one(O.flowers('#8fb8ff', 4));
  a.flowers_purple = one(O.flowers('#c49af0', 5));
  a.tall_grass = one(O.tallGrass());
  a.rock = one(O.rock(true));
  a.rock_small = one(O.rock(false));
  a.stump = one(O.stump());
  a.lily = one(O.lily());
  a.reeds = one(O.reeds());
  // 소품
  a.fence_h = one(O.fence('h'));
  a.fence_v = one(O.fence('v'));
  a.fence_post = one(O.fence('post'));
  a.bench = one(O.bench());
  a.lamp = one(O.lamp());
  a.sign = one(O.signPost());
  a.board = one(O.board());
  a.fountain = anim(O.fountainFrames());
  a.shipping_box = one(O.shippingBox());
  a.mailbox = one(O.mailbox());
  a.scarecrow = one(O.scarecrow());
  a.crate = one(O.crate());
  a.barrel = one(O.barrel());
  a.pot_pink = one(O.flowerPot('#ff8fab'));
  a.pot_yellow = one(O.flowerPot('#ffd84a'));
  a.seed_stand = one(O.seedStand());
  a.basket_carrot = one(O.produceBasket('#f58a3a'));
  a.basket_tomato = one(O.produceBasket('#ec4a3e'));
  a.basket_corn = one(O.produceBasket('#f7d33e'));
  a.plot = one(O.plotSoil());
  a.plot_cursor = one(O.plotCursor());
  a.plot_cursor_bad = one(O.plotCursor('#ffb0a0'));
  a.stake = one(O.stake());
  a.farm_arch = one(O.farmArch());
  a.butterfly_pink = anim(O.butterflyFrames('#ffb0c8'));
  a.butterfly_yellow = anim(O.butterflyFrames('#ffe680'));
  a.butterfly_white = anim(O.butterflyFrames('#ffffff'));
  a.sparkle = anim(O.sparkleFrames());
  a.heart = one(O.heartIcon());
  a.note = one(O.noteIcon());
  a.shadow = one(O.shadowBlob());
  // 작물
  for (const c of CROPS) {
    for (let s = 0; s < 4; s++) a[`crop_${c.id}_${s}`] = one(drawCrop(c.id, s));
    a[`icon_crop_${c.id}`] = one(drawCropIcon(c.id));
    a[`icon_seed_${c.id}`] = one(drawSeedIcon(c.id));
  }
  for (const [k, fn] of Object.entries(UI_ICON_ART)) a[`icon_${k}`] = one(fn());
  // 가구 (종류 × 색상)
  for (const f of FURNITURE) FURNITURE_COLORS.forEach((c, i) => { a[`furn_${f.type}_${i}`] = one(IT.FURNITURE_ART[f.type](c.base)); });
  for (const r of RODS) a[`icon_rod_${r.tier}`] = one(IT.rodIcon(r.tier));
  for (const f of FISH) a[`icon_fish_${f.id}`] = one(IT.fishIcon(f.id));
  for (const f of FERTILIZERS) a[`icon_fert_${f.minutes}`] = one(IT.fertIcon(f.minutes));
  a.bobber = one(IT.bobber());
  a.exclaim = one(IT.exclaim());
  a.house_window = one(IT.houseWindow());
  a.wall_clock = one(IT.wallClock());
  a.door_mat = one(IT.doorMat());
  a.fert_powder = one(IT.fertPowder());
  cache = a;
  return a;
}

const urlCache = new Map<string, string>();

/** React 용: 아이템 ID → 아이콘 data URL */
export function iconUrl(key: string): string {
  const hit = urlCache.get(key);
  if (hit) return hit;
  const art = buildAllArt();
  let k = key;
  if (key.startsWith('seed:')) k = `icon_seed_${key.slice(5)}`;
  else if (key.startsWith('crop:')) k = `icon_crop_${key.slice(5)}`;
  else if (key.startsWith('furn:')) k = key.replace(/:/g, '_'); // furn:bed:3 → furn_bed_3
  else if (/^(fish|rod|fert):/.test(key)) k = `icon_${key.replace(':', '_')}`;
  else if (!art[k]) k = `icon_${key}`;
  const c = art[k]?.canvas;
  const url = c ? c.toDataURL() : '';
  urlCache.set(key, url);
  return url;
}
