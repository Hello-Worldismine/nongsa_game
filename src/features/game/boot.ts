/**
 * 게임 진입 흐름: 로그인 → 슬롯 확인 → 캐릭터 → 게임 시작 → 공용 마을 스폰
 */
import { setAudio } from '@/audio/sfx';
import { GAME_CONFIG, type SpaceKey } from '@/config/game';
import type { Appearance } from '@/config/appearance';
import { session } from '@/features/multiplayer/session';
import { backend, getBackend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { AuthUser } from '@/types';
import { installGameWiring } from './wiring';

const st = () => useGame.getState();

let booted = false;

export async function bootApp() {
  if (booted) return;
  booted = true;
  // 픽셀 폰트를 미리 불러와야 게임 안 글자가 깨지지 않음
  await Promise.race([document.fonts.load('12px Galmuri11'), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
  const be = await getBackend();
  be.onAuthChange((event, user) => {
    if (event === 'PASSWORD_RECOVERY') st().set({ phase: 'recovery', user });
    if (event === 'SIGNED_OUT' && st().phase !== 'auth') resetToAuth();
  });
  if (window.location.pathname.startsWith('/reset-password') && be.kind === 'supabase') {
    // Supabase 가 URL 의 토큰을 처리하면 PASSWORD_RECOVERY 이벤트가 옴
    st().set({ phase: 'recovery' });
    return;
  }
  try {
    const user = await be.getUser();
    if (user) await afterLogin(user);
    else st().set({ phase: 'auth' });
  } catch {
    st().set({ phase: 'auth' });
  }
}

/** 로그인 직후: 플레이어 슬롯을 서버에서 원자적으로 배정 */
export async function afterLogin(user: AuthUser) {
  st().set({ user, phase: 'loading', travelText: '주민 등록 확인 중…' });
  try {
    const slot = await backend().claimSlot();
    if (slot.status !== 'ok') {
      const msg = slot.status === 'full'
        ? `${GAME_CONFIG.villageName}은(는) 지금 주민이 가득 찼어요 (정원 ${slot.max}명). 자리가 생기면 다시 와 주세요! 🏡`
        : slot.status === 'not_approved'
          ? '아직 초대받지 않은 계정이에요. 마을 관리자에게 이메일 등록을 부탁해 주세요! 💌'
          : '이 계정은 현재 비활성화되어 있어요. 마을 관리자에게 문의해 주세요.';
      st().set({ phase: 'slot', slotMessage: msg });
      return;
    }
    // 처음 온 주민만 캐릭터 만들기 화면. 이미 캐릭터가 있으면 바로 마을로!
    const existing = await backend().getMyCharacter();
    if (!existing) {
      st().set({ phase: 'character', editingCharacter: false });
      return;
    }
    await enterVillage();
  } catch (e) {
    st().set({ phase: 'slot', slotMessage: toKoreanError(e) });
  }
}

/** 외형 수정 화면 열기 (마을 안의 "외형 바꾸기" 버튼) */
export function editCharacter() {
  session.stop();
  st().set({ phase: 'character', editingCharacter: true, modal: null });
}

/** "게임 시작" — 캐릭터 저장 후 마을로 입장 */
export async function startGame(nickname: string, appearance: Appearance) {
  await backend().saveCharacter(nickname, appearance);
  await enterVillage();
}

/** 서버에서 플레이어 데이터를 불러와 마을 중앙 광장에 스폰 */
export async function enterVillage() {
  const be = backend();
  st().set({ phase: 'loading', travelText: `${GAME_CONFIG.villageName}로 접속 중…` });
  try {
    const state = await be.loadState();
    await be.startSession();
    const blocked = await be.listBlocked().catch(() => [] as string[]);
    const maxPlayers = await be.getMaxPlayers().catch(() => GAME_CONFIG.maxPlayers);
    const fruit = await be.fruitStatus().catch(() => ({ picks: {} as Record<string, number> }));
    const water = await be.waterStatus().catch(() => ({ logs: {} as Record<string, number> }));
    const rodUses = await be.rodStatus().catch(() => ({} as Record<string, number>));
    const beggars = await be.beggarStatus().catch(() => ({ robbed: [] as number[] }));
    setAudio(state.profile.settings.volume, state.profile.settings.muted);
    const firstSeed = Object.keys(state.inventory).find((k) => k.startsWith('seed:') && state.inventory[k] > 0)?.slice(5) ?? null;
    const village: SpaceKey = 'village';
    st().set({
      profile: state.profile,
      inventory: state.inventory,
      myFarm: state.farm,
      stats: state.stats,
      serverOffset: state.serverNow - Date.now(),
      settings: state.profile.settings,
      tutorialStep: state.profile.tutorialStep,
      blocked,
      space: village,
      viewFarm: null,
      arrival: 'start',
      selectedSeed: firstSeed,
      chatLog: [],
      modal: null,
      phase: 'playing',
      traveling: false,
      editingCharacter: false,
      maxPlayers,
      fruitPicks: fruit.picks,
      waterLogs: water.logs,
      rodUses,
      beggarRobbed: beggars.robbed,
    });
    installGameWiring();
    session.start(village);
  } catch (e) {
    console.error('[enterVillage]', e);
    st().set({ phase: 'slot', slotMessage: `마을에 들어가지 못했어요. ${toKoreanError(e)}` });
  }
}

export function resetToAuth() {
  session.stop();
  st().set({
    phase: 'auth', user: null, profile: null, inventory: {}, myFarm: null, viewFarm: null, stats: null,
    online: [], peers: [], chatLog: [], modal: null, space: 'village', prompt: null, hoverInfo: null,
  });
}

export async function logout() {
  session.stop();
  await backend().signOut();
  resetToAuth();
}
