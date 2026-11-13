/**
 * 낮과 밤 + 마을 거지.
 * ⚠ 주기/밤 판정은 supabase/migrations/20261113100000_night_beggars.sql 의 _is_night() 와 같아야 합니다.
 */
import type { Appearance } from './appearance';

export const DAY_NIGHT = {
  /** 한 바퀴 15분 = 낮 10분 + 밤 5분 (서버 시각 기준, 모두 같은 시간) */
  cycleSec: 900,
  daySec: 600,
  /** 해 질 녘 / 해 뜰 녘 어두워지는 시간 */
  twilightSec: 30,
};

export interface DayPhase {
  night: boolean;
  /** 지금 구간(낮/밤)이 끝날 때까지 남은 초 */
  secLeft: number;
  /** 게임 속 시각 (낮 06:00~20:00, 밤 20:00~06:00) */
  clock: string;
  /** 0 = 환한 낮, 1 = 깊은 밤 */
  darkness: number;
  /** 몇 번째 밤인지 (거지 위치를 모두 비슷하게 맞추는 데 씀) */
  cycleIndex: number;
}

/** 개발·체험 모드 테스트용: localStorage 'haetsal-force-night' = '1'(밤) / '0'(낮). 실서버 판정에는 영향 없음 */
export function forcedNight(): boolean | null {
  try {
    if (!(import.meta.env.DEV || import.meta.env.VITE_BACKEND === 'local') || typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem('haetsal-force-night');
    if (v === '1') return true;
    if (v === '0') return false;
    // 자동 테스트(브라우저 자동화)는 실제 시각과 상관없이 기본 낮 → 다른 테스트가 거지에게 방해받지 않도록
    return typeof navigator !== 'undefined' && navigator.webdriver ? false : null;
  } catch { return null; }
}

export function dayPhase(serverMs: number): DayPhase {
  const forced = forcedNight();
  if (forced !== null) {
    return { night: forced, secLeft: 300, clock: forced ? '23:00' : '12:00', darkness: forced ? 1 : 0, cycleIndex: Math.floor(serverMs / 1000 / DAY_NIGHT.cycleSec) };
  }
  const C = DAY_NIGHT.cycleSec, D = DAY_NIGHT.daySec, TW = DAY_NIGHT.twilightSec;
  const sec = serverMs / 1000;
  const t = ((sec % C) + C) % C;
  const night = t >= D;
  const cycleIndex = Math.floor(sec / C);
  let minutes: number;
  if (!night) minutes = 6 * 60 + (t / D) * 14 * 60;
  else minutes = 20 * 60 + ((t - D) / (C - D)) * 10 * 60;
  minutes = Math.floor(minutes) % (24 * 60);
  const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  let darkness: number;
  if (night) darkness = 1;
  else if (t > D - TW) darkness = (t - (D - TW)) / TW; // 해 질 녘
  else if (t < TW) darkness = 1 - t / TW; // 해 뜰 녘
  else darkness = 0;
  return { night, secLeft: night ? C - t : D - t, clock, darkness, cycleIndex };
}

// ───────────────────────── 마을 거지 ─────────────────────────
export interface BeggarDef { id: number; name: string; appearance: Appearance; line: string }
export const BEGGARS: BeggarDef[] = [
  { id: 1, name: '꼬질이', appearance: { hair: 1, hairColor: 1, skin: 2, outfit: 3, outfitColor: 7 }, line: '한 푼만 주세요~!' },
  { id: 2, name: '동냥이', appearance: { hair: 4, hairColor: 0, skin: 1, outfit: 1, outfitColor: 7 }, line: '배고파요… 동전 하나만!' },
  { id: 3, name: '빈털이', appearance: { hair: 7, hairColor: 7, skin: 3, outfit: 0, outfitColor: 5 }, line: '거기 부자 양반~ 잠깐만요!' },
  { id: 4, name: '허기진', appearance: { hair: 5, hairColor: 1, skin: 0, outfit: 3, outfitColor: 2 }, line: '오늘 한 끼도 못 먹었어요ㅠㅠ' },
  { id: 5, name: '구걸왕', appearance: { hair: 6, hairColor: 6, skin: 4, outfit: 1, outfitColor: 3 }, line: '도망가도 소용없어요~ 히히' },
];

export const BEGGAR = {
  /** 주민 걷기 속도는 72 → 계속 도망가면 따돌릴 수 있지만, 멈추면 잡힘 */
  chaseSpeed: 64,
  wanderSpeed: 26,
  /** 이 거리 안에 들어오면 쫓아옴 (px) */
  sightRange: 120,
  /** 이만큼 멀어지면 포기 */
  giveUpRange: 220,
  /** 이 거리까지 붙으면 잡힘 */
  catchRange: 11,
  /** 한 번에 이 시간까지만 쫓아옴 (초) */
  maxChaseSec: 14,
  /** 뜯는 돈: 100~1000G, 100G 단위 */
  minRob: 100,
  maxRob: 1000,
};

/** 거지가 밤에 돌아다니는 곳 (마을 길·광장) */
export const BEGGAR_WAYPOINTS: [number, number][] = [
  [360, 256], [536, 256], [360, 384], [536, 384], [404, 300], [492, 300],
  [120, 208], [300, 208], [600, 210], [770, 208],
  [80, 316], [220, 316], [620, 316], [800, 316],
  [448, 470], [448, 560], [272, 470], [160, 470],
];
