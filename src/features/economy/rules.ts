import { CROP_MAP } from '@/config/crops';
import { FARM_LEVELS, MAX_FARM_LEVEL } from '@/config/farm';
import { GAME_CONFIG } from '@/config/game';
import type { PlantedCrop } from '@/types';

/** 성장 단계: 0 씨앗 → 1 새싹 → 2 성장 → 3 수확 가능 */
export type GrowthStage = 0 | 1 | 2 | 3;

export const STAGE_LABELS = ['씨앗을 심었어요', '새싹이 돋았어요!', '쑥쑥 자라고 있어요!', '다 자랐어요! 수확해 볼까요?'];

export function growthInfo(crop: PlantedCrop, serverNow: number) {
  const total = Math.max(1, crop.readyAt - crop.plantedAt);
  const elapsed = serverNow - crop.plantedAt;
  const progress = Math.min(1, Math.max(0, elapsed / total));
  const ready = serverNow >= crop.readyAt;
  let stage: GrowthStage;
  if (ready) stage = 3;
  else if (progress < 0.2) stage = 0;
  else if (progress < 0.55) stage = 1;
  else stage = 2;
  return { stage, progress, ready, remainingSec: Math.max(0, (crop.readyAt - serverNow) / 1000) };
}

export function isValidQty(qty: unknown, max = 999): qty is number {
  return typeof qty === 'number' && Number.isInteger(qty) && qty >= 1 && qty <= max;
}

export function seedCost(cropId: string, qty: number): number {
  const c = CROP_MAP[cropId];
  if (!c) throw new Error('UNKNOWN_CROP');
  return c.seedPrice * qty;
}

export function saleValue(cropId: string, qty: number): number {
  const c = CROP_MAP[cropId];
  if (!c) throw new Error('UNKNOWN_CROP');
  return c.sellPrice * qty;
}

export function nextExpansion(level: number) {
  if (level >= MAX_FARM_LEVEL) return null;
  return FARM_LEVELS.find((l) => l.level === level + 1) ?? null;
}

export function sizeForLevel(level: number): number {
  return FARM_LEVELS.find((l) => l.level === level)?.size ?? 3;
}

// 제어문자 + 보이지 않는 방향 제어 문자 (U+200B~U+200F, U+2028~U+202E)
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f) + String.fromCharCode(0x2028) + '-' + String.fromCharCode(0x202e) + ']', 'g');

/** 채팅 정리: 제어문자 제거, 공백 정리. HTML 은 항상 텍스트로만 렌더링합니다. */
export function sanitizeChat(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').trim();
}

export function validateChat(raw: string): { ok: true; body: string } | { ok: false; code: string } {
  const body = sanitizeChat(raw);
  if (!body) return { ok: false, code: 'CHAT_EMPTY' };
  if ([...body].length > GAME_CONFIG.chat.maxLength) return { ok: false, code: 'CHAT_TOO_LONG' };
  return { ok: true, body };
}

export const BOARD_MAX = 200;

/** 게시글 정리: 줄바꿈은 살리고 나머지 제어문자 제거, 빈 줄은 최대 1줄 (서버와 같은 규칙) */
export function sanitizeBoard(raw: string): string {
  const NL = String.fromCharCode(10);
  const lines = raw
    .split(String.fromCharCode(13) + NL).join(NL)
    .split('')
    .filter((ch) => { const c = ch.charCodeAt(0); return ch === NL || !(c < 32 || c === 127); })
    .join('')
    .split(NL);
  // 빈 줄은 최대 1줄까지만
  const out: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(line);
  }
  return out.join(NL).replace(/^\s+|\s+$/g, '');
}

export function validateBoard(raw: string): { ok: true; body: string } | { ok: false; code: string } {
  const body = sanitizeBoard(raw);
  if (!body) return { ok: false, code: 'BOARD_EMPTY' };
  if ([...body].length > BOARD_MAX) return { ok: false, code: 'BOARD_TOO_LONG' };
  return { ok: true, body };
}

export const GUESTBOOK_MAX = 120;

export function validateGuestbook(raw: string): { ok: true; body: string } | { ok: false; code: string } {
  const body = sanitizeChat(raw);
  if (!body) return { ok: false, code: 'GUESTBOOK_EMPTY' };
  if ([...body].length > GUESTBOOK_MAX) return { ok: false, code: 'GUESTBOOK_TOO_LONG' };
  return { ok: true, body };
}

export const isStorableItem = (id: string) => /^(seed|crop):[a-z_]+$/.test(id);

/** 한국 시간 기준 날짜 문자열 (일일 퀘스트 리셋 기준) */
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
