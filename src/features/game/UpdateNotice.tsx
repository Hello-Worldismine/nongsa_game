import { useEffect } from 'react';
import { Modal } from '@/components/ui';
import { useGame } from '@/stores/gameStore';
import { TUTORIAL_DONE } from './actions';

/** 공지 ID — 새 공지를 띄우려면 이 값만 바꾸면 돼요 (주민마다 한 번씩 보여요) */
export const NOTICE_ID = '2026-11-13-night-beggars-v2';
export const NOTICE_KEY = 'haetsal-notice-seen';

const ITEMS: [string, string, string][] = [
  ['🌙', '낮과 밤', '낮 10분 · 밤 5분이 반복돼요 (왼쪽 위 시계). 밤이 되면 마을에 거지들이 돌아다니며 쫓아와요! 계속 도망가면 따돌릴 수 있지만, 멈춰 있으면 잡혀서 100~1,000G를 뜯겨요. 한 거지는 하루에 한 번만 뜯어 가요.'],
  ['🎣', '낚시', '씨앗 상점 "낚시" 코너에서 낚싯대를 사서 연못을 보고 E! 찌가 "툭!" 하면 3초 안에 E를 눌러요. 잡은 물고기는 판매소에서 팔 수 있어요.'],
  ['🪝', '낚싯대는 소모품', '나무 80G·10회 / 대나무 300G·20회 / 은빛 900G·30회 / 황금 2,000G·40회. 퀵슬롯 왼쪽 체력바에서 남은 횟수를 볼 수 있어요. 다 쓸 때까지 낚은 물고기를 팔면 낚싯대 값보다 더 벌 수 있어요!'],
  ['🧪', '비료', '4분 비료 20G · 10분 비료 50G. 퀵슬롯에서 비료를 고르고 내 밭의 자라는 작물 앞에서 E!'],
  ['🏠', '집 들어가기', '내 농장의 집 앞에서 E를 누르면 집 안으로! 친구 농장에서는 친구 집도 구경할 수 있어요.'],
  ['📐', '집 넓히기', '집 안 "넓히기" 버튼으로 6×4칸부터 최대 14×8칸까지 넓힐 수 있어요.'],
  ['🛋️', '가구 꾸미기', '상점 "가구" 코너에서 12가지 가구를 8가지 색으로 골라 사고, 집 안 "꾸미기"를 눌러 원하는 칸에 놓아요. 놓은 가구를 누르면 옮기거나 다시 가방에 넣을 수 있어요.'],
];

/** 업데이트 공지: 새 버전으로 새로고침한 뒤 한 번만 보여요 */
export function UpdateNoticeModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="햇살마을 업데이트 소식" onClose={onClose} width={560}
      footer={<button className="btn w-full" onClick={onClose} data-testid="notice-close">확인했어요! 🌱</button>}>
      <div className="flex flex-col gap-2 text-sm leading-relaxed" data-testid="update-notice">
        <p className="text-[#7a5444]">새로운 기능이 잔뜩 생겼어요! 🎉</p>
        {ITEMS.map(([e, t, d]) => (
          <div key={t} className="card flex gap-2 p-2.5">
            <span className="text-xl">{e}</span>
            <div><b>{t}</b><div className="text-xs text-[#7a5444]">{d}</div></div>
          </div>
        ))}
        <p className="mt-2 text-center text-xl font-bold leading-snug text-[#ff2d78]" style={{ textShadow: '0 0 1px #ff2d78, 0 2px 0 #ffe14d' }}>
          이다은의 구걸 행동이나 카지노로 유인하는 행동을 본다면 주민게시판에 신고 ㄱㄱ
        </p>
      </div>
    </Modal>
  );
}

/** 게임에 들어오면 아직 안 본 공지를 한 번 띄움 (처음 온 주민은 튜토리얼이 먼저라 건너뜀) */
export function useUpdateNotice() {
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    if (phase !== 'playing') return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(NOTICE_KEY); } catch { /* 무시 */ }
    if (seen === NOTICE_ID) return;
    // 새로 온 주민은 튜토리얼이 먼저 (게임 중에 튜토리얼을 끝내도 이번 접속에서는 안 띄움)
    if (useGame.getState().tutorialStep < TUTORIAL_DONE) return;
    // 다른 창이 열려 있거나 이동 중이면 잠깐 기다렸다가
    const t = setInterval(() => {
      const s = useGame.getState();
      if (s.modal || s.traveling) return;
      clearInterval(t);
      try { localStorage.setItem(NOTICE_KEY, NOTICE_ID); } catch { /* 무시 */ }
      s.openModal('notice');
    }, 800);
    return () => clearInterval(t);
  }, [phase]);
}
