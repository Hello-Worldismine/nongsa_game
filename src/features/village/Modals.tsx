import { useEffect, useState } from 'react';
import { play, setAudio } from '@/audio/sfx';
import { CharacterPreview, Gold, Modal, PixelIcon } from '@/components/ui';
import { CROP_MAP, CROPS } from '@/config/crops';
import { farmSpace, GAME_CONFIG } from '@/config/game';
import { QUESTS } from '@/config/quests';
import { claimQuest, goMyFarm, report, setBlocked, travel, TUTORIAL_DONE } from '@/features/game/actions';
import { editCharacter, logout } from '@/features/game/boot';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { useGame } from '@/stores/gameStore';
import type { QuestProgress, Resident } from '@/types';

export function ResidentsModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Resident[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const online = useGame((s) => s.online);
  const me = useGame((s) => s.profile?.id);
  useEffect(() => { backend().listResidents().then(setList).catch((e) => setErr(toKoreanError(e))); }, []);
  const onlineIds = new Set(online.map((o) => o.id));
  return (
    <Modal title={`${GAME_CONFIG.villageName} 주민`} onClose={onClose} width={560}>
      <p className="mb-3 text-center text-xs text-[#8a6a5a]">주민의 농장에 놀러 갈 수 있어요! 주인이 없어도 구경할 수 있어요 🌼</p>
      {err && <p className="text-center text-sm text-[#c0404a]">{err}</p>}
      {!list && !err && <p className="py-6 text-center text-sm">주민 명부를 펼치는 중…</p>}
      <div className="flex flex-col gap-2" data-testid="residents-list">
        {list?.map((r) => {
          const on = onlineIds.has(r.id);
          return (
            <div key={r.id} className="card flex items-center gap-3 p-2.5">
              <div className="flex h-14 w-12 items-end justify-center overflow-hidden rounded-lg bg-[#e6f4d4]"><CharacterPreview appearance={r.appearance} scale={2.5} walking={on} /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-[15px]">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${on ? 'bg-[#5fd35a]' : 'bg-[#c9b9a8]'}`} title={on ? '접속 중' : '오프라인'} />
                  {r.nickname} {r.id === me && <span className="badge bg-[#e4f6cf] text-[#4f8a3a]">나</span>}
                </div>
                <div className="text-xs text-[#8a6a5a]">{on ? '접속 중' : '오프라인'} · 농장 {r.farmSize}×{r.farmSize}</div>
              </div>
              {r.id === me
                ? <button className="btn btn-sm" onClick={() => goMyFarm()} data-testid="visit-mine">🌱 내 농장으로</button>
                : <button className="btn btn-sky btn-sm" onClick={() => travel(farmSpace(r.id))} data-testid={`visit-${r.nickname}`}>🏡 놀러 가기</button>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function BoardModal({ onClose }: { onClose: () => void }) {
  const maxPlayers = useGame((s) => s.maxPlayers);
  const [list, setList] = useState<Resident[]>([]);
  useEffect(() => { backend().listResidents().then(setList).catch(() => undefined); }, []);
  return (
    <Modal title="마을 게시판" onClose={onClose} width={620}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-3 text-sm leading-relaxed">
          <div className="mb-1 text-base">📌 {GAME_CONFIG.villageName}에 오신 걸 환영해요!</div>
          씨앗을 사서 내 농장에 심고, 다 자라면 수확해서 팔아요. 모은 골드로 농장을 넓혀 보세요! 친구 농장에 놀러 가는 것도 잊지 마세요 🌼
        </div>
        <div className="card p-3 text-sm leading-relaxed">
          <div className="mb-1 text-base">🎮 조작 방법</div>
          <div>방향키 / WASD : 이동</div>
          <div>E / Space : 상호작용 · 심기 · 수확</div>
          <div>R : 친구 밭 전체에 물 주기 (친구마다 30분에 한 번)</div>
          <div>I : 가방 · Enter : 채팅 · Esc : 창 닫기</div>
          <div>1~8 : 퀵슬롯 씨앗 고르기</div>
        </div>
        <div className="card p-3 text-sm leading-relaxed">
          <div className="mb-1 text-base">🗺️ 마을 지도</div>
          <div>↖ 씨앗 상점 (분홍 지붕)</div>
          <div>↗ 농산물 판매소 (주황 차양)</div>
          <div>⬇ 농장 가는 길 (광장 남쪽 아치)</div>
          <div>↘ 연못과 공원 (벤치에 앉아 쉬어요)</div>
          <div>🍎 과수원: 마을 왼쪽 아래 · 오른쪽 위 (머리 위에 열매가 떠 있는 나무에서 E, 30분마다 30G)</div>
          <div>🎰 광장 동쪽: 햇살 카지노 · ⛲ 분수: 소원 빌기 (1분마다 30G)</div>
        </div>
        <div className="card p-3 text-sm leading-relaxed">
          <div className="mb-1 text-base">🏡 주민 목록 ({list.length}/{maxPlayers})</div>
          <div className="flex flex-wrap gap-1">{list.map((r) => <span key={r.id} className="badge bg-[#fff1c8]">{r.nickname}</span>)}</div>
        </div>
      </div>
    </Modal>
  );
}

export function PlayerModal({ onClose, id, nickname }: { onClose: () => void; id: string; nickname: string }) {
  const blocked = useGame((s) => s.blocked.includes(id));
  const peer = useGame((s) => s.peers.find((p) => p.id === id));
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('욕설/비방');
  const [detail, setDetail] = useState('');
  return (
    <Modal title={nickname} onClose={onClose} width={420}>
      <div className="flex flex-col items-center gap-3">
        {peer && <CharacterPreview appearance={peer.appearance} scale={5} />}
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn btn-sky btn-sm" onClick={() => travel(farmSpace(id))}>🏡 농장 놀러 가기</button>
          <button className={`btn btn-sm ${blocked ? 'btn-cream' : 'btn-wood'}`} onClick={() => setBlocked(id, !blocked)}>{blocked ? '차단 해제' : '🚫 채팅 차단'}</button>
          <button className="btn btn-pink btn-sm" onClick={() => setReporting((r) => !r)}>🚨 신고하기</button>
        </div>
        {reporting && (
          <div className="card w-full p-3 text-sm">
            <select className="input mb-2" value={reason} onChange={(e) => setReason(e.target.value)}>
              {['욕설/비방', '도배', '불쾌한 닉네임', '기타'].map((r) => <option key={r}>{r}</option>)}
            </select>
            <textarea className="input mb-2 h-20 resize-none" maxLength={300} placeholder="자세한 내용 (선택)" value={detail} onChange={(e) => setDetail(e.target.value)} />
            <button className="btn btn-pink w-full" onClick={async () => { await report(id, reason, detail); onClose(); }}>신고 보내기</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.set);
  const kind = backend().kind;
  const update = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    set({ settings: next });
    setAudio(next.volume, next.muted);
    void backend().updateSettings(next).catch(() => undefined);
  };
  return (
    <Modal title="설정" onClose={onClose} width={420}>
      <div className="flex flex-col gap-4 text-sm">
        <label className="flex items-center justify-between gap-3">🔊 효과음 크기
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => update({ volume: Number(e.target.value) })} onMouseUp={() => play('coin')} className="w-40 accent-[#7cc455]" />
        </label>
        <label className="flex items-center justify-between">🔇 음소거
          <input type="checkbox" checked={settings.muted} onChange={(e) => update({ muted: e.target.checked })} className="h-5 w-5 accent-[#7cc455]" />
        </label>
        <label className="flex items-center justify-between">💬 채팅 기록 보이기
          <input type="checkbox" checked={settings.showChatLog} onChange={(e) => update({ showChatLog: e.target.checked })} className="h-5 w-5 accent-[#7cc455]" />
        </label>
        <div className="card p-3 text-xs text-[#8a6a5a]">서버: {kind === 'supabase' ? 'Supabase (온라인)' : '체험 모드 (이 브라우저에만 저장)'}</div>
        <div className="flex justify-between gap-2">
          <button className="btn btn-cream" onClick={() => editCharacter()}>👗 외형 바꾸기</button>
          <button className="btn btn-wood" onClick={() => logout()} data-testid="logout">로그아웃</button>
        </div>
      </div>
    </Modal>
  );
}

export function StatsModal({ onClose }: { onClose: () => void }) {
  const stats = useGame((s) => s.stats);
  const farm = useGame((s) => s.myFarm);
  const gold = useGame((s) => s.profile?.gold ?? 0);
  if (!stats) return null;
  const fav = Object.entries(stats.cropHarvests).sort((a, b) => b[1] - a[1])[0];
  const rows: [string, React.ReactNode][] = [
    ['🌾 총 수확 횟수', `${stats.totalHarvests.toLocaleString()}번`],
    ['🌱 총 심은 작물', `${stats.totalPlanted.toLocaleString()}개`],
    ['💰 총 판매 금액', `${stats.totalSalesGold.toLocaleString()}G`],
    ['📦 총 판매 개수', `${stats.totalSold.toLocaleString()}개`],
    ['⭐ 가장 많이 키운 작물', fav ? <span className="inline-flex items-center gap-1"><PixelIcon id={`crop:${fav[0]}`} size={18} />{CROP_MAP[fav[0]]?.name} ({fav[1]}번)</span> : '아직 없어요'],
    ['🏡 현재 농장 크기', farm ? `${farm.size}×${farm.size} (${farm.level}단계)` : '-'],
    ['🪙 지금 가진 골드', <Gold key="g" value={gold} />],
    ['📅 접속 횟수', `${stats.sessions}번`],
    ['🗓️ 처음 온 날', stats.firstPlayedAt ? new Date(stats.firstPlayedAt).toLocaleDateString('ko-KR') : '-'],
  ];
  return (
    <Modal title="농장 기록" onClose={onClose} width={460}>
      <div className="flex flex-col gap-1.5">
        {rows.map(([k, v]) => <div key={k} className="card flex items-center justify-between px-3 py-2 text-sm"><span>{k}</span><span>{v}</span></div>)}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {CROPS.map((c) => (
          <div key={c.id} className="slot flex flex-col items-center py-1 text-[11px]" title={c.name}>
            <PixelIcon id={`crop:${c.id}`} size={22} />{stats.cropHarvests[c.id] ?? 0}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function QuestsModal({ onClose }: { onClose: () => void }) {
  const [qs, setQs] = useState<QuestProgress[] | null>(null);
  const load = () => backend().getQuests().then(setQs).catch(() => setQs([]));
  useEffect(() => { void load(); }, []);
  return (
    <Modal title="오늘의 퀘스트" onClose={onClose} width={480}>
      <p className="mb-3 text-center text-xs text-[#8a6a5a]">매일 자정(한국 시간)에 새로 시작돼요!</p>
      {!qs && <p className="text-center text-sm">불러오는 중…</p>}
      <div className="flex flex-col gap-2">
        {qs?.map((q) => {
          const def = QUESTS.find((d) => d.id === q.id);
          if (!def) return null;
          const done = q.progress >= def.target;
          return (
            <div key={q.id} className="card flex items-center gap-3 p-3">
              <div className="text-2xl">{q.claimed ? '✅' : done ? '🎁' : '📜'}</div>
              <div className="flex-1">
                <div className="text-sm">{def.title}</div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#f1e2c4]">
                  <div className="h-full rounded-full bg-[#8fcf6a] transition-all" style={{ width: `${(q.progress / def.target) * 100}%` }} />
                </div>
                <div className="mt-0.5 text-[11px] text-[#8a6a5a]">{q.progress}/{def.target} · 보상 {def.reward}G</div>
              </div>
              <button className="btn btn-gold btn-sm" disabled={!done || q.claimed} onClick={async () => { if (await claimQuest(q.id)) void load(); }}>
                {q.claimed ? '받음' : '보상 받기'}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const restart = () => { useGame.getState().set({ tutorialStep: 0, modal: null }); void backend().updateTutorial(0).catch(() => undefined); };
  const step = useGame((s) => s.tutorialStep);
  return (
    <Modal title="도움말" onClose={onClose} width={480}>
      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <div className="card p-3">🥕 <b>농사 순서</b>: 씨앗 상점에서 구매 → 내 농장 밭에 심기 → 다 자라면 수확 → 마을 판매소에서 판매 → 골드로 농장 확장! 남는 작물은 농장 보관함에 넣어 둘 수 있어요.</div>
        <div className="card p-3">⌨️ 방향키/WASD 이동 · E/Space 상호작용 · R 친구 밭 전체에 물 주기 · I 가방 · Enter 채팅 · Esc 닫기 · 1~8 씨앗 선택</div>
        <div className="card p-3">⏰ 작물은 접속하지 않아도 서버 시간에 맞춰 자라요. 편하게 쉬다 오세요!</div>
        <div className="card p-3">👥 다른 주민을 클릭하면 농장 방문 · 차단 · 신고를 할 수 있어요.</div>
        {step >= TUTORIAL_DONE && <button className="btn btn-cream" onClick={restart}>🌱 튜토리얼 다시 보기</button>}
      </div>
    </Modal>
  );
}
