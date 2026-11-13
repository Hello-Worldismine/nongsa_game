import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import { GUESTBOOK_MAX } from '@/features/economy/rules';
import { removeGuestbookEntry, writeGuestbook } from '@/features/game/actions';
import { timeAgo } from '@/features/farm/StorageModal';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { GuestbookEntry } from '@/types';

/** 농장 우편함 = 방명록. 놀러 온 친구가 글을 남기고, 모든 주민이 읽을 수 있어요 */
export function GuestbookModal({ onClose, ownerId }: { onClose: () => void; ownerId: string }) {
  const me = useGame((s) => s.profile?.id);
  const isAdmin = useGame((s) => !!s.profile?.isAdmin);
  const ownerName = useGame((s) => (s.viewFarm?.ownerId === ownerId ? s.viewFarm.ownerNickname : ''));
  const [list, setList] = useState<GuestbookEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const isOwner = ownerId === me;

  const load = () => backend().listGuestbook(ownerId).then((l) => { setList(l); setErr(null); }).catch((e) => setErr(toKoreanError(e)));
  useEffect(() => { void load(); }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (sending) return;
    setSending(true);
    if (await writeGuestbook(ownerId, text)) { setText(''); await load(); }
    setSending(false);
  };

  return (
    <Modal title={isOwner ? '내 농장 방명록' : `${ownerName}님의 방명록`} onClose={onClose} width={520}>
      {isOwner ? (
        <p className="mb-3 text-center text-xs text-[#8a6a5a]">놀러 온 친구들이 남긴 글이에요. 마음에 들지 않는 글은 지울 수 있어요 💌</p>
      ) : (
        <div className="card mb-4 p-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder={`${ownerName}님에게 한마디 남겨 주세요! 🌼`}
              maxLength={GUESTBOOK_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit(); }}
              data-testid="guestbook-input"
            />
            <button className="btn btn-sm shrink-0" disabled={!text.trim() || sending} onClick={submit} data-testid="guestbook-submit">💌 남기기</button>
          </div>
          <div className="mt-1 text-right text-[10px] text-[#a08070]">{[...text].length}/{GUESTBOOK_MAX}</div>
        </div>
      )}

      {err && <p className="mb-2 text-center text-sm text-[#c0404a]">{err}</p>}
      {!list && !err && <p className="py-6 text-center text-sm">방명록을 펼치는 중…</p>}
      {list && list.length === 0 && (
        <div className="py-8 text-center text-sm text-[#8a6a5a]"><div className="mb-2 text-3xl">📮</div>{isOwner ? '아직 남겨진 글이 없어요. 친구를 초대해 보세요!' : '첫 번째 방명록을 남겨 보세요!'}</div>
      )}
      <div className="flex flex-col gap-2" data-testid="guestbook-list">
        {list?.map((g) => (
          <div key={g.id} className="card flex gap-2 px-3 py-2 text-sm">
            <div className="text-lg">💌</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[#6b4430]">{g.nickname}{g.authorId === me && ' (나)'}</span>
                <span className="shrink-0 text-[#a08070]">{timeAgo(g.createdAt)}</span>
              </div>
              <p className="break-words leading-relaxed">{g.body}</p>
            </div>
            {(g.authorId === me || isOwner || isAdmin) && (
              <button className="self-start text-xs text-[#a0606a] underline" onClick={async () => { if (await removeGuestbookEntry(g.id)) void load(); }}>지우기</button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
