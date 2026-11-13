import { useEffect, useRef, useState } from 'react';
import { play } from '@/audio/sfx';
import { Gold, Modal } from '@/components/ui';
import { CASINO } from '@/config/fruit';
import { casinoJoin, casinoLeave, casinoReady, syncGold } from '@/features/game/actions';
import { bus } from '@/game/bus';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { CasinoBet, CasinoState } from '@/types';

const COLORS = ['#ff8fab', '#7fb8e6', '#8fcf6a', '#f2d266', '#b39ae0', '#e6735c', '#7fd1bf', '#d8a06a'];

/** 건 금액 비율만큼의 조각으로 나뉜 룰렛 (위쪽 바늘이 가리키는 사람이 당첨) */
function Wheel({ bets, rotation, spinning }: { bets: CasinoBet[]; rotation: number; spinning: boolean }) {
  const total = bets.reduce((a, b) => a + b.amount, 0);
  const R = 92, C = 100;
  let start = 0;
  const pt = (deg: number) => [C + R * Math.sin((deg * Math.PI) / 180), C - R * Math.cos((deg * Math.PI) / 180)];
  return (
    <svg viewBox="0 0 200 212" className="h-[230px] w-[218px] select-none" data-testid="casino-wheel">
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '100px 100px', transition: spinning ? `transform ${CASINO.spinMs}ms cubic-bezier(.12,.62,.08,1)` : 'none' }}>
        <circle cx={C} cy={C} r={R + 5} fill="#8a5a3e" />
        {total === 0 && <circle cx={C} cy={C} r={R} fill="#f6e6c6" />}
        {bets.length === 1 && <circle cx={C} cy={C} r={R} fill={COLORS[0]} />}
        {bets.length > 1 && bets.map((b, i) => {
          const sweep = (b.amount / total) * 360;
          const [x1, y1] = pt(start), [x2, y2] = pt(start + sweep);
          const mid = start + sweep / 2;
          const [tx, ty] = [C + R * 0.62 * Math.sin((mid * Math.PI) / 180), C - R * 0.62 * Math.cos((mid * Math.PI) / 180)];
          const d = `M${C},${C} L${x1},${y1} A${R},${R} 0 ${sweep > 180 ? 1 : 0} 1 ${x2},${y2} Z`;
          start += sweep;
          return (
            <g key={b.playerId}>
              <path d={d} fill={COLORS[i % COLORS.length]} stroke="#fffaf0" strokeWidth="2" />
              {sweep > 22 && <text x={tx} y={ty} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="#4a3036" transform={`rotate(${mid} ${tx} ${ty})`}>{b.nickname}</text>}
            </g>
          );
        })}
        <circle cx={C} cy={C} r="13" fill="#fff6e0" stroke="#8a5a3e" strokeWidth="3" />
        <text x={C} y={C + 1} fontSize="12" textAnchor="middle" dominantBaseline="middle">⭐</text>
      </g>
      {/* 바늘 */}
      <polygon points="100,18 90,0 110,0" fill="#e8506a" stroke="#7a3040" strokeWidth="2" />
    </svg>
  );
}

