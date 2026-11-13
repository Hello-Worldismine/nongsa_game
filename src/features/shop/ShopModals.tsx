import { useState } from 'react';
import { play } from '@/audio/sfx';
import { Gold, Modal, PixelIcon, QtyPicker } from '@/components/ui';
import { CROPS, cropItemId, formatDuration, seedItemId, type CropDef } from '@/config/crops';
import {
  FERTILIZERS, FISH, fishAvgValue, fishItemId, fishOdds, FURNITURE, FURNITURE_COLORS, furnItemId, RODS,
  type FertilizerDef, type FurnitureDef, type RodDef,
} from '@/config/shop';
import { buyItem, buySeed, sellAll, sellCrop, sellFish } from '@/features/game/actions';
import { useGame } from '@/stores/gameStore';
import { UsesBar, useRodLeft } from '@/features/inventory/RodGauge';

function SeedCard({ c }: { c: CropDef }) {
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const owned = useGame((s) => s.inventory[seedItemId(c.id)] ?? 0);
  const busy = useGame((s) => s.busy);
  const [qty, setQty] = useState(1);
  const maxAfford = Math.max(1, Math.min(99, Math.floor(gold / c.seedPrice)));
  const cost = c.seedPrice * qty;
  const can = gold >= cost;
  const profit = c.sellPrice - c.seedPrice;
  return (
    <div className="card flex flex-col gap-2 p-3" data-testid={`seed-card-${c.id}`}>
      <div className="flex items-center gap-3">
        <div className="slot flex h-14 w-14 shrink-0 items-center justify-center"><PixelIcon id={`crop_${c.id}_3`} size={40} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px]">{c.name}<span className="badge bg-[#eef6e4] text-[#4f8a3a]">보유 {owned}</span></div>
          <div className="mt-0.5 text-xs leading-relaxed text-[#7a5444]">
            ⏱ {formatDuration(c.growSeconds)} · 판매 {c.sellPrice}G
            <span className="ml-1 text-[#4f8a3a]">(+{profit}G)</span>
          </div>
        </div>
        <div className="text-right text-sm text-[#8a5a1e]"><Gold value={c.seedPrice} /></div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <QtyPicker value={qty} onChange={setQty} max={maxAfford} />
        <button className="btn btn-sm" disabled={!can || busy} onClick={() => buySeed(c.id, qty)} data-testid={`buy-${c.id}`}>
          {cost.toLocaleString()}G 구매
        </button>
      </div>
    </div>
  );
}

function FertCard({ f }: { f: FertilizerDef }) {
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const owned = useGame((s) => s.inventory[f.id] ?? 0);
  const busy = useGame((s) => s.busy);
  const [qty, setQty] = useState(1);
  const cost = f.price * qty;
  return (
    <div className="card flex flex-col gap-2 p-3" data-testid={`fert-card-${f.minutes}`}>
      <div className="flex items-center gap-3">
        <div className="slot flex h-14 w-14 shrink-0 items-center justify-center"><PixelIcon id={f.id} size={40} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px]">{f.name}<span className="badge bg-[#eef6e4] text-[#4f8a3a]">보유 {owned}</span></div>
          <div className="mt-0.5 text-xs leading-relaxed text-[#7a5444]">{f.desc}</div>
        </div>
        <div className="text-right text-sm text-[#8a5a1e]"><Gold value={f.price} /></div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <QtyPicker value={qty} onChange={setQty} max={Math.max(1, Math.min(99, Math.floor(gold / f.price)))} />
        <button className="btn btn-sm" disabled={gold < cost || busy} onClick={() => buyItem(f.id, 0, qty)} data-testid={`buy-fert-${f.minutes}`}>
          {cost.toLocaleString()}G 구매
        </button>
      </div>
    </div>
  );
}

