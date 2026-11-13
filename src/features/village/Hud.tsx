import { useEffect, useRef, useState } from 'react';
import { play } from '@/audio/sfx';
import { dayPhase } from '@/config/night';
import { CharacterPreview, Gold } from '@/components/ui';
import { farmOwnerOf, GAME_CONFIG, houseOwnerOf } from '@/config/game';
import { emote, goMyFarm, goVillage, leaveHouse, skipTutorial, TUTORIAL_DONE, TUTORIAL_STEPS } from '@/features/game/actions';
import { serverNow, useGame, type ModalKind } from '@/stores/gameStore';

function HudButton({ label, icon, onClick, badge, testId }: { label: string; icon: string; onClick: () => void; badge?: string | number; testId?: string }) {
  return (
    <button className="btn btn-cream relative h-11 min-w-11 !px-2.5 text-[18px] max-sm:h-9 max-sm:min-w-9 max-sm:!px-1.5 max-sm:text-[15px]" title={label} aria-label={label} onClick={() => { play('click'); onClick(); }} data-testid={testId}>
      <span>{icon}</span>
      <span className="hidden text-[12px] lg:inline">{label}</span>
      {badge !== undefined && <span className="badge absolute -right-2 -top-2 bg-[#7cc455] text-white shadow">{badge}</span>}
    </button>
  );
}

export function TopLeft() {
  const profile = useGame((s) => s.profile);
  const space = useGame((s) => s.space);
  const viewFarm = useGame((s) => s.viewFarm);
  const viewHouse = useGame((s) => s.viewHouse);
  if (!profile) return null;
  const owner = farmOwnerOf(space);
  const hOwner = houseOwnerOf(space);
  const place = hOwner ? (hOwner === profile.id ? '🏠 내 집' : `🏠 ${viewHouse?.ownerNickname ?? ''}의 집`)
    : owner ? (owner === profile.id ? '🏡 내 농장' : `🌼 ${viewFarm?.ownerNickname ?? ''}의 농장`) : `☀️ ${GAME_CONFIG.villageName}`;
  return (
    <div className="panel-soft pointer-events-auto absolute left-3 top-3 flex items-center gap-3 py-2 pl-2 pr-4">
      <div className="flex h-14 w-14 items-end justify-center overflow-hidden rounded-xl border-2 border-[#c9a274] bg-[#e6f4d4]">
        <CharacterPreview appearance={profile.appearance} scale={2.5} walking={false} />
      </div>
      <div className="leading-tight">
        <div className="text-[15px]" data-testid="my-nickname">{profile.nickname}</div>
        <Gold value={profile.gold} className="text-[15px] text-[#8a5a1e]" />
        <div className="mt-0.5 text-[11px] text-[#7a5444]">{place}</div>
      </div>
    </div>
  );
}

