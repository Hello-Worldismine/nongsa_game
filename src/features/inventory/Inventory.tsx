import { useState } from 'react';
import { play } from '@/audio/sfx';
import { Modal, PixelIcon } from '@/components/ui';
import { houseOwnerOf } from '@/config/game';
import { CROP_MAP, CROPS, cropItemId, formatDuration, seedItemId } from '@/config/crops';
import {
  FERT_MAP, FERTILIZERS, FISH, FISH_MAP, fishItemId, FURNITURE, FURNITURE_COLORS, furnItemId, parseFurnItem, ROD_MAP, RODS,
} from '@/config/shop';
import { pickFurniture } from '@/features/game/actions';
import { useGame } from '@/stores/gameStore';
import { RodGauge, UsesBar } from './RodGauge';

export const TOOL_NAMES: Record<string, { name: string; desc: string }> = {
  'tool:hoe': { name: '호미', desc: '밭을 일구는 든든한 호미예요.' },
  'tool:watering_can': { name: '물뿌리개', desc: '햇살마을엔 비가 자주 와서 물은 자동으로 줘요!' },
  'tool:basket': { name: '바구니', desc: '수확한 작물을 담는 바구니예요.' },
};

export function itemInfo(id: string): { name: string; desc: string } {
  if (id.startsWith('seed:')) {
    const c = CROP_MAP[id.slice(5)];
    return { name: `${c?.name ?? id} 씨앗`, desc: c ? `${formatDuration(c.growSeconds)} 뒤 수확 · 판매가 ${c.sellPrice}G` : '' };
  }
  if (id.startsWith('crop:')) {
    const c = CROP_MAP[id.slice(5)];
    return { name: c?.name ?? id, desc: c ? `${c.description} 판매가 ${c.sellPrice}G` : '' };
  }
  if (FERT_MAP[id]) return { name: FERT_MAP[id].name, desc: `${FERT_MAP[id].desc} 퀵슬롯에서 고른 뒤 내 밭 작물 앞에서 E!` };
  if (ROD_MAP[id]) return { name: ROD_MAP[id].name, desc: `${ROD_MAP[id].desc} 최대 ${ROD_MAP[id].uses}회 (낚거나 놓칠 때 1회). 연못 앞에서 E를 눌러 낚시해요.` };
  if (id.startsWith('fish:')) {
    const f = FISH_MAP[id.slice(5)];
    return { name: f?.name ?? id, desc: f ? `갓 잡은 물고기! 판매소에서 ${f.price}G에 팔 수 있어요.` : '' };
  }
  const furn = parseFurnItem(id);
  if (furn) return { name: `${FURNITURE_COLORS[furn.color].name} ${furn.def.name}`, desc: `${furn.def.desc} (${furn.def.w}×${furn.def.h}칸) 집 안에서 누르면 바로 놓을 수 있어요.` };
  return TOOL_NAMES[id] ?? { name: id, desc: '' };
}

/** 퀵슬롯에 올라가는 것: 씨앗 + 비료 */
export function hotbarItems(inv: Record<string, number>): string[] {
  return [
    ...CROPS.map((c) => seedItemId(c.id)),
    ...FERTILIZERS.map((f) => f.id),
  ].filter((id) => (inv[id] ?? 0) > 0).slice(0, 8);
}

/** 퀵슬롯 칸 고르기 (씨앗 ↔ 비료는 하나만 선택) */
export function selectHotbarItem(id: string) {
  const set = useGame.getState().set;
  play('click');
  if (id.startsWith('seed:')) set({ selectedSeed: id.slice(5), selectedFert: null });
  else if (FERT_MAP[id]) set({ selectedFert: id, selectedSeed: null });
}

