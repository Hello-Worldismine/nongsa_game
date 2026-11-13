import { play } from '@/audio/sfx';
import { Gold, Modal, PixelIcon } from '@/components/ui';
import { houseOwnerOf } from '@/config/game';
import { FURNITURE, FURNITURE_COLORS, furnItemId, FURN_MAP, HOUSE_LEVELS, HOUSE_MAX_ITEMS, MAX_HOUSE_LEVEL } from '@/config/shop';
import { expandHouse, pickFurniture, setHouseEdit, storeFurniture } from '@/features/game/actions';
import { useGame } from '@/stores/gameStore';

/** 집 안 오른쪽 패널: 꾸미기 모드 / 가방 속 가구 / 집 넓히기 */
export function HousePanel() {
  const space = useGame((s) => s.space);
  const me = useGame((s) => s.profile?.id);
  const house = useGame((s) => s.viewHouse);
  const edit = useGame((s) => s.houseEdit);
  const placing = useGame((s) => s.housePlacing);
  const inv = useGame((s) => s.inventory);
  const busy = useGame((s) => s.busy);
  const set = useGame((s) => s.set);
  const open = useGame((s) => s.openModal);
  const owner = houseOwnerOf(space);
  if (!owner || !house) return null;
  if (owner !== me) {
    return (
      <div className="panel-soft pointer-events-auto absolute right-3 top-[120px] px-3 py-2 text-xs max-sm:top-[60px]" data-testid="house-visit">
        🏠 <b>{house.ownerNickname}</b>님의 집 · 가구 {house.items.length}개
      </div>
    );
  }
  const furnInBag = FURNITURE.flatMap((f) => FURNITURE_COLORS.map((_, i) => furnItemId(f.id, i))).filter((id) => (inv[id] ?? 0) > 0);
  const placingDef = placing ? FURN_MAP[placing.furnId] : null;
  return (
    <div className="panel-soft pointer-events-auto absolute right-3 top-[120px] flex w-[248px] flex-col gap-2 p-2.5 text-sm max-sm:top-[60px] max-sm:w-[200px]" data-testid="house-panel">
      <div className="flex gap-1.5">
        <button className={`btn btn-sm flex-1 ${edit ? 'btn-pink' : ''}`} onClick={() => setHouseEdit(!edit)} data-testid="house-edit-toggle">
          {edit ? '✅ 꾸미기 끝' : '🛋️ 꾸미기'}
        </button>
        <button className="btn btn-gold btn-sm" onClick={() => { play('click'); open('houseExpand'); }} data-testid="btn-house-expand">🏠 넓히기</button>
      </div>
      <div className="text-[11px] text-[#8a6a5a]">{house.w}×{house.h}칸 · 가구 {house.items.length}/{HOUSE_MAX_ITEMS}</div>
      {edit && (
        <>
          {placing && placingDef ? (
            <div className="card flex flex-col gap-1.5 p-2" data-testid="house-placing">
              <div className="flex items-center gap-2">
                <PixelIcon id={furnItemId(placing.furnId, placing.color)} size={32} />
                <div className="text-xs leading-snug">
                  <b>{FURNITURE_COLORS[placing.color].name} {placingDef.name}</b><br />
                  {placing.moveId ? '옮길 칸을 클릭하거나 E' : '놓을 칸을 클릭하거나 E'}
                </div>
              </div>
              <div className="flex gap-1.5">
                {placing.moveId && (
                  <button className="btn btn-sky btn-sm flex-1" disabled={busy} onClick={() => storeFurniture(placing.moveId!)} data-testid="house-store">📦 가방에 넣기</button>
                )}
                <button className="btn btn-cream btn-sm flex-1" onClick={() => { play('close'); set({ housePlacing: null }); }} data-testid="house-cancel">취소</button>
              </div>
            </div>
          ) : (
            <div className="text-[11px] leading-relaxed text-[#7a5444]">놓인 가구를 클릭하면 옮기거나 가방에 넣을 수 있어요. 아래에서 새 가구를 골라요!</div>
          )}
          <div className="text-[11px] text-[#8a6a5a]">🎒 가방 속 가구</div>
          {furnInBag.length ? (
            <div className="scroll-cute grid max-h-[180px] grid-cols-5 gap-1 overflow-y-auto">
              {furnInBag.map((id) => {
                const [, type, c] = id.split(':');
                const active = placing && !placing.moveId && placing.furnId === `furn:${type}` && placing.color === Number(c);
                return (
                  <button key={id} className={`slot relative flex aspect-square items-center justify-center ${active ? '!border-[#5a9a3a] !bg-[#e4f6cf]' : ''}`}
                    title={`${FURNITURE_COLORS[Number(c)].name} ${FURN_MAP[`furn:${type}`]?.name}`}
                    onClick={() => pickFurniture(`furn:${type}`, Number(c))} data-testid={`house-furn-${type}-${c}`}>
                    <PixelIcon id={id} size={30} />
                    <span className="absolute bottom-0 right-0.5 text-[10px]" style={{ textShadow: '0 0 2px #fff, 0 0 2px #fff' }}>{inv[id]}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-[#8a6a5a]">가방에 가구가 없어요. 마을 씨앗 상점의 <b>가구</b> 코너에서 사 오세요!</div>
          )}
          <div className="text-[10px] leading-relaxed text-[#a08070]">러그·방석은 밟고 지나갈 수 있고, 위에 다른 가구도 올릴 수 있어요. 문 앞 칸은 비워 둬요.</div>
        </>
      )}
    </div>
  );
}

export function HouseExpandModal({ onClose }: { onClose: () => void }) {
  const house = useGame((s) => s.viewHouse);
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const busy = useGame((s) => s.busy);
  if (!house) return null;
  const next = HOUSE_LEVELS.find((l) => l.level === house.level + 1);
  const enough = next ? gold >= next.cost : false;
  return (
    <Modal title="집 넓히기" onClose={onClose} width={520}>
      <div className="text-sm leading-relaxed">
        <div className="mb-2 text-base">지금 <b>{house.level}단계</b> · 바닥 {house.w}×{house.h}칸</div>
        {next ? (
          <>
            <div className="card mb-3 p-3">
              <div>다음 단계: <b>{next.level}단계 · {next.w}×{next.h}칸</b></div>
              <div>필요한 골드: <Gold value={next.cost} className="text-[#8a5a1e]" /></div>
              <div>내 골드: <Gold value={gold} className={enough ? 'text-[#4f8a3a]' : 'text-[#c0404a]'} /></div>
              {!enough && <div className="mt-1 text-xs text-[#c0404a]">{(next.cost - gold).toLocaleString()}G가 더 필요해요!</div>}
            </div>
            <p className="mb-3 text-xs text-[#8a6a5a]">이미 놓은 가구는 그 자리에 그대로 있어요. 넓어진 곳에 가구를 더 놓아 보세요!</p>
            <button className="btn btn-gold w-full py-3 text-base" disabled={!enough || busy} onClick={() => expandHouse()} data-testid="house-expand-btn">
              🏠 {next.cost.toLocaleString()}G로 넓히기
            </button>
          </>
        ) : (
          <div className="card p-4 text-center">🎉 최고 단계({MAX_HOUSE_LEVEL}단계)까지 넓혔어요! 정말 멋진 집이에요.</div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1.5 text-center text-[11px]">
        {HOUSE_LEVELS.map((l) => (
          <div key={l.level} className={`slot py-1 ${l.level <= house.level ? '!bg-[#e4f6cf] !border-[#7cc455]' : ''}`}>
            <div>{l.w}×{l.h}</div>
            <div className="text-[#8a5a1e]">{l.cost ? `${l.cost.toLocaleString()}G` : '무료'}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
