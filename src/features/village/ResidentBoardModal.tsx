import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import { BOARD_MAX } from '@/features/economy/rules';
import { removeBoardPost, writeBoardPost } from '@/features/game/actions';
import { timeAgo } from '@/features/farm/StorageModal';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { BoardPost } from '@/types';

const NOTE_COLORS = ['#fff6c8', '#ffe4ec', '#e4f6d6', '#e2f0ff', '#f1e6ff'];

/** 분수대 위 주민 게시판: 모든 주민이 읽고, 누구나 쪽지를 붙일 수 있어요 */
export function ResidentBoardModal({ onClose }: { onClose: () => void }) {
  const me = useGame((s) => s.profile?.id);
  const isAdmin = useGame((s) => !!s.profile?.isAdmin);
  const [posts, setPosts] = useState<BoardPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => backend().listBoardPosts().then((p) => { setPosts(p); setErr(null); }).catch((e) => setErr(toKoreanError(e)));
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    if (await writeBoardPost(text)) { setText(''); await load(); }
    setSending(false);
  };

  const len = [...text].length;
  return (
    <Modal title="주민 게시판" onClose={onClose} width={620}>
      <div className="card mb-4 p-3">
        <textarea
          className="input h-20 resize-none text-sm"
          placeholder="주민들에게 남기고 싶은 말을 적어 보세요! (예: 내일 저녁에 광장에서 만나요 🌙)"
          maxLength={BOARD_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          data-testid="board-input"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs ${len > BOARD_MAX - 20 ? 'text-[#c0404a]' : 'text-[#a08070]'}`}>{len}/{BOARD_MAX}</span>
          <div className="flex gap-2">
            <button className="btn btn-cream btn-sm" onClick={() => load()}>🔄 새로고침</button>
            <button className="btn btn-sm" disabled={!text.trim() || sending} onClick={submit} data-testid="board-submit">📌 게시판에 붙이기</button>
          </div>
        </div>
      </div>

      {err && <p className="mb-2 text-center text-sm text-[#c0404a]">{err}</p>}
      {!posts && !err && <p className="py-6 text-center text-sm">게시판을 읽는 중…</p>}
      {posts && posts.length === 0 && (
        <div className="py-8 text-center text-sm text-[#8a6a5a]"><div className="mb-2 text-3xl">📋</div>아직 붙은 글이 없어요. 첫 번째 쪽지를 남겨 보세요!</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="board-posts">
        {posts?.map((p, i) => (
          <div key={p.id} className="relative rounded-lg border-2 border-[#e2c9a0] p-3 shadow-[0_3px_0_#e2c9a0]"
            style={{ background: NOTE_COLORS[Number(p.id) % NOTE_COLORS.length], transform: `rotate(${(i % 3) - 1}deg)` }}>
            <div className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#e8506a] shadow" />
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-[#6b4430]">✍️ {p.nickname}{p.authorId === me && ' (나)'}</span>
              <span className="text-[#a08070]">{timeAgo(p.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{p.body}</p>
            {(p.authorId === me || isAdmin) && (
              <button className="mt-2 text-xs text-[#a0606a] underline" onClick={async () => { if (await removeBoardPost(p.id)) void load(); }}>지우기</button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
