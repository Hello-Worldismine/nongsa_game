import { useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '@/config/game';
import { sendChat } from '@/features/game/actions';
import { useGame } from '@/stores/gameStore';

/** 왼쪽 아래 채팅 기록 + 입력창. Enter 로 열고 Enter 로 전송, Esc 로 닫기 */
export default function ChatPanel() {
  const log = useGame((s) => s.chatLog);
  const open = useGame((s) => s.chatOpen);
  const set = useGame((s) => s.set);
  const me = useGame((s) => s.profile?.id);
  const showLog = useGame((s) => s.settings.showChatLog);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [log, collapsed]);

  /** 한글 조합 중에 Enter 를 누르면, 조합이 끝나는 즉시 전송 (Enter 한 번으로 보내기) */
  const pendingSubmit = useRef(false);

  const submit = () => {
    const t = (input.current?.value ?? text).trim();
    setText('');
    set({ chatOpen: false });
    input.current?.blur();
    if (t) void sendChat(t);
  };

  const len = [...text].length;
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 w-[min(340px,44vw)] max-sm:bottom-[64px] max-sm:left-2 max-sm:w-[62vw]" data-testid="chat-panel">
      {showLog && (
        <div className="mb-2 rounded-xl bg-[#4a3036]/45 text-white backdrop-blur-[2px]">
          <div className="flex items-center justify-between px-3 pt-1.5 text-[11px] text-white/80">
            <span>💬 채팅</span>
            <button className="text-white/80 hover:text-white" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? '채팅 기록 펼치기' : '채팅 기록 접기'}>{collapsed ? '펼치기 ▲' : '접기 ▼'}</button>
          </div>
          {!collapsed && (
            <div ref={list} className="scroll-cute max-h-[150px] min-h-[40px] overflow-y-auto px-3 pb-2 text-[13px] leading-relaxed" data-testid="chat-log">
              {log.length === 0 && <div className="text-white/60">Enter 키를 눌러 인사해 보세요!</div>}
              {log.map((m) => m.system ? (
                <div key={m.id} className="my-0.5 break-words rounded bg-[#fff3c4]/25 px-1 text-[#fff3a0]" data-testid="chat-notice">📢 {m.body}</div>
              ) : (
                <div key={m.id} className="break-words">
                  <span className={m.senderId === me ? 'text-[#c8f5a0]' : 'text-[#ffe08a]'}>{m.nickname}</span>
                  <span className="text-white/90">: {m.body}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={`panel-soft flex items-center gap-2 px-2 py-1.5 transition ${open ? '' : 'opacity-80'}`}>
        <input
          ref={input}
          className="flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-[#a08070]"
          placeholder={open ? '메시지를 입력하고 Enter!' : 'Enter 키로 채팅하기'}
          value={text}
          maxLength={GAME_CONFIG.chat.maxLength}
          onFocus={() => set({ chatOpen: true })}
          onBlur={() => set({ chatOpen: false })}
          onChange={(e) => setText(e.target.value)}
          onCompositionEnd={() => {
            if (!pendingSubmit.current) return;
            pendingSubmit.current = false;
            setTimeout(submit, 0); // 조합이 끝난 최종 글자로 전송
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing || e.keyCode === 229) { pendingSubmit.current = true; return; }
              e.preventDefault();
              pendingSubmit.current = false;
              submit();
            }
            if (e.key === 'Escape') { setText(''); set({ chatOpen: false }); input.current?.blur(); }
          }}
          data-testid="chat-input"
        />
        <span className={`text-[10px] ${len > 90 ? 'text-[#c0404a]' : 'text-[#a08070]'}`}>{len}/{GAME_CONFIG.chat.maxLength}</span>
      </div>
    </div>
  );
}
