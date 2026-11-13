/**
 * 게임 전역 설정. 마을 이름 / 정원 / 네트워크 주기 등은 여기서 바꿉니다.
 * (서버 측 정원은 Supabase 의 game_settings 테이블 값이 최종 기준입니다.)
 */
export const GAME_CONFIG = {
  villageName: '햇살마을',
  /** 클라이언트에서 안내용으로 쓰는 정원 (서버 game_settings.max_players 가 우선) */
  maxPlayers: 10,
  startingGold: 300,
  tileSize: 16,
  /** 캐릭터 이동 속도 (월드 픽셀/초) */
  walkSpeed: 72,
  /** 위치 전송 주기 (Hz) — Supabase 무료 요금제의 초당 메시지 한도를 고려해 5Hz (수신 측 보간으로 부드럽게) */
  netSendHz: 5,
  /** 원격 캐릭터 보간 지연 (ms) */
  interpolationDelayMs: 240,
  chat: {
    maxLength: 100,
    bubbleMs: 5000,
    /** N 초 동안 최대 M 개 (서버에서도 동일하게 검증) */
    rateWindowSec: 5,
    rateMax: 5,
    historySize: 60,
  },
  interactRange: 22,
} as const;

export type SpaceKey = 'village' | `farm:${string}` | `house:${string}`;

export const VILLAGE_SPACE: SpaceKey = 'village';
export const farmSpace = (ownerId: string): SpaceKey => `farm:${ownerId}`;
export const isFarmSpace = (s: string): s is `farm:${string}` => s.startsWith('farm:');
export const farmOwnerOf = (s: SpaceKey): string | null => (isFarmSpace(s) ? s.slice(5) : null);
export const houseSpace = (ownerId: string): SpaceKey => `house:${ownerId}`;
export const isHouseSpace = (s: string): s is `house:${string}` => s.startsWith('house:');
export const houseOwnerOf = (s: SpaceKey): string | null => (isHouseSpace(s) ? s.slice(6) : null);
