import { useEffect } from 'react';
import AuthScreen, { GameLogo, RecoveryScreen, SlotScreen, TitleBackdrop } from '@/features/auth/AuthScreen';
import CharacterScreen from '@/features/character/CharacterScreen';
import { bootApp, resetToAuth } from '@/features/game/boot';
import GameScreen from '@/features/game/GameScreen';
import { useGame } from '@/stores/gameStore';

function Loading() {
  const text = useGame((s) => s.travelText);
  return (
    <TitleBackdrop>
      <div className="panel anim-pop z-10 px-10 py-7 text-center">
        <GameLogo />
        <div className="mb-2 flex justify-center gap-2 text-2xl">
          {['🌱', '🥕', '🍓'].map((e, i) => <span key={e} className="anim-bob" style={{ animationDelay: `${i * 0.15}s` }}>{e}</span>)}
        </div>
        <div className="text-sm text-[#7a5444]">{text || '햇살마을로 가는 중…'}</div>
      </div>
    </TitleBackdrop>
  );
}

function Kicked() {
  return (
    <TitleBackdrop>
      <div className="panel anim-pop z-10 max-w-[420px] px-8 py-7 text-center">
        <GameLogo />
        <p className="mb-4 leading-relaxed">다른 창(또는 다른 기기)에서 같은 계정으로 접속해서 이 창의 연결을 종료했어요. 🌙</p>
        <button className="btn" onClick={() => window.location.reload()}>이 창에서 다시 접속하기</button>
      </div>
    </TitleBackdrop>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    bootApp().catch(() => resetToAuth());
  }, []);
  switch (phase) {
    case 'boot':
    case 'loading': return <Loading />;
    case 'auth': return <AuthScreen />;
    case 'recovery': return <RecoveryScreen />;
    case 'slot': return <SlotScreen />;
    case 'character': return <CharacterScreen />;
    case 'kicked': return <Kicked />;
    case 'playing': return <GameScreen />;
  }
}