function RodCard({ r }: { r: RodDef }) {
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const own = useRodLeft(r.id);
  const owned = !!own;
  const busy = useGame((s) => s.busy);
  const odds = fishOdds(r.tier);
  const ev = Math.round(fishAvgValue(r.tier) * r.uses);
  return (
    <div className="card flex flex-col gap-2 p-3" data-testid={`rod-card-${r.tier}`}>
      <div className="flex items-center gap-3">
        <div className="slot flex h-14 w-14 shrink-0 items-center justify-center"><PixelIcon id={r.id} size={40} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px]">{r.name}{owned && <span className="badge bg-[#eef6e4] text-[#4f8a3a]">보유 중</span>}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-[#7a5444]">{r.desc}</div>
          <div className="mt-0.5 text-xs text-[#4f8a3a]">🎣 <b>{r.uses}회</b> 사용 · 다 쓰면 평균 약 <b>{ev.toLocaleString()}G</b>어치 물고기</div>
        </div>
        <div className="text-right text-sm text-[#8a5a1e]"><Gold value={r.price} /></div>
      </div>
      {own && (
        <div className="flex items-center gap-2 text-[11px] text-[#5a3a2e]">
          남은 횟수 <UsesBar left={own.left} max={own.max} className="flex-1" /> {own.left}/{own.max}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {odds.map(({ fish, pct }) => (
          <span key={fish.id} className="slot inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px]" title={`${fish.name} ${fish.price}G`}>
            <PixelIcon id={fishItemId(fish.id)} size={16} />{pct}%
          </span>
        ))}
      </div>
      <button className="btn btn-sm self-end" disabled={owned || gold < r.price || busy} onClick={() => buyItem(r.id, 0, 1)} data-testid={`buy-rod-${r.tier}`}>
        {owned ? '다 쓰면 다시 살 수 있어요' : `${r.price.toLocaleString()}G 구매`}
      </button>
    </div>
  );
}

function FurnCard({ f }: { f: FurnitureDef }) {
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const busy = useGame((s) => s.busy);
  const [color, setColor] = useState(0);
  const [qty, setQty] = useState(1);
  const owned = useGame((s) => s.inventory[furnItemId(f.id, color)] ?? 0);
  const cost = f.price * qty;
  return (
    <div className="card flex flex-col gap-2 p-3" data-testid={`furn-card-${f.type}`}>
      <div className="flex items-center gap-3">
        <div className="slot flex h-[72px] w-[72px] shrink-0 items-center justify-center bg-[#f6e6cc]">
          <PixelIcon id={furnItemId(f.id, color)} size={f.w > 1 || f.h > 1 ? 64 : 44} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px]">
            {f.name}
            <span className="badge bg-[#f3ead9] text-[#8a6a5a]">{f.w}×{f.h}칸</span>
            {owned > 0 && <span className="badge bg-[#eef6e4] text-[#4f8a3a]">보유 {owned}</span>}
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-[#7a5444]">{f.desc}</div>
          <div className="mt-1 text-[11px] text-[#8a6a5a]">색상: <b>{FURNITURE_COLORS[color].name}</b></div>
        </div>
        <div className="text-right text-sm text-[#8a5a1e]"><Gold value={f.price} /></div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="가구 색상">
        {FURNITURE_COLORS.map((c, i) => (
          <button key={c.name} role="radio" aria-checked={i === color} title={c.name}
            className={`h-7 w-7 rounded-full border-[3px] transition ${i === color ? 'scale-110 border-[#5a3a2e] shadow-[0_0_0_2px_#fff3a0]' : 'border-white'}`}
            style={{ background: c.base }} onClick={() => { play('click'); setColor(i); }} data-testid={`furn-color-${f.type}-${i}`} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <QtyPicker value={qty} onChange={setQty} max={Math.max(1, Math.min(10, Math.floor(gold / f.price)))} />
        <button className="btn btn-sm" disabled={gold < cost || busy} onClick={() => buyItem(f.id, color, qty)} data-testid={`buy-furn-${f.type}`}>
          {cost.toLocaleString()}G 구매
        </button>
      </div>
    </div>
  );
}

type ShopTab = 'seed' | 'fert' | 'furniture' | 'fishing';
const TABS: [ShopTab, string, string][] = [
  ['seed', '🌱', '씨앗'], ['fert', '🧪', '비료'], ['furniture', '🛋️', '가구'], ['fishing', '🎣', '낚시'],
];
const TAB_TALK: Record<ShopTab, string> = {
  seed: '🧑‍🌾 "어서 와요! 오늘도 좋은 씨앗이 들어왔어요~"',
  fert: '🧑‍🌾 "자라는 작물에 비료를 주면 쑥쑥! 퀵슬롯에서 고르고 E를 눌러요."',
  furniture: '🧑‍🌾 "색깔을 골라 보세요! 산 가구는 집에서 원하는 곳에 놓을 수 있어요."',
  fishing: '🧑‍🌾 "낚싯대는 쓸수록 닳아요. 비싼 낚싯대일수록 오래 쓰고 비싼 물고기가 잘 잡혀요!"',
};

export function ShopModal({ onClose }: { onClose: () => void }) {
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const [tab, setTab] = useState<ShopTab>('seed');
  return (
    <Modal title="씨앗 상점" icon="icon_seed_carrot" onClose={onClose} width={780}
      footer={<div className="flex items-center justify-between gap-2 text-sm"><span>{TAB_TALK[tab]}</span><Gold value={gold} className="shrink-0 text-[#8a5a1e]" /></div>}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
        {TABS.map(([k, e, l]) => (
          <button key={k} role="tab" aria-selected={tab === k}
            className={`btn btn-sm ${tab === k ? '' : 'btn-cream'}`} onClick={() => { play('click'); setTab(k); }} data-testid={`shop-tab-${k}`}>
            {e} {l}
          </button>
        ))}
      </div>
      {tab === 'seed' && <div className="grid gap-3 sm:grid-cols-2">{CROPS.map((c) => <SeedCard key={c.id} c={c} />)}</div>}
      {tab === 'fert' && <div className="grid gap-3 sm:grid-cols-2">{FERTILIZERS.map((f) => <FertCard key={f.id} f={f} />)}</div>}
      {tab === 'furniture' && <div className="grid gap-3 sm:grid-cols-2">{FURNITURE.map((f) => <FurnCard key={f.id} f={f} />)}</div>}
      {tab === 'fishing' && (
        <>
          <p className="mb-2 text-xs text-[#8a6a5a]">낚싯대는 소모품이에요. 물고기를 낚거나 놓칠 때 1회씩 줄고, 다 쓰면 사라져요. 가방에 있는 것 중 가장 좋은 낚싯대로 낚시하고, 아래 숫자는 물고기가 잡힐 확률이에요.</p>
          <div className="grid gap-3 sm:grid-cols-2">{RODS.map((r) => <RodCard key={r.id} r={r} />)}</div>
        </>
      )}
    </Modal>
  );
}

interface Sellable { itemId: string; name: string; price: number; kind: 'crop' | 'fish' }
const SELLABLES: Sellable[] = [
  ...CROPS.map((c) => ({ itemId: cropItemId(c.id), name: c.name, price: c.sellPrice, kind: 'crop' as const })),
  ...FISH.map((f) => ({ itemId: fishItemId(f.id), name: f.name, price: f.price, kind: 'fish' as const })),
];

function SellRow({ item, qtyOwned }: { item: Sellable; qtyOwned: number }) {
  const busy = useGame((s) => s.busy);
  const [qty, setQty] = useState(qtyOwned);
  const q = Math.min(qty, qtyOwned);
  const id = item.itemId.slice(5);
  return (
    <div className="card flex items-center gap-3 p-2.5" data-testid={`sell-row-${id}`}>
      <div className="slot flex h-12 w-12 shrink-0 items-center justify-center"><PixelIcon id={item.itemId} size={32} /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px]">{item.name} <span className="text-xs text-[#8a6a5a]">× {qtyOwned}</span></div>
        <div className="text-xs text-[#7a5444]">{item.kind === 'fish' ? '마리당' : '개당'} {item.price}G</div>
      </div>
      <QtyPicker value={q} onChange={setQty} max={qtyOwned} />
      <button className="btn btn-gold btn-sm min-w-[96px]" disabled={busy}
        onClick={() => (item.kind === 'fish' ? sellFish(item.itemId, q) : sellCrop(id, q))} data-testid={`sell-${id}`}>
        {(q * item.price).toLocaleString()}G 판매
      </button>
    </div>
  );
}

export function MarketModal({ onClose, ship }: { onClose: () => void; ship?: boolean }) {
  const inv = useGame((s) => s.inventory);
  const gold = useGame((s) => s.profile?.gold ?? 0);
  const busy = useGame((s) => s.busy);
  const owned = SELLABLES.filter((x) => (inv[x.itemId] ?? 0) > 0);
  const total = owned.reduce((a, x) => a + inv[x.itemId] * x.price, 0);
  return (
    <Modal title={ship ? '출하 상자' : '농산물 판매소'} icon="icon_crop_tomato" onClose={onClose} width={620}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>예상 판매 금액: <b className="text-[#8a5a1e]">{total.toLocaleString()}G</b> · 보유 <Gold value={gold} /></span>
          <button className="btn btn-gold" disabled={!owned.length || busy} onClick={() => sellAll()} data-testid="sell-all">💰 전체 판매</button>
        </div>
      }>
      {owned.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#8a6a5a]">
          <div className="mb-2 text-3xl">🧺</div>
          아직 판매할 작물이나 물고기가 없어요. 농장에서 수확하거나 연못에서 낚시해 오세요!
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-xs text-[#8a6a5a]">🧑‍🌾 "싱싱한 작물도, 갓 잡은 물고기도 언제나 환영이에요! 가격표대로 쳐 드릴게요."</p>
          {owned.map((x) => <SellRow key={x.itemId} item={x} qtyOwned={inv[x.itemId]} />)}
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1 text-xs text-[#8a6a5a]">📋 오늘의 가격표</div>
        <div className="grid grid-cols-5 gap-1.5">
          {CROPS.map((c) => (
            <div key={c.id} className="slot flex flex-col items-center py-1 text-[11px]"><PixelIcon id={cropItemId(c.id)} size={24} />{c.sellPrice}G</div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-8 gap-1.5">
          {FISH.map((f) => (
            <div key={f.id} className="slot flex flex-col items-center py-1 text-[11px]" title={f.name}><PixelIcon id={fishItemId(f.id)} size={24} />{f.price}G</div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