export function TopRight() {
  const online = useGame((s) => s.online);
  const open = useGame((s) => s.openModal);
  const conn = useGame((s) => s.conn);
  const maxPlayers = useGame((s) => s.maxPlayers);
  const connText = conn === 'connected' ? null : conn === 'connecting' ? '연결 중…' : '다시 연결하는 중…';
  return (
    <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-2 max-sm:left-2 max-sm:right-auto max-sm:top-[86px] max-sm:items-start">
      <div className="flex gap-2">
        <div className="panel-soft flex h-11 items-center gap-2 px-3 text-sm max-sm:h-9 max-sm:px-2 max-sm:text-xs" title="지금 접속 중인 주민" data-testid="online-count">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${conn === 'connected' ? 'bg-[#5fd35a]' : 'bg-[#f2b83a]'} shadow-[0_0_0_2px_#fff]`} />
          {online.length}/{maxPlayers}명
        </div>
        <HudButton label="주민" icon="👥" onClick={() => open('residents')} testId="btn-residents" />
        <HudButton label="퀘스트" icon="📜" onClick={() => open('quests')} />
        <HudButton label="기록" icon="📊" onClick={() => open('stats')} />
        <HudButton label="도움말" icon="❓" onClick={() => open('help')} />
        <HudButton label="설정" icon="⚙️" onClick={() => open('settings')} />
      </div>
      {connText && <div className="panel-soft anim-fade px-3 py-1 text-xs text-[#a0602a]">📡 {connText}</div>}
    </div>
  );
}

export function PlaceNav() {
  const space = useGame((s) => s.space);
  const me = useGame((s) => s.profile?.id);
  const owner = farmOwnerOf(space);
  if (houseOwnerOf(space)) {
    return (
      <div className="pointer-events-auto absolute right-3 top-[68px] flex items-end gap-2 sm:top-[72px] max-sm:top-3">
        <button className="btn btn-sm" onClick={() => leaveHouse()} data-testid="btn-leave-house">🚪 밖으로 나가기</button>
        <button className="btn btn-sky btn-sm" onClick={() => goVillage()} data-testid="btn-to-village">🏘️ 마을로</button>
      </div>
    );
  }
  return (
    <div className="pointer-events-auto absolute right-3 top-[68px] flex flex-col items-end gap-2 sm:top-[72px] max-sm:top-3">
      {owner && <button className="btn btn-sky btn-sm" onClick={() => goVillage()} data-testid="btn-to-village">🏘️ 마을로 돌아가기</button>}
      {owner !== me && <button className="btn btn-sm" onClick={() => goMyFarm()} data-testid="btn-my-farm">🌱 내 농장으로</button>}
      {owner === me && <button className="btn btn-gold btn-sm" onClick={() => useGame.getState().openModal('expand')}>🧱 농장 확장</button>}
    </div>
  );
}

export function PromptBar() {
  const prompt = useGame((s) => s.prompt);
  if (!prompt) return null;
  return (
    <div className="pointer-events-none absolute bottom-[104px] left-1/2 -translate-x-1/2 max-sm:bottom-[200px]">
      <div className="panel-soft anim-pop whitespace-nowrap px-4 py-1.5 text-sm" data-testid="prompt">{prompt}</div>
    </div>
  );
}

export function HoverTooltip() {
  const h = useGame((s) => s.hoverInfo);
  if (!h) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full" style={{ left: h.x, top: h.y }}>
      <div className={`panel-soft px-3 py-2 text-center text-xs leading-relaxed ${h.ready ? 'border-[#7cc455]' : ''}`}>
        <div className="text-sm">{h.title}</div>
        {h.lines.map((l) => <div key={l}>{l}</div>)}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const color = { info: 'bg-[#fff8e8]', success: 'bg-[#e9f8dc]', error: 'bg-[#ffe9e6]', gold: 'bg-[#fff3c4]' };
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`panel-soft anim-toast max-w-[90vw] px-4 py-2 text-center text-sm ${color[t.kind]}`} role="status">{t.text}</div>
      ))}
    </div>
  );
}

export function TutorialBubble() {
  const step = useGame((s) => s.tutorialStep);
  const myFarm = useGame((s) => s.myFarm);
  const modal = useGame((s) => s.modal);
  if (step >= TUTORIAL_DONE || modal) return null;
  let text = TUTORIAL_STEPS[step];
  if (step === 4 && myFarm && !myFarm.crops.some((c) => Date.now() + useGame.getState().serverOffset >= c.readyAt)) {
    text = '당근이 쑥쑥 자라는 중이에요! 30초만 기다리면 수확할 수 있어요 ⏳';
  }
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[86px] z-20 w-[min(560px,92vw)] -translate-x-1/2 sm:top-20 max-sm:top-[136px]">
      <div className="panel-soft anim-pop flex items-center gap-3 px-3 py-2" data-testid="tutorial">
        <div className="anim-bob text-2xl">🌱</div>
        <div className="flex-1 text-sm leading-relaxed">
          <div className="text-[11px] text-[#8a6a5a]">새싹이의 안내 ({step + 1}/{TUTORIAL_DONE})</div>
          {text}
        </div>
        <button className="btn btn-cream btn-sm shrink-0" onClick={() => skipTutorial()}>건너뛰기</button>
      </div>
    </div>
  );
}

