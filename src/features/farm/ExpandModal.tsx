import { useEffect } from 'react';
import { Gold, Modal } from '@/components/ui';
import { FARM_LEVELS, MAX_FARM_LEVEL } from '@/config/farm';
import { farmOwnerOf } from '@/config/game';
import { expandFarm } from '@/features/game/actions';
import { nextExpansion } from '@/features/economy/rules';
import { bus } from '@/game/bus';
import { useGame } from '@/stores/gameStore';

function Grid({ size, next }: { size: number; next: number }) {
  const n = Math.max(size, next);
  return (
    <div className="inline-grid gap-[3px] rounded-lg border-[3px] border-[#a8744a] bg-[#a8d973] p-1.5" style={{ gridTemplateColumns: `repeat(${n}, 14px)` }}>
      {Array.from({ length: n * n }, (_, i) => {
        const x = i % n, y = Math.floor(i / n);
        const owned = x < size && y < size;
        return <div key={i} className={`h-[14px] w-[14px] rounded-[3px] ${owned ? 'bg-[#b07a4e]' : 'anim-bob bg-[#ffd84a]/80'}`} style={owned ? undefined : { animationDelay: `${(x + y) * 0.05}s` }} />;
      })}
    </div>
  );
}

export function ExpandModal({ onClose }: { onClose: () => void }) {
  const myFarm = useGame((s) => s.myFarm);
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const busy = useGame((s) => s.busy);
  const space = useGame((s) => s.space);
  const me = useGame((s) => s.profile?.id);
  const viewFarm = useGame((s) => s.viewFarm);
  const isOwnerHere = farmOwnerOf(space) === me;
  const visiting = farmOwnerOf(space) && !isOwnerHere;
  const farm = visiting ? viewFarm : myFarm;
  const next = farm ? nextExpansion(farm.level) : null;

  // 확장 전 미리보기 (농장 안에서 새로 생길 칸에 말뚝 표시)
  useEffect(() => {
    if (isOwnerHere && next) bus.emit('expand:preview', { size: next.size });
    return () => bus.emit('expand:preview', { size: null });
  }, [isOwnerHere, next]);

  if (!farm) return null;
  if (visiting) {
    return (
      <Modal title="농장 확장 안내판" onClose={onClose} width={420}>
        <p className="py-4 text-center text-sm">{farm.ownerNickname}님의 농장은 지금 <b>{farm.size}×{farm.size}</b> ({farm.level}단계)예요! 🌾<br />농장 확장은 주인만 할 수 있어요.</p>
      </Modal>
    );
  }
  const enough = next ? gold >= next.cost : false;
  return (
    <Modal title="농장 확장" onClose={onClose} width={560}>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <Grid size={farm.size} next={next?.size ?? farm.size} />
          <div className="text-xs text-[#8a6a5a]">갈색: 지금 밭 · 노란색: 새로 생길 밭</div>
        </div>
        <div className="flex-1 text-sm leading-relaxed">
          <div className="mb-2 text-base">현재 <b>{farm.level}단계</b> · {farm.size}×{farm.size} 밭</div>
          {next ? (
            <>
              <div className="card mb-3 p-3">
                <div>다음 단계: <b>{next.level}단계 · {next.size}×{next.size}</b></div>
                <div>필요한 골드: <Gold value={next.cost} className="text-[#8a5a1e]" /></div>
                <div>내 골드: <Gold value={gold} className={enough ? 'text-[#4f8a3a]' : 'text-[#c0404a]'} /></div>
                {!enough && <div className="mt-1 text-xs text-[#c0404a]">{(next.cost - gold).toLocaleString()}G가 더 필요해요!</div>}
              </div>
              <p className="mb-3 text-xs text-[#8a6a5a]">이미 심은 작물은 그대로 자라요. {isOwnerHere ? '농장에 노란 말뚝으로 새 밭 위치를 표시했어요!' : '내 농장에서 확장하면 새 밭이 생기는 모습을 볼 수 있어요!'}</p>
              <button className="btn btn-gold w-full py-3 text-base" disabled={!enough || busy} onClick={() => expandFarm()} data-testid="expand-btn">
                🧱 {next.cost.toLocaleString()}G로 확장하기
              </button>
            </>
          ) : (
            <div className="card p-4 text-center">🎉 최고 단계({MAX_FARM_LEVEL}단계, 10×10)까지 확장했어요! 멋진 농장이에요.</div>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1.5 text-center text-[11px] sm:grid-cols-8">
        {FARM_LEVELS.map((l) => (
          <div key={l.level} className={`slot py-1 ${l.level <= farm.level ? '!bg-[#e4f6cf] !border-[#7cc455]' : ''}`}>
            <div>{l.size}×{l.size}</div>
            <div className="text-[#8a5a1e]">{l.cost ? `${l.cost >= 1000 ? `${l.cost / 1000}k` : l.cost}G` : '무료'}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