/** 하단 퀵슬롯: 보유한 씨앗 / 비료를 빠르게 선택 */
export function Hotbar() {
  const inv = useGame((s) => s.inventory);
  const selected = useGame((s) => s.selectedSeed);
  const selectedFert = useGame((s) => s.selectedFert);
  const open = useGame((s) => s.openModal);
  const items = hotbarItems(inv);
  const slots = Array.from({ length: 8 }, (_, i) => items[i] ?? null);
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-end gap-2 max-sm:gap-1" data-testid="hotbar">
      <RodGauge />
      <div className="panel-soft flex gap-1.5 p-1.5 max-sm:gap-1 max-sm:p-1">
        {slots.map((id, i) => {
          const active = !!id && (id === `seed:${selected}` || id === selectedFert);
          const info = id ? itemInfo(id) : null;
          const tid = id ? (id.startsWith('seed:') ? `hotbar-${id.slice(5)}` : `hotbar-${id.replace(':', '-')}`) : undefined;
          return (
            <button key={i} disabled={!id}
              className={`slot relative flex h-12 w-12 items-center justify-center transition max-sm:h-9 max-sm:w-9 ${active ? '!border-[#5a9a3a] !bg-[#e4f6cf] -translate-y-1 shadow-[0_0_0_2px_#9fdc6e]' : ''}`}
              title={info ? `${info.name} (${i + 1})` : '빈 칸'}
              onClick={() => { if (id) selectHotbarItem(id); }}
              data-testid={tid}>
              <span className="absolute left-1 top-0.5 text-[9px] text-[#a08060]">{i + 1}</span>
              {id && <PixelIcon id={id} size={32} />}
              {id && <span className="absolute bottom-0 right-1 text-[11px] text-[#5a3a2e]" style={{ textShadow: '0 0 2px #fff, 0 0 2px #fff' }}>{inv[id]}</span>}
            </button>
          );
        })}
      </div>
      <button className="btn btn-wood h-14 w-14 !p-0 max-sm:h-11 max-sm:w-11" title="가방 (I)" aria-label="가방" onClick={() => { play('click'); open('inventory'); }} data-testid="btn-inventory">
        <PixelIcon id="bag" size={30} />
      </button>
    </div>
  );
}

const ORDER = [
  ...CROPS.map((c) => seedItemId(c.id)),
  ...FERTILIZERS.map((f) => f.id),
  ...CROPS.map((c) => cropItemId(c.id)),
  ...FISH.map((f) => fishItemId(f.id)),
  ...RODS.map((r) => r.id),
  ...FURNITURE.flatMap((f) => FURNITURE_COLORS.map((_, i) => furnItemId(f.id, i))),
  ...Object.keys(TOOL_NAMES),
];

export function InventoryModal({ onClose }: { onClose: () => void }) {
  const inv = useGame((s) => s.inventory);
  const selected = useGame((s) => s.selectedSeed);
  const selectedFert = useGame((s) => s.selectedFert);
  const inMyHouse = useGame((s) => houseOwnerOf(s.space) === s.profile?.id);
  const rodUses = useGame((s) => s.rodUses);
  const [hover, setHover] = useState<string | null>(null);
  const items = ORDER.filter((id) => (inv[id] ?? 0) > 0);
  const cells = Array.from({ length: Math.max(24, Math.ceil(items.length / 8) * 8) }, (_, i) => items[i] ?? null);
  const info = hover ? itemInfo(hover) : null;
  const onPick = (id: string) => {
    if (id.startsWith('seed:') || FERT_MAP[id]) { selectHotbarItem(id); return; }
    const furn = parseFurnItem(id);
    if (furn && inMyHouse) { pickFurniture(furn.def.id, furn.color); onClose(); }
  };
  return (
    <Modal title="가방" icon="bag" onClose={onClose} width={520}>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {cells.map((id, i) => (
          <button key={id ?? `e${i}`} className={`slot relative flex aspect-square items-center justify-center ${id && (id === `seed:${selected}` || id === selectedFert) ? '!border-[#5a9a3a] !bg-[#e4f6cf]' : ''}`}
            onMouseEnter={() => setHover(id)} onFocus={() => setHover(id)}
            onClick={() => { if (id) onPick(id); }}
            disabled={!id} data-testid={id ? `inv-${id}` : undefined}>
            {id && <PixelIcon id={id} size={32} />}
            {id && !ROD_MAP[id] && <span className="absolute bottom-0 right-1 text-[11px]" style={{ textShadow: '0 0 2px #fff, 0 0 2px #fff' }}>{inv[id]}</span>}
            {id && ROD_MAP[id] && <UsesBar left={rodUses[id] ?? ROD_MAP[id].uses} max={ROD_MAP[id].uses} className="absolute bottom-1 left-1 right-1" />}
          </button>
        ))}
      </div>
      <div className="card mt-3 min-h-[58px] px-3 py-2 text-sm">
        {info ? (<><div>{info.name} <span className="text-xs text-[#8a6a5a]">{ROD_MAP[hover!] ? `남은 ${rodUses[hover!] ?? ROD_MAP[hover!].uses}/${ROD_MAP[hover!].uses}회` : `× ${inv[hover!] ?? 0}`}</span></div><div className="text-xs text-[#7a5444]">{info.desc}</div></>)
          : <div className="text-xs text-[#8a6a5a]">아이템에 마우스를 올리면 정보가 보여요. 씨앗·비료를 누르면 퀵슬롯에서 골라져요!</div>}
      </div>
    </Modal>
  );
}