export function CasinoModal({ onClose }: { onClose: () => void }) {
  const me = useGame((s) => s.profile?.id);
  const myGold = useGame((s) => s.profile?.gold ?? 0);
  const toast = useGame((s) => s.toast);
  const [state, setState] = useState<CasinoState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'round' | 'spin' | 'result'>('round');
  const [spinData, setSpinData] = useState<CasinoState['last']>(null);
  const [rotation, setRotation] = useState(0);
  const lastSeen = useRef<number | null>(null);
  const spinning = useRef(false);
  const latestGold = useRef<number | null>(null);

  const handle = (s: CasinoState) => {
    setState(s);
    latestGold.current = s.gold;
    if (lastSeen.current === null) { lastSeen.current = s.last?.id ?? 0; syncGold(s.gold); return; } // 열기 전 결과는 다시 돌리지 않음
    if (s.last && s.last.id > lastSeen.current) {
      // 새 추첨 결과 → 모두의 화면에서 같은 룰렛이 돌아서 당첨자에게 멈춤
      const result = s.last;
      lastSeen.current = result.id;
      spinning.current = true;
      setSpinData(result);
      setView('spin');
      setRotation((r) => Math.ceil(r / 360) * 360 + 360 * 6 + (360 - result.roll * 360));
      play('open');
      setTimeout(() => {
        spinning.current = false;
        setView('result');
        if (latestGold.current !== null) syncGold(latestGold.current);
        const joined = result.bets.some((b) => b.playerId === me);
        if (result.winnerId === me) { play('quest'); toast(`🎉 축하해요! 판돈 ${result.pot.toLocaleString()}G를 모두 가져왔어요!`, 'gold'); }
        else if (joined) { play('close'); toast(`아쉬워요! 이번 판은 ${result.winnerNickname}님이 ${result.pot.toLocaleString()}G를 가져갔어요.`); }
        else toast(`${result.winnerNickname}님이 ${result.pot.toLocaleString()}G를 가져갔어요! 🎰`);
      }, CASINO.spinMs + 200);
    } else if (!spinning.current) syncGold(s.gold);
  };

  const load = () => backend().casinoState().then((s) => { handle(s); setErr(null); }).catch((e) => setErr(toKoreanError(e)));
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 2500);
    const off = bus.on('casino:changed', () => { void load(); });
    return () => { clearInterval(t); off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<CasinoState | null>) => {
    if (busy || spinning.current) return;
    setBusy(true);
    const s = await fn();
    if (s) handle(s);
    setBusy(false);
  };

  const round = state?.round;
  const myBet = round?.bets.find((b) => b.playerId === me);
  const wheelBets = view === 'round' ? round?.bets ?? [] : spinData?.bets ?? [];
  const pot = view === 'round' ? round?.pot ?? 0 : spinData?.pot ?? 0;
  const maxAmount = Math.min(CASINO.maxBet, myGold);
  const stake = round?.stake ?? null;
  const full = (round?.bets.length ?? 0) >= CASINO.maxPlayers;
  const lock = busy || view === 'spin';

  return (
    <Modal title="햇살 카지노" onClose={onClose} width={760}
      footer={<p className="text-center text-[11px] text-[#8a6a5a]">🎲 게임 속 골드로만 즐기는 놀이예요. 판을 연 사람이 정한 참가비로 모두 똑같이 걸고, 당첨 확률도 모두 같아요. 2명 이상이 모두 "준비 완료"를 누르면 룰렛이 돌아가요. 준비하지 않은 채 5분이 지나면 자동으로 환불돼요.</p>}>
      {err && <p className="mb-2 text-center text-sm text-[#c0404a]">{err}</p>}
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <div className="flex flex-col items-center">
          <Wheel bets={wheelBets} rotation={rotation} spinning={view === 'spin'} />
          <div className="mt-1 text-sm">판돈 <Gold value={pot} className="text-[#8a5a1e]" /></div>
          {view === 'spin' && <div className="mt-1 animate-pulse text-sm text-[#b06a9a]" data-testid="casino-spinning">두근두근… 룰렛이 돌아가요! 🎰</div>}
          {view === 'result' && spinData && (
            <div className="mt-2 text-center text-sm" data-testid="casino-result">
              🎉 <b>{spinData.winnerNickname}</b>님이 <b>{spinData.pot.toLocaleString()}G</b>를 가져갔어요!
              <div><button className="mt-1 text-xs underline" onClick={() => setView('round')}>다음 판 보기</button></div>
            </div>
          )}
        </div>

        <div className="w-full flex-1">
          <div className="mb-1.5 text-sm">🎟️ 이번 판 참가자 ({round?.bets.length ?? 0}/{CASINO.maxPlayers})</div>
          <div className="card mb-3 min-h-[92px] p-2" data-testid="casino-bets">
            {!round?.bets.length && <div className="p-3 text-center text-xs text-[#8a6a5a]">아직 아무도 걸지 않았어요. 첫 번째로 참가해 보세요!</div>}
            {round?.bets.map((b, i) => (
              <div key={b.playerId} className="flex items-center gap-2 px-1 py-1 text-sm">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1 truncate">{b.nickname}{b.playerId === me && ' (나)'}</span>
                <span className="text-[#8a5a1e]">{b.amount.toLocaleString()}G</span>
                <span className="w-12 text-right text-xs text-[#8a6a5a]">{Math.round(100 / round.bets.length)}%</span>
                <span className="w-14 text-right text-xs">{b.ready ? '✅ 준비' : '⏳ 대기'}</span>
              </div>
            ))}
          </div>

          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>내 골드 <Gold value={myGold} className="text-[#8a5a1e]" /></span>
              {stake !== null && <span className="text-sm" data-testid="casino-stake">이번 판 참가비 <b className="text-[#8a5a1e]">{stake.toLocaleString()}G</b></span>}
            </div>

            {stake === null && (
              <>
                <p className="mb-2 text-xs text-[#8a6a5a]">🪧 지금은 빈 판이에요. 참가비를 정해서 판을 열면 마을 채팅으로 참가자를 모집해요!</p>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <input className="input !w-28 !py-1.5 text-sm" inputMode="numeric" value={amount} data-testid="casino-amount"
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setAmount(Number.isNaN(n) ? 0 : n); }} />
                  {[10, 100, 1000].map((v) => <button key={v} className="btn btn-cream btn-sm" onClick={() => setAmount((a) => Math.min(maxAmount, a + v))}>+{v}</button>)}
                  <button className="btn btn-cream btn-sm" onClick={() => setAmount(CASINO.minBet)}>초기화</button>
                </div>
                <button className="btn btn-gold" disabled={lock || amount < CASINO.minBet || amount > maxAmount} onClick={() => run(() => casinoJoin(amount))} data-testid="casino-open">
                  🎰 {amount.toLocaleString()}G로 판 열고 모집하기
                </button>
              </>
            )}

            {stake !== null && !myBet && (
              <button className="btn btn-gold" disabled={lock || full || myGold < stake} onClick={() => run(() => casinoJoin(stake))} data-testid="casino-join">
                🪙 {stake.toLocaleString()}G 내고 참가하기
              </button>
            )}
            {stake !== null && !myBet && myGold < stake && <p className="mt-1 text-[11px] text-[#c0404a]">골드가 부족해요.</p>}
            {stake !== null && !myBet && full && <p className="mt-1 text-[11px] text-[#c0404a]">자리가 다 찼어요. 다음 판을 기다려 주세요!</p>}

            {myBet && (
              <div className="flex flex-wrap gap-2">
                <button className={`btn ${myBet.ready ? 'btn-cream' : ''}`} disabled={lock} onClick={() => run(() => casinoReady(!myBet.ready))} data-testid="casino-ready">
                  {myBet.ready ? '준비 취소' : '✅ 준비 완료'}
                </button>
                <button className="btn btn-pink" disabled={lock} onClick={() => run(() => casinoLeave())} data-testid="casino-leave">나가기 (환불)</button>
              </div>
            )}
            {myBet && !myBet.ready && <p className="mt-2 text-[11px] text-[#8a6a5a]">새 사람이 들어오거나 누가 나가면 모두의 준비가 풀려요. 다시 "준비 완료"를 눌러 주세요!</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
