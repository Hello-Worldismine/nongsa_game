/** 캐릭터 외형 선택지 (색상 팔레트). */
export interface Appearance {
  hair: number;
  hairColor: number;
  skin: number;
  outfit: number;
  outfitColor: number;
}

export const HAIR_STYLES = ['단정 단발', '삐죽 머리', '양갈래', '포니테일', '동글 뽀글', '긴 생머리', '똥머리', '빡빡 짧은머리'];
export const OUTFIT_STYLES = ['멜빵 바지', '후드티', '원피스', '농부 조끼'];

export const HAIR_COLORS = [
  { name: '초코', base: '#6b4430' },
  { name: '먹색', base: '#3b3542' },
  { name: '꿀색', base: '#e0a64a' },
  { name: '딸기', base: '#e7849a' },
  { name: '라벤더', base: '#a58ad6' },
  { name: '민트', base: '#6fc4b4' },
  { name: '노을', base: '#d8683f' },
  { name: '우유', base: '#efe3cf' },
];

export const SKIN_TONES = [
  { name: '우윳빛', base: '#ffe3cf' },
  { name: '복숭아', base: '#f8cfae' },
  { name: '살구', base: '#eab48c' },
  { name: '구릿빛', base: '#c98e64' },
  { name: '코코아', base: '#91603f' },
];

export const OUTFIT_COLORS = [
  { name: '하늘', base: '#7fb8e6' },
  { name: '딸기우유', base: '#f2a0b4' },
  { name: '새싹', base: '#8fcf6a' },
  { name: '레몬', base: '#f2d266' },
  { name: '라벤더', base: '#b39ae0' },
  { name: '토마토', base: '#e6735c' },
  { name: '민트', base: '#7fd1bf' },
  { name: '코코아', base: '#a8775a' },
];

export const DEFAULT_APPEARANCE: Appearance = { hair: 0, hairColor: 0, skin: 1, outfit: 0, outfitColor: 0 };

export function sanitizeAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const clamp = (v: unknown, n: number, d: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < n ? v : d;
  return {
    hair: clamp(a?.hair, HAIR_STYLES.length, 0),
    hairColor: clamp(a?.hairColor, HAIR_COLORS.length, 0),
    skin: clamp(a?.skin, SKIN_TONES.length, 1),
    outfit: clamp(a?.outfit, OUTFIT_STYLES.length, 0),
    outfitColor: clamp(a?.outfitColor, OUTFIT_COLORS.length, 0),
  };
}

export const appearanceKey = (a: Appearance) => `${a.hair}-${a.hairColor}-${a.skin}-${a.outfit}-${a.outfitColor}`;

export const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,10}$/;
