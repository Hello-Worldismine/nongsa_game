/**
 * React ↔ Phaser 이벤트 버스 (작고 타입 안전한 이벤트 에미터)
 */
import type { InteractKind } from './maps/types';
import type { EmoteKind, EmotePacket, FarmState, HouseState, MovePacket, PresenceInfo } from '@/types';

export interface BusEvents {
  // 앱 → 장면
  'remote:move': MovePacket;
  'remote:emote': EmotePacket;
  'remote:peers': PresenceInfo[];
  bubble: { id: string; text: string };
  'farm:update': FarmState;
  'fx:harvest': { x: number; y: number; cropId: string };
  'fx:plant': { x: number; y: number };
  'fx:expand': { size: number };
  'fx:coins': { amount: number };
  'expand:preview': { size: number | null };
  'local:emote': EmoteKind;
  'appearance:update': void;
  'touch:action': void;
  /** 같은 공간에 새 사람이 들어옴 → 내 위치를 한 번 방송 */
  'net:announce': void;
  /** 상대가 떠남 → 유예 없이 바로 지움 */
  'remote:bye': string;
  /** 카지노 판이 바뀜 (누가 걸거나 준비하거나 추첨됨) */
  'casino:changed': void;
  /** 친구 밭 한 칸에 물 주기 요청 (R 키) */
  water: void;
  'fx:water': { x: number; y: number };
  /** 과일을 땀 → 나무 모습 갱신 */
  'fx:fruit': { treeId: string };
  /** 집 가구가 바뀜 */
  'house:update': HouseState;
  /** 낚시: 입질 / 잡음 / 끝 */
  'fish:bite': void;
  'fish:caught': { fishId: string | null };
  'fish:end': void;
  'fx:fertilize': { x: number; y: number; minutes: number };
  /** 거지가 돈을 뜯은 결과 → 거지 말풍선 + 도망 */
  'beggar:result': { id: number; text: string | null };
  // 장면 → 앱
  interact: { kind: InteractKind; id: string; data?: Record<string, number> };
  plot: { x: number; y: number };
  /** 집 꾸미기: 칸 클릭 / E (x, y = 바닥 칸) */
  'house:tile': { x: number; y: number };
  /** 낚시 시작 (바라보는 물) / 당기기 */
  'fish:cast': void;
  'fish:reel': void;
  'fish:cancel': void;
  /** 거지에게 잡힘 (거지 ID) */
  'beggar:caught': number;
  /** 밤이 시작됨 */
  'night:start': void;
  'local:move': MovePacket;
  'tutorial:moved': void;
  'scene:ready': void;
}

type Handler<T> = (payload: T) => void;

class Bus {
  private map = new Map<keyof BusEvents, Set<Handler<unknown>>>();
  on<K extends keyof BusEvents>(ev: K, fn: Handler<BusEvents[K]>): () => void {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn as Handler<unknown>);
    return () => this.off(ev, fn);
  }
  off<K extends keyof BusEvents>(ev: K, fn: Handler<BusEvents[K]>) {
    this.map.get(ev)?.delete(fn as Handler<unknown>);
  }
  emit<K extends keyof BusEvents>(ev: K, ...payload: BusEvents[K] extends void ? [] : [BusEvents[K]]) {
    // 한 리스너의 오류가 다른 리스너를 막지 않도록
    [...(this.map.get(ev) ?? [])].forEach((fn) => {
      try { fn(payload[0]); } catch (e) { console.error(`[bus:${String(ev)}]`, e); }
    });
  }
}

export const bus = new Bus();
