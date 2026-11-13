export interface Rect { x: number; y: number; w: number; h: number }

export interface MapObject {
  key: string;
  /** 월드 좌표 (스프라이트 아래쪽 가운데) */
  x: number;
  y: number;
  /** 충돌 상자 (발밑 기준, 픽셀). 없으면 통과 가능 */
  collide?: { w: number; h: number; dy?: number };
  flipX?: boolean;
  anim?: boolean;
  /** 깊이 보정 (바닥 장식은 -10000 등) */
  depth?: number;
  sway?: boolean;
  /** 과일 나무 ID (예: v:4,31) — 서버 fruit_trees 와 같음 */
  fruitId?: string;
  fruit?: 'apple' | 'peach';
}

export type InteractKind =
  | 'shop' | 'market' | 'board' | 'farmGate' | 'fountain' | 'bench'
  | 'exit' | 'ship' | 'expand' | 'house' | 'mailbox' | 'scarecrow' | 'residentBoard' | 'fruit' | 'casino' | 'houseExit';

export interface Interactable {
  id: string;
  kind: InteractKind;
  x: number;
  y: number;
  r: number;
  prompt: string;
  /** 앉기 위치 등 부가 정보 */
  data?: Record<string, number>;
}

export interface WorldLabel { x: number; y: number; text: string; style?: 'sign' | 'banner' }

export interface GameMap {
  id: 'village' | 'farm' | 'house';
  w: number;
  h: number;
  tiles: Uint8Array;
  objects: MapObject[];
  interactables: Interactable[];
  labels: WorldLabel[];
  spawn: { x: number; y: number };
  /** 이 영역에 들어가면 자동 이벤트 (예: 마을 가장자리 → 농장 목록) */
  triggers: { rect: Rect; kind: InteractKind }[];
  /** 추가 충돌 영역 */
  walls: Rect[];
}
