import { useState, type FormEvent } from 'react';
import { play } from '@/audio/sfx';
import { CharacterPreview, PixelIcon } from '@/components/ui';
import { GAME_CONFIG } from '@/config/game';
import { afterLogin, resetToAuth } from '@/features/game/boot';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';

const DECOR = [
  { hair: 2, hairColor: 3, skin: 0, outfit: 2, outfitColor: 1 },
  { hair: 1, hairColor: 1, skin: 2, outfit: 0, outfitColor: 0 },
  { hair: 6, hairColor: 2, skin: 1, outfit: 3, outfitColor: 2 },
];

export function TitleBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="sky-bg relative flex h-full w-full items-center justify-center overflow-hidden p-4">
      {/* 구름 */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="pointer-events-none absolute h-10 rounded-full bg-white/80"
          style={{ top: `${8 + i * 9}%`, width: 120 + i * 40, animation: `cloud ${55 + i * 20}s linear ${-i * 17}s infinite`, boxShadow: '30px -14px 0 4px rgba(255,255,255,.8), 70px 0 0 0 rgba(255,255,255,.8)' }} />
      ))}
      {/* 걷는 주민들 */}
      <div className="pointer-events-none absolute bottom-[6%] left-[6%] hidden gap-10 md:flex">
        {DECOR.map((a, i) => <CharacterPreview key={i} appearance={a} scale={4} dir={i === 1 ? 2 : 0} className="anim-bob" />)}
      </div>
      <div className="pointer-events-none absolute bottom-[8%] right-[7%] hidden md:block">
        <CharacterPreview appearance={{ hair: 4, hairColor: 4, skin: 3, outfit: 1, outfitColor: 6 }} scale={4} dir={1} />
      </div>
      {children}
    </div>
  );
}

export function GameLogo() {
  return (
    <div className="mb-5 text-center">
      <div className="mb-1 flex items-center justify-center gap-2">
        <PixelIcon id="icon_crop_carrot" size={28} className="anim-float" />
        <h1 className="text-4xl text-[#6b4430]" style={{ textShadow: '0 3px 0 #fff3c8, 0 5px 0 #c0845a' }}>{GAME_CONFIG.villageName}</h1>
        <PixelIcon id="icon_crop_strawberry" size={28} className="anim-float" />
      </div>
      <p className="text-sm text-[#7a5444]">친구들과 함께 가꾸는 작은 농장 마을</p>
    </div>
  );
}

export default function AuthScreen() {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const local = backend().kind === 'local';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!email.includes('@')) return setMsg({ text: '이메일 주소를 다시 확인해 주세요.' });
    if (tab !== 'reset' && pw.length < 6) return setMsg({ text: '비밀번호는 6자 이상으로 정해 주세요.' });
    if (tab === 'signup' && pw !== pw2) return setMsg({ text: '비밀번호 확인이 일치하지 않아요.' });
    setBusy(true);
    play('click');
    try {
      if (tab === 'login') {
        const u = await backend().signIn(email.trim(), pw);
        await afterLogin(u);
      } else if (tab === 'signup') {
        const r = await backend().signUp(email.trim(), pw);
        if (r.needsConfirmation) {
          setMsg({ ok: true, text: '가입 완료! 이메일로 받은 인증 링크를 눌러 주세요. 인증 후 로그인할 수 있어요 💌' });
          setTab('login');
        } else {
          const u = await backend().getUser();
          if (u) await afterLogin(u);
        }
      } else {
        await backend().requestPasswordReset(email.trim());
        setMsg({ ok: true, text: local ? '체험 모드에서는 바로 새 비밀번호를 정할 수 있어요.' : '비밀번호 재설정 메일을 보냈어요! 메일함을 확인해 주세요 📮' });
      }
    } catch (err) {
      play('error');
      setMsg({ text: toKoreanError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TitleBackdrop>
      <div className="panel anim-pop relative z-10 w-full max-w-[400px] px-7 pb-6 pt-7">
        <GameLogo />
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(['login', 'signup'] as const).map((t) => (
            <button key={t} type="button" className={`btn ${tab === t ? 'btn-wood' : 'btn-cream'}`} onClick={() => { setTab(t); setMsg(null); }}>
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-sm">이메일
            <input className="input mt-1" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="farmer@example.com" data-testid="email" />
          </label>
          {tab !== 'reset' && (
            <label className="text-sm">비밀번호
              <input className="input mt-1" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6자 이상" data-testid="password" />
            </label>
          )}
          {tab === 'signup' && (
            <label className="text-sm">비밀번호 확인
              <input className="input mt-1" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="password2" />
            </label>
          )}
          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-[#e6f6d6] text-[#3f7a2e]' : 'bg-[#ffe4e4] text-[#b0404a]'}`} role="alert">{msg.text}</p>}
          <button className="btn mt-1 py-3 text-[15px]" disabled={busy} data-testid="auth-submit">
            {busy ? '잠시만요…' : tab === 'login' ? '마을로 들어가기 🌱' : tab === 'signup' ? '주민 등록하기 🏡' : '재설정 메일 보내기'}
          </button>
        </form>
        <div className="mt-3 text-center text-xs text-[#8a6a5a]">
          {tab === 'reset'
            ? <button className="underline" onClick={() => setTab('login')}>로그인으로 돌아가기</button>
            : <button className="underline" onClick={() => { setTab('reset'); setMsg(null); }}>비밀번호를 잊으셨나요?</button>}
        </div>
        {local && (
          <p className="mt-3 rounded-lg bg-[#fff1c8] px-3 py-2 text-[11px] leading-relaxed text-[#7a5a2e]">
            🧪 지금은 <b>체험 모드</b>예요 (서버 미연결). 데이터는 이 브라우저에만 저장되고, 같은 브라우저의 다른 탭끼리 함께 놀 수 있어요.
          </p>
        )}
      </div>
    </TitleBackdrop>
  );
}

export function RecoveryScreen() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await backend().updatePassword(pw);
      setDone(true);
      setMsg('새 비밀번호로 바꿨어요! 다시 로그인해 주세요.');
      await backend().signOut().catch(() => undefined);
      window.history.replaceState(null, '', '/');
    } catch (err) { setMsg(toKoreanError(err)); }
  };
  return (
    <TitleBackdrop>
      <div className="panel anim-pop z-10 w-full max-w-[380px] px-7 pb-6 pt-7">
        <GameLogo />
        <h2 className="mb-3 text-center text-lg">새 비밀번호 정하기 🔑</h2>
        {!done ? (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password" />
            <button className="btn py-3">비밀번호 바꾸기</button>
          </form>
        ) : (
          <button className="btn w-full py-3" onClick={() => resetToAuth()}>로그인하러 가기</button>
        )}
        {msg && <p className="mt-3 text-center text-sm">{msg}</p>}
      </div>
    </TitleBackdrop>
  );
}

export function SlotScreen() {
  const msg = useGame((s) => s.slotMessage);
  return (
    <TitleBackdrop>
      <div className="panel anim-pop z-10 w-full max-w-[420px] px-7 pb-6 pt-7 text-center">
        <GameLogo />
        <p className="mb-5 leading-relaxed">{msg}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn" onClick={async () => { const u = await backend().getUser(); if (u) await afterLogin(u); else resetToAuth(); }}>다시 시도</button>
          <button className="btn btn-wood" onClick={async () => { await backend().signOut(); resetToAuth(); }}>다른 계정으로 로그인</button>
        </div>
      </div>
    </TitleBackdrop>
  );
}
