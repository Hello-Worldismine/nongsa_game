import { useEffect, useState } from 'react';
import { Modal, PixelIcon, QtyPicker } from '@/components/ui';
import { CROPS, cropItemId, seedItemId } from '@/config/crops';
import { moveStorage } from '@/features/game/actions';
import { itemInfo } from '@/features/inventory/Inventory';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { Inventory, StorageView } from '@/types';

/** 씨앗 → 작물 순서로 정렬된 보관 가능 아이템 목록 */
const ORDER = [...CROPS.map((c) => seedItemId(c.id)), ...CROPS.map((c) => cropItemId(c.id))];
const listOf = (inv: Inventory) => ORDER.filter((id) => (inv[id] ?? 0) > 0);

export function timeAgo(ms: number) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function ItemRow({ id, count, action, onAction, testId }: {
  id: string; count: number; action?: string; onAction?: (qty: number) => void; testId?: string;
}) {
  const busy = useGame((s) => s.busy);
  const [qty, setQty] = useState(count);
  const q = Math.min(Math.max(1, qty), count);
  return (
    <div className="card flex items-center gap-2 p-2" data-testid={testId}>
      <div className="slot flex h-10 w-10 shrink-0 items-center justify-center"><PixelIcon id={id} size={28} /></div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate">{itemInfo(id).name}</div>
        <div className="text-xs text-[#8a6a5a]">× {count}</div>
      </div>
      {action && onAction && (
        <>
          <QtyPicker value={q} onChange={setQty} max={count} />
          <button className="btn btn-sm min-w-[52px]" disabled={busy} onClick={() => onAction(q)}>{action}</button>
        </>
      )}
    </div>
  );
}

export function StorageModal({ onClose, ownerId }: { onClose: () => void; ownerId: string }) {
  const me = useGame((s) => s.profile?.id);
  const inv = useGame((s) => s.inventory);
  const [view, setView] = useState<StorageView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isOwner = ownerId === me;

  const load = () => backend().getStorage(ownerId).then(setView).catch((e) => setErr(toKoreanError(e)));
  useEffect(() => { void load(); }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (dir: 'deposit' | 'withdraw', id: string, qty: number) => {
    const storage = await moveStorage(dir, id, qty);
    if (storage) void load(); // 새 내용 + 기록 다시 불러오기
  };

  const stored = view ? listOf(view.items) : [];
  const bag = listOf(inv);
  const total = stored.reduce((a, id) => a + (view?.items[id] ?? 0), 0);

  return (
    <Modal title={isOwner ? '내 보관함' : `${view?.ownerNickname ?? ''}님의 보관함`} icon="icon_crop_corn" onClose={onClose} width={isOwner ? 780 : 480}>
      <p className="mb-3 text-center text-xs text-[#8a6a5a]">
        {isOwner
          ? '남는 씨앗과 작물을 넣어 두는 상자예요. 판매는 마을의 농산물 판매소에서 할 수 있어요! 다른 주민도 놀러 와서 구경할 수 있어요.'
          : '주인만 넣고 뺄 수 있어요. 무엇을 모아 두었는지 구경해 보세요! 👀'}
      </p>
      {err && <p className="mb-2 text-center text-sm text-[#c0404a]">{err}</p>}
      {!view && !err && <p className="py-6 text-center text-sm">보관함을 여는 중…</p>}
      {view && (
        <div className={`grid gap-4 ${isOwner ? 'md:grid-cols-2' : ''}`}>
          {isOwner && (
            <section>
              <div className="mb-1.5 text-sm">🎒 내 가방</div>
              <div className="scroll-cute flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto pr-1" data-testid="storage-bag">
                {bag.length === 0 && <div className="card p-4 text-center text-xs text-[#8a6a5a]">넣을 씨앗이나 작물이 없어요.</div>}
                {bag.map((id) => <ItemRow key={`b-${id}-${inv[id]}`} id={id} count={inv[id]} action="넣기" onAction={(q) => move('deposit', id, q)} testId={`deposit-${id}`} />)}
              </div>
            </section>
          )}
          <section>
            <div className="mb-1.5 flex items-center justify-between text-sm"><span>📦 보관함</span><span className="text-xs text-[#8a6a5a]">총 {total.toLocaleString()}개</span></div>
            <div className="scroll-cute flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto pr-1" data-testid="storage-box">
              {stored.length === 0 && <div className="card p-4 text-center text-xs text-[#8a6a5a]">아직 비어 있어요.</div>}
              {stored.map((id) => (
                <ItemRow key={`s-${id}-${view.items[id]}`} id={id} count={view.items[id]}
                  action={isOwner ? '꺼내기' : undefined} onAction={isOwner ? (q) => move('withdraw', id, q) : undefined} testId={`stored-${id}`} />
              ))}
            </div>
          </section>
        </div>
      )}
      {view && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-[#8a6a5a]">📝 최근 기록</div>
          <div className="card scroll-cute max-h-[120px] overflow-y-auto px-3 py-2 text-xs leading-relaxed" data-testid="storage-log">
            {view.recent.length === 0 && <div className="text-[#8a6a5a]">아직 기록이 없어요.</div>}
            {view.recent.map((r, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span>{r.kind === 'deposit' ? '📥' : '📤'} {itemInfo(r.itemId).name} {r.qty}개를 {r.kind === 'deposit' ? '넣었어요' : '꺼냈어요'}</span>
                <span className="shrink-0 text-[#a08070]">{timeAgo(r.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
