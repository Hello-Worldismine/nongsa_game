import { lazy, Suspense, useEffect } from 'react';
import { play } from '@/audio/sfx';
import ChatPanel from '@/features/chat/ChatPanel';
import { ExpandModal } from '@/features/farm/ExpandModal';
import { StorageModal } from '@/features/farm/StorageModal';
import { ResidentBoardModal } from '@/features/village/ResidentBoardModal';
import { GuestbookModal } from '@/features/farm/GuestbookModal';
import { CasinoModal } from '@/features/village/CasinoModal';
import { Hotbar, hotbarItems, InventoryModal, selectHotbarItem } from '@/features/inventory/Inventory';
import { HouseExpandModal, HousePanel } from '@/features/house/HousePanel';
import { MarketModal, ShopModal } from '@/features/shop/ShopModals';
import {
  DayClock, EmoteBar, HoverTooltip, NewVersionBanner, PlaceNav, PromptBar, TopLeft, TopRight, Toasts, TravelOverlay, TutorialBubble,
} from '@/features/village/Hud';
import {
  BoardModal, HelpModal, PlayerModal, QuestsModal, ResidentsModal, SettingsModal, StatsModal,
} from '@/features/village/Modals';
import TouchControls from '@/features/village/TouchControls';
import { useGame } from '@/stores/gameStore';
import { startVersionCheck } from './versionCheck';
import { UpdateNoticeModal, useUpdateNotice } from './UpdateNotice';

const PhaserGame = lazy(() => import('@/game/PhaserGame'));

function Modals() {
  const modal = useGame((s) => s.modal);
  const data = useGame((s) => s.modalData);
  const close = useGame((s) => s.closeModal);
  switch (modal) {
    case 'shop': return <ShopModal onClose={close} />;
    case 'market': return <MarketModal onClose={close} />;
    case 'storage': return <StorageModal onClose={close} ownerId={String(data?.ownerId)} />;
    case 'residentBoard': return <ResidentBoardModal onClose={close} />;
    case 'guestbook': return <GuestbookModal onClose={close} ownerId={String(data?.ownerId)} />;
    case 'casino': return <CasinoModal onClose={close} />;
    case 'houseExpand': return <HouseExpandModal onClose={close} />;
    case 'notice': return <UpdateNoticeModal onClose={close} />;
    case 'inventory': return <InventoryModal onClose={close} />;
    case 'residents': return <ResidentsModal onClose={close} />;
    case 'board': return <BoardModal onClose={close} />;
    case 'expand': return <ExpandModal onClose={close} />;
    case 'settings': return <SettingsModal onClose={close} />;
    case 'stats': return <StatsModal onClose={close} />;
    case 'quests': return <QuestsModal onClose={close} />;
    case 'help': return <HelpModal onClose={close} />;
    case 'player': return <PlayerModal onClose={close} id={String(data?.id)} nickname={String(data?.nickname)} />;
    default: return null;
  }
}

/** 전역 단축키: Enter 채팅, I 가방, Esc 닫기, 1~8 퀵슬롯 */
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      const s = useGame.getState();
      if (e.key === 'Escape') {
        if (s.modal) { play('close'); s.closeModal(); e.preventDefault(); }
        return;
      }
      if (typing || s.traveling) return;
      if (e.key === 'Enter' && !s.modal) {
        e.preventDefault();
        (document.querySelector('[data-testid="chat-input"]') as HTMLInputElement | null)?.focus();
        return;
      }
      if (e.key === 'i' || e.key === 'I' || e.key === 'ㅑ') {
        if (s.modal === 'inventory') s.closeModal();
        else if (!s.modal) s.openModal('inventory');
        return;
      }
      if (!s.modal && /^[1-8]$/.test(e.key)) {
        const id = hotbarItems(s.inventory)[Number(e.key) - 1];
        if (id) selectHotbarItem(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function GameScreen() {
  useHotkeys();
  useUpdateNotice();
  useEffect(() => { startVersionCheck(); }, []);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#a8d973]">
      <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[#5a3a2e]">게임을 준비하는 중…</div>}>
        <PhaserGame />
      </Suspense>
      <div className="pointer-events-none absolute inset-0">
        <TopLeft />
        <DayClock />
        <TopRight />
        <PlaceNav />
        <HousePanel />
        <TutorialBubble />
        <PromptBar />
        <HoverTooltip />
        <Hotbar />
        <ChatPanel />
        <EmoteBar />
        <TouchControls />
        <Toasts />
        <NewVersionBanner />
      </div>
      <Modals />
      <TravelOverlay />
    </div>
  );
}
