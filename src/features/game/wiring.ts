/**
 * 장면(Phaser)에서 올라오는 이벤트를 게임 동작으로 연결합니다.
 */
import { play } from '@/audio/sfx';
import { farmOwnerOf } from '@/config/game';
import { bus } from '@/game/bus';
import { useGame } from '@/stores/gameStore';
import { advanceTutorial, beggarCaught, cancelFishing, refreshBeggars, goHouse, goVillage, leaveHouse, makeWish, pickFruit, placeAt, plotAction, reelFishing, startFishing, waterFarm } from './actions';

let installed = false;

const SCARECROW_LINES = [
  '허수아비: "까마귀는 내가 지킬게요!"',
  '허수아비: "오늘도 밭이 참 예쁘네요~"',
  '허수아비: "물 주는 것도 잊지 말… 아, 여긴 비가 자주 와요!"',
];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function installGameWiring() {
  if (installed) return;
  installed = true;
  bus.on('interact', ({ kind, id }) => {
    const s = useGame.getState();
    if (s.phase !== 'playing' || s.traveling) return;
    const owner = farmOwnerOf(s.space);
    switch (kind) {
      case 'shop': s.openModal('shop'); break;
      case 'market': s.openModal('market'); break;
      case 'board': s.openModal('board'); break;
      case 'farmGate': s.openModal('residents', { from: 'gate' }); break;
      case 'fountain': void makeWish(); break; // 1분에 한 번, 10% 확률로 10G
      case 'exit': void goVillage(); break;
      case 'ship': if (owner) s.openModal('storage', { ownerId: owner }); break; // 주인은 넣고/빼기, 방문자는 구경
      case 'residentBoard': s.openModal('residentBoard'); break;
      case 'casino': s.openModal('casino'); break;
      case 'fruit': if (id) void pickFruit(id); break;
      case 'expand': s.openModal('expand'); break;
      case 'house': if (owner) void goHouse(owner); break; // 내 집은 꾸미기, 친구 집은 구경
      case 'houseExit': leaveHouse(); break;
      case 'mailbox': if (owner) s.openModal('guestbook', { ownerId: owner }); break; // 농장 방명록
      case 'scarecrow': play('pop'); s.toast(pick(SCARECROW_LINES)); break;
      default: break;
    }
  });
  bus.on('plot', ({ x, y }) => { void plotAction(x, y); });
  bus.on('water', () => { void waterFarm(); });
  bus.on('fish:cast', () => { void startFishing(); });
  bus.on('fish:reel', () => { void reelFishing(); });
  bus.on('fish:cancel', () => { cancelFishing(); });
  bus.on('beggar:caught', (id) => { void beggarCaught(id); });
  bus.on('night:start', () => { void refreshBeggars(); });
  bus.on('house:tile', ({ x, y }) => { void placeAt(x, y); });
  bus.on('tutorial:moved', () => { void advanceTutorial(0); });
}