export function TravelOverlay() {
  const traveling = useGame((s) => s.traveling);
  const text = useGame((s) => s.travelText);
  if (!traveling) return null;
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#fff8e6]/85 anim-fade" data-testid="travel-overlay">
      <div className="mb-3 flex gap-2 text-3xl">
        {['🌱', '🥕', '🍓'].map((e, i) => <span key={e} className="anim-bob" style={{ animationDelay: `${i * 0.15}s` }}>{e}</span>)}
      </div>
      <div className="text-lg text-[#6b4430]">{text}</div>
    </div>
  );
}

export function EmoteBar() {
  const items: [Parameters<typeof emote>[0], string, string][] = [
    ['hello', '👋', '인사하기'], ['heart', '💖', '하트'], ['wave', '🙌', '손 흔들기'], ['note', '🎵', '콧노래'],
  ];
  return (
    <div className="pointer-events-auto absolute bottom-[64px] right-3 flex gap-1.5 max-sm:hidden">
      {items.map(([k, e, l]) => (
        <button key={k} className="btn btn-cream btn-icon text-lg" title={l} aria-label={l} onClick={() => emote(k)}>{e}</button>
      ))}
    </div>
  );
}

export const modalTitle: Record<ModalKind, string> = {
  shop: '씨앗 상점', market: '농산물 판매소', inventory: '가방', residents: '햇살마을 주민', board: '마을 게시판',
  expand: '농장 확장', settings: '설정', stats: '농장 기록', quests: '오늘의 퀘스트', player: '주민 정보', help: '도움말',
  storage: '보관함', residentBoard: '주민 게시판', guestbook: '방명록', casino: '햇살 카지노', houseExpand: '집 넓히기', notice: '업데이트 소식',
};

/** 새 버전 안내 (강제 새로고침 없이, 플레이어가 편할 때) */
export function NewVersionBanner() {
  const show = useGame((s) => s.newVersion);
  const set = useGame((s) => s.set);
  if (!show) return null;
  return (
    <div className="pointer-events-auto absolute bottom-[78px] left-1/2 z-30 -translate-x-1/2 max-sm:bottom-[128px]">
      <div className="panel-soft anim-pop flex items-center gap-3 px-4 py-2 text-sm">
        <span>🌱 새 버전이 나왔어요! 편할 때 새로고침해 주세요.</span>
        <button className="btn btn-sm" onClick={() => window.location.reload()}>지금 새로고침</button>
        <button className="btn btn-cream btn-sm" onClick={() => set({ newVersion: false })}>나중에</button>
      </div>
    </div>
  );
}

/** 낮/밤 시계 (낮 10분 · 밤 5분 반복, 모두 같은 시간) */
export function DayClock() {
  const [now, setNow] = useState(() => serverNow());
  const prevNight = useRef<boolean | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, []);
  const ph = dayPhase(now);
  useEffect(() => {
    if (prevNight.current !== null && prevNight.current !== ph.night) {
      const st = useGame.getState();
      if (ph.night) { play('quest'); st.toast('🌙 밤이 되었어요! 마을에 거지들이 돌아다녀요. 멈춰 있으면 잡혀서 돈을 뜯겨요!', 'info'); }
      else st.toast('☀️ 아침이 밝았어요! 거지들이 모두 돌아갔어요.', 'success');
    }
    prevNight.current = ph.night;
  }, [ph.night]);
  const m = Math.floor(ph.secLeft / 60), s = Math.floor(ph.secLeft % 60);
  const left = m > 0 ? `${m}분 ${s}초` : `${s}초`;
  return (
    <div className={`panel-soft pointer-events-auto absolute left-3 top-[100px] flex items-center gap-2 px-3 py-1.5 text-sm max-sm:top-[136px] ${ph.night ? '!bg-[#2e2f5e] !text-[#f4ecff] !border-[#8a86c8]' : ''}`}
      title="낮 10분 · 밤 5분이 반복돼요. 밤에는 마을에 거지가 나와요!" data-testid="day-clock">
      <span className="text-lg">{ph.night ? '🌙' : '☀️'}</span>
      <span className="tabular-nums">{ph.night ? '밤' : '낮'} {ph.clock}</span>
      <span className={`text-[11px] ${ph.night ? 'text-[#c8c4f0]' : 'text-[#8a6a5a]'}`}>{ph.night ? `아침까지 ${left} · 거지 조심!` : `밤까지 ${left}`}</span>
    </div>
  );
}
