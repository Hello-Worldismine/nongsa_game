import { useEffect, useState } from 'react';
import { play } from '@/audio/sfx';
import { CharacterPreview } from '@/components/ui';
import {
  DEFAULT_APPEARANCE, HAIR_COLORS, HAIR_STYLES, NICKNAME_RE, OUTFIT_COLORS, OUTFIT_STYLES, SKIN_TONES,
  type Appearance,
} from '@/config/appearance';
import { TitleBackdrop } from '@/features/auth/AuthScreen';
import { enterVillage, logout, startGame } from '@/features/game/boot';
import { useGame } from '@/stores/gameStore';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';

const NICK_IDEAS = ['토끼농부', '감자왕', '딸기소녀', '당근요정', '옥수수맨', '호박공주', '새싹이', '수박대장', '고구마짱', '햇살농부'];

function Swatches({ colors, value, onChange, label }: { colors: { name: string; base: string }[]; value: number; onChange: (i: number) => void; label: string }) {
  return (
    <div>
      <div className="mb-1 text-xs text-[#8a6a5a]">{label}: <b className="text-[#5a3a2e]">{colors[value].name}</b></div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((c, i) => (
          <button key={c.name} type="button" title={c.name} aria-label={`${label} ${c.name}`}
            className={`h-7 w-7 rounded-lg border-2 transition ${value === i ? 'scale-110 border-[#5a3a2e] shadow-[0_0_0_2px_#fff]' : 'border-[#c9a274]'}`}
            style={{ background: c.base }} onClick={() => { play('click'); onChange(i); }} />
        ))}
      </div>
    </div>
  );
}

function Chooser({ items, value, onChange, label }: { items: string[]; value: number; onChange: (i: number) => void; label: string }) {
  const step = (d: number) => { play('click'); onChange((value + d + items.length) % items.length); };
  return (
    <div>
      <div className="mb-1 text-xs text-[#8a6a5a]">{label}</div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-cream btn-sm !px-2.5" onClick={() => step(-1)} aria-label={`이전 ${label}`}>◀</button>
        <div className="card flex-1 py-1.5 text-center text-sm">{items[value]}</div>
        <button type="button" className="btn btn-cream btn-sm !px-2.5" onClick={() => step(1)} aria-label={`다음 ${label}`}>▶</button>
      </div>
    </div>
  );
}

export default function CharacterScreen() {
  const [app, setApp] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [nick, setNick] = useState('');
  const [isNew, setIsNew] = useState(true);
  const [dir, setDir] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const editing = useGame((s) => s.editingCharacter);

  useEffect(() => {
    let cancelled = false;
    backend().getMyCharacter().then((c) => {
      if (cancelled) return;
      if (c) { setApp(c.appearance); setNick(c.nickname); setIsNew(false); }
      else setNick(NICK_IDEAS[Math.floor(Math.random() * NICK_IDEAS.length)]);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { const t = setInterval(() => setDir((d) => (d + 1) % 4), 2400); return () => clearInterval(t); }, []);

  const set = (k: keyof Appearance) => (v: number) => setApp((a) => ({ ...a, [k]: v }));
  const randomize = () => {
    play('pop');
    setApp({
      hair: Math.floor(Math.random() * HAIR_STYLES.length), hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      skin: Math.floor(Math.random() * SKIN_TONES.length), outfit: Math.floor(Math.random() * OUTFIT_STYLES.length),
      outfitColor: Math.floor(Math.random() * OUTFIT_COLORS.length),
    });
  };
  const start = async () => {
    setErr(null);
    if (!NICKNAME_RE.test(nick.trim())) { play('error'); setErr('닉네임은 2~10자의 한글/영문/숫자로 정해 주세요.'); return; }
    setBusy(true);
    play('click');
    try { await startGame(nick.trim(), app); } catch (e) { play('error'); setErr(toKoreanError(e)); setBusy(false); }
  };

  if (!loaded) return <TitleBackdrop><div className="panel px-8 py-6">캐릭터를 불러오는 중…</div></TitleBackdrop>;

  return (
    <TitleBackdrop>
      <div className="panel anim-pop z-10 w-full max-w-[760px] px-6 pb-6 pt-8">
        <div className="panel-title absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap px-5 py-2 text-[15px]">
          오늘은 어떤 모습으로 농사를 지어볼까요?
        </div>
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-3 md:w-[260px]">
            <div className="relative flex h-[230px] w-[230px] items-end justify-center overflow-hidden rounded-2xl border-[3px] border-[#c9a274]"
              style={{ background: 'radial-gradient(circle at 50% 85%, #bfe3a0 0 30%, #d9f0c4 31% 45%, #f4fbe8 46%)' }}>
              <div className="absolute bottom-6 h-3 w-24 rounded-[50%] bg-[#4a3036]/15" />
              <CharacterPreview appearance={app} scale={8} dir={dir} className="relative mb-7" />
            </div>
            <div className="flex gap-1">
              {['정면', '왼쪽', '오른쪽', '뒤'].map((d, i) => (
                <button key={d} className={`btn btn-sm ${dir === i ? 'btn-wood' : 'btn-cream'}`} onClick={() => setDir(i)}>{d}</button>
              ))}
            </div>
            <button className="btn btn-pink btn-sm" onClick={randomize}>🎲 랜덤으로 꾸미기</button>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <label className="text-sm">닉네임 <span className="text-xs text-[#8a6a5a]">(2~10자, 한글/영문/숫자)</span>
              <input className="input mt-1" value={nick} maxLength={10} onChange={(e) => setNick(e.target.value)} data-testid="nickname" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Chooser label="헤어스타일" items={HAIR_STYLES} value={app.hair} onChange={set('hair')} />
              <Chooser label="의상" items={OUTFIT_STYLES} value={app.outfit} onChange={set('outfit')} />
            </div>
            <Swatches label="머리 색" colors={HAIR_COLORS} value={app.hairColor} onChange={set('hairColor')} />
            <Swatches label="피부색" colors={SKIN_TONES} value={app.skin} onChange={set('skin')} />
            <Swatches label="옷 색" colors={OUTFIT_COLORS} value={app.outfitColor} onChange={set('outfitColor')} />
            {err && <p className="rounded-lg bg-[#ffe4e4] px-3 py-2 text-sm text-[#b0404a]" role="alert">{err}</p>}
            <div className="mt-1 flex items-center justify-between gap-2">
              {editing
                ? <button className="btn btn-cream btn-sm" onClick={() => enterVillage()} disabled={busy}>취소하고 마을로</button>
                : <button className="btn btn-cream btn-sm" onClick={() => logout()}>로그아웃</button>}
              <button className="btn px-8 py-3 text-base" onClick={start} disabled={busy} data-testid="start-game">
                {busy ? '준비 중…' : editing ? '저장하고 마을로 돌아가기 🌱' : isNew ? '게임 시작! 🌱' : '이 모습으로 게임 시작! 🌱'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </TitleBackdrop>
  );
}
