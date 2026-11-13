import { PixelIcon } from '@/components/ui';
import { bestRod, ROD_MAP } from '@/config/shop';
import { useGame } from '@/stores/gameStore';

/** 남은 횟수 체력바 (초록 → 노랑 → 빨강) */
export function UsesBar({ left, max, className = '' }: { left: number; max: number; className?: string }) {
  const ratio = Math.max(0, Math.min(1, left / Math.max(1, max)));
  const color = ratio > 0.5 ? '#6fcf4a' : ratio > 0.2 ? '#f2c23a' : '#ef5a5a';
  return (
    <div className={`h-[6px] overflow-hidden rounded-full border border-[#5a3a2e] bg-[#5a3a2e]/25 ${className}`} role="meter" aria-valuenow={left} aria-valuemax={max}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${ratio * 100}%`, background: color, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }} />
    </div>
  );
}

/** 가방/상점용: 이 낚싯대의 남은 횟수 */
export function useRodLeft(rodId: string) {
  const inv = useGame((s) => s.inventory[rodId] ?? 0);
  const left = useGame((s) => s.rodUses[rodId]);
  const def = ROD_MAP[rodId];
  if (!def || inv <= 0) return null;
  return { left: left ?? def.uses, max: def.uses };
}

/** 퀵슬롯 옆: 지금 쓰는 낚싯대 + 체력바 */
export function RodGauge() {
  const inv = useGame((s) => s.inventory);
  const uses = useGame((s) => s.rodUses);
  const rod = bestRod(inv);
  if (!rod) return null;
  const left = uses[rod.id] ?? rod.uses;
  return (
    <div className="panel-soft flex w-[76px] flex-col items-center gap-0.5 p-1.5 max-sm:w-[58px] max-sm:p-1" title={`${rod.name} · 남은 ${left}/${rod.uses}회 (낚거나 놓칠 때 1회)`} data-testid="rod-gauge">
      <PixelIcon id={rod.id} size={26} />
      <UsesBar left={left} max={rod.uses} className="w-full" />
      <span className="text-[10px] leading-none text-[#5a3a2e]" data-testid="rod-left">{left}/{rod.uses}</span>
    </div>
  );
}
