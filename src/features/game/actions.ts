/**
 * 게임 동작 (React UI 와 Phaser 장면이 공통으로 호출).
 * 모든 경제 동작은 서버(또는 로컬 서버) 결과만 반영합니다 — 클라이언트는 결과를 믿고 그릴 뿐.
 */
import { play } from '@/audio/sfx';
import { CROP_MAP, CROPS, seedItemId } from '@/config/crops';
import { farmOwnerOf, farmSpace, GAME_CONFIG, houseOwnerOf, houseSpace, type SpaceKey } from '@/config/game';
import {
  bestRod, FERT_MAP, FISH_MAP, FISHING, FURN_MAP, FURNITURE_COLORS, furnItemId, HOUSE_LEVELS, ROD_MAP, shopItemName,
} from '@/config/shop';
import { QUESTS } from '@/config/quests';
import { growthInfo, newRequestId, nextExpansion, validateChat } from '@/features/economy/rules';
import { session } from '@/features/multiplayer/session';
import { bus } from '@/game/bus';
import { backend } from '@/services/backend';
import { toKoreanError } from '@/services/backend/types';
import { serverNow, useGame } from '@/stores/gameStore';
import type { CasinoState, EconomyResult, EmoteKind, HouseState } from '@/types';
import { FRUIT_NAMES, FRUIT_TREES, WISH } from '@/config/fruit';
import { validateBoard, validateGuestbook } from '@/features/economy/rules';

const st = () => useGame.getState();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('NETWORK')), ms))]);
}

/** 네트워크 오류 시 같은 request_id 로 1회 재시도 (서버 멱등성 덕분에 중복 처리 없음) */
async function econ<T = EconomyResult>(fn: (requestId: string) => Promise<T>): Promise<T> {
  const id = newRequestId();
  try {
    return await withTimeout(fn(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/NETWORK|fetch|network/i.test(msg)) { await wait(800); return withTimeout(fn(id)); }
    throw e;
  }
}

function apply(r: EconomyResult) {
  const s = st();
  if (!s.profile) return;
  const patch: Partial<ReturnType<typeof st>> = {
    profile: { ...s.profile, gold: r.gold },
    inventory: r.inventory,
    serverOffset: r.serverNow - Date.now(),
  };
  if (r.stats) patch.stats = r.stats;
  if (r.fruitPicks) patch.fruitPicks = r.fruitPicks;
  if (r.rodUses) patch.rodUses = r.rodUses;
  if (r.farm) {
    patch.myFarm = r.farm;
    if (farmOwnerOf(s.space) === s.profile.id) {
      patch.viewFarm = r.farm;
    }
  }
  if (r.house && houseOwnerOf(s.space) === r.house.ownerId) patch.viewHouse = r.house;
  s.set(patch);
  if (r.farm && farmOwnerOf(s.space) === s.profile.id) bus.emit('farm:update', r.farm);
  if (r.house && houseOwnerOf(s.space) === r.house.ownerId) bus.emit('house:update', r.house);
  // 고른 비료가 다 떨어지면 선택 해제
  const fert = st().selectedFert;
  if (fert && !(r.inventory[fert] > 0)) st().set({ selectedFert: null });
  // 고른 씨앗이 다 떨어지면 다른 씨앗으로 자동 선택
  const sel = st().selectedSeed;
  if (sel && !(r.inventory[seedItemId(sel)] > 0)) {
    const next = CROPS.find((c) => r.inventory[seedItemId(c.id)] > 0);
    st().set({ selectedSeed: next?.id ?? null });
  }
}

function fail(e: unknown) {
  play('error');
  st().toast(toKoreanError(e), 'error');
}

// ───────────────────────── 튜토리얼 ─────────────────────────
export const TUTORIAL_STEPS = [
  '반가워요! 방향키(또는 WASD)로 마을을 구경해 보세요!',
  '씨앗 상점에 가서 당근 씨앗을 구매해 볼까요? (광장 왼쪽 위 분홍 지붕)',
  '이제 나만의 농장으로 가볼까요? 광장 아래쪽 "농장 가는 길"로 가 보세요!',
  '빈 밭에 씨앗을 심어보세요! 밭 앞에서 E 또는 스페이스, 혹은 밭을 클릭!',
  '작물이 다 자랐어요! 수확해 볼까요?',
  '수확한 당근을 마을의 농산물 판매소에서 팔아 골드를 벌어보세요! (광장 오른쪽 위 주황 차양)',
];
export const TUTORIAL_DONE = TUTORIAL_STEPS.length;

export async function advanceTutorial(from: number) {
  const s = st();
  if (s.tutorialStep !== from) return;
  s.set({ tutorialStep: from + 1 });
  if (from + 1 === TUTORIAL_DONE) {
    play('quest');
    s.toast('튜토리얼 완료! 이제 자유롭게 농장을 키워 보세요 🌱', 'success');
  }
  try { await backend().updateTutorial(from + 1); } catch { /* 다음 저장 때 반영 */ }
}

export async function skipTutorial() {
  st().set({ tutorialStep: TUTORIAL_DONE });
  try { await backend().updateTutorial(TUTORIAL_DONE); } catch { /* 무시 */ }
}

// ───────────────────────── 이동 ─────────────────────────
export async function travel(target: SpaceKey, arrival: 'start' | 'gate' | 'farm' | 'house' = 'farm') {
  const s = st();
  if (s.traveling) return;
  cancelFishing();
  const owner = farmOwnerOf(target);
  const houseOwner = houseOwnerOf(target);
  const me = s.profile?.id;
  s.set({
    traveling: true, modal: null, prompt: null, hoverInfo: null,
    travelText: houseOwner
      ? (houseOwner === me ? '내 집에 들어가는 중…' : '친구 집에 놀러 가는 중…')
      : owner ? (arrival === 'house' ? '밖으로 나가는 중…' : owner === me ? '내 농장으로 가는 중…' : '친구 농장으로 놀러 가는 중…') : `${GAME_CONFIG.villageName}로 돌아가는 중…`,
  });
  play('open');
  try {
    let viewFarm = null;
    let offset = s.serverOffset;
    if (owner) {
      const r = await withTimeout(backend().getFarm(owner), 9000);
      viewFarm = r.farm;
      offset = r.serverNow - Date.now();
    }
    let viewHouse: HouseState | null = null;
    if (houseOwner) viewHouse = await withTimeout(backend().getHouse(houseOwner), 9000);
    await withTimeout(backend().enterSpace(target), 9000);
    session.joinSpace(target);
    st().set({
      space: target, viewFarm, viewHouse, houseEdit: false, housePlacing: null, serverOffset: offset,
      arrival: owner ? (arrival === 'house' ? 'house' : 'farm') : houseOwner ? 'start' : arrival,
      sceneNonce: st().sceneNonce + 1, chatLog: [],
      ...(owner === s.profile?.id && viewFarm ? { myFarm: viewFarm } : {}),
    });
    if (owner && owner === s.profile?.id) void advanceTutorial(2);
    if (owner && owner !== s.profile?.id && viewFarm && arrival !== 'house') st().toast(`${viewFarm.ownerNickname}님의 농장에 놀러 왔어요! 🌼`, 'success');
    if (houseOwner && houseOwner !== me && viewHouse) st().toast(`${viewHouse.ownerNickname}님의 집에 놀러 왔어요! 🏠`, 'success');
  } catch (e) {
    // 실패해도 현재 공간에 그대로 머무름 (갇히지 않음)
    fail(e);
  } finally {
    await wait(350);
    st().set({ traveling: false });
  }
}

export const goMyFarm = () => { const id = st().profile?.id; if (id) void travel(farmSpace(id)); };
export const goVillage = () => travel('village', 'gate');
/** 농장 집 → 집 안 */
export const goHouse = (ownerId: string) => travel(houseSpace(ownerId));
/** 집 안 → 그 농장의 집 앞 */
export const leaveHouse = () => { const o = houseOwnerOf(st().space); if (o) void travel(farmSpace(o), 'house'); };

// ───────────────────────── 경제 ─────────────────────────
export async function buySeed(cropId: string, qty: number) {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().buySeed(cropId, qty, id));
    apply(r);
    play('buy');
    st().toast(`${CROP_MAP[cropId].name} 씨앗 ${qty}개를 샀어요!`, 'success');
    if (!st().selectedSeed) st().set({ selectedSeed: cropId });
    if (cropId === 'carrot') void advanceTutorial(1);
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function plotAction(x: number, y: number) {
  const s = st();
  const owner = farmOwnerOf(s.space);
  if (!owner || !s.viewFarm || s.busy) return;
  const crop = s.viewFarm.crops.find((c) => c.x === x && c.y === y);
  if (owner !== s.profile?.id) {
    play('error');
    s.toast(crop ? `${CROP_MAP[crop.cropId]?.name}이(가) 자라고 있어요. 친구 밭은 심거나 수확할 수 없지만, R 키로 밭 전체에 물을 줄 수 있어요 💧` : '다른 사람의 농장은 구경만 할 수 있어요.', 'info');
    return;
  }
  if (crop) {
    const info = growthInfo(crop, serverNow());
    if (!info.ready) {
      const fert = s.selectedFert;
      if (fert && crop.fertilized) { play('error'); s.toast('이 칸에는 이미 비료를 줬어요! (하얀 가루가 뿌려진 칸) 다른 칸에 줘 보세요 🌱'); return; }
      if (fert && (s.inventory[fert] ?? 0) > 0) { await fertilize(x, y, fert); return; }
      s.toast(`${CROP_MAP[crop.cropId]?.name}: 아직 자라는 중이에요. 퀵슬롯에서 비료를 고르면 더 빨리 키울 수 있어요! 🌱`);
      return;
    }
    s.set({ busy: true });
    try {
      const r = await econ((id) => backend().harvest(x, y, id));
      apply(r);
      play('harvest');
      bus.emit('fx:harvest', { x, y, cropId: crop.cropId });
      session.notifyFarmChanged();
      void advanceTutorial(4);
    } catch (e) { fail(e); } finally { st().set({ busy: false }); }
    return;
  }
  const seed = s.selectedSeed;
  if (!seed && s.selectedFert) {
    play('error');
    s.toast('비료는 자라는 작물에 줄 수 있어요. 씨앗을 심으려면 퀵슬롯에서 씨앗을 골라 주세요!');
    return;
  }
  if (!seed || !(s.inventory[seedItemId(seed)] > 0)) {
    play('error');
    s.toast('심을 씨앗이 없어요. 아래 퀵슬롯에서 씨앗을 고르거나 상점에서 사 주세요!');
    return;
  }
  s.set({ busy: true });
  try {
    const r = await econ((id) => backend().plant(x, y, seed, id));
    apply(r);
    play('plant');
    bus.emit('fx:plant', { x, y });
    session.notifyFarmChanged();
    void advanceTutorial(3);
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function sellCrop(cropId: string, qty: number) {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().sell(cropId, qty, id));
    apply(r);
    play('coin');
    bus.emit('fx:coins', { amount: r.goldDelta ?? 0 });
    st().toast(`${CROP_MAP[cropId].name} ${qty}개를 팔아서 ${(r.goldDelta ?? 0).toLocaleString()}G를 벌었어요!`, 'gold');
    void advanceTutorial(5);
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function sellAll() {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().sellAll(id));
    apply(r);
    play('coin');
    bus.emit('fx:coins', { amount: r.goldDelta ?? 0 });
    st().toast(`모두 팔아서 ${(r.goldDelta ?? 0).toLocaleString()}G를 벌었어요!`, 'gold');
    void advanceTutorial(5);
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function expandFarm() {
  const s = st();
  if (s.busy || !s.myFarm) return;
  const next = nextExpansion(s.myFarm.level);
  if (!next) { s.toast('이미 최고 단계까지 확장했어요!'); return; }
  s.set({ busy: true });
  try {
    const r = await econ((id) => backend().expandFarm(next.level, id));
    apply(r);
    play('expand');
    bus.emit('fx:expand', { size: next.size });
    session.notifyFarmChanged();
    st().set({ modal: null });
    st().toast(`농장이 ${next.size}×${next.size}로 넓어졌어요! 🎉`, 'success');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function claimQuest(questId: string) {
  if (st().busy) return false;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().claimQuest(questId, id));
    apply(r);
    play('quest');
    bus.emit('fx:coins', { amount: r.goldDelta ?? 0 });
    st().toast(`퀘스트 보상 ${(r.goldDelta ?? 0)}G를 받았어요!`, 'gold');
    return true;
  } catch (e) { fail(e); return false; } finally { st().set({ busy: false }); }
}
export const questTitle = (id: string) => QUESTS.find((q) => q.id === id)?.title ?? id;

// ───────────────────────── 채팅 / 감정표현 ─────────────────────────
let lastChat = 0;
export async function sendChat(raw: string) {
  const v = validateChat(raw);
  if (!v.ok) { if (v.code !== 'CHAT_EMPTY') fail(new Error(v.code)); return; }
  if (Date.now() - lastChat < 400) return;
  lastChat = Date.now();
  try {
    await backend().sendChat(st().space, v.body);
  } catch (e) { fail(e); }
}

export function emote(kind: EmoteKind) {
  bus.emit('local:emote', kind);
  play('pop');
}

export async function setBlocked(targetId: string, blocked: boolean) {
  try {
    await backend().setBlocked(targetId, blocked);
    const list = st().blocked.filter((x) => x !== targetId);
    st().set({ blocked: blocked ? [...list, targetId] : list });
    st().toast(blocked ? '차단했어요. 이 사람의 채팅이 더 이상 보이지 않아요.' : '차단을 해제했어요.', 'success');
  } catch (e) { fail(e); }
}

export async function report(targetId: string, reason: string, detail: string) {
  try {
    await backend().reportPlayer(targetId, reason, detail);
    st().toast('신고가 접수됐어요. 알려 주셔서 고마워요!', 'success');
  } catch (e) { fail(e); }
}

// ───────────────────────── 보관함 ─────────────────────────
/** 넣기/빼기 성공 시 새 보관함 내용을 돌려줌 (실패하면 null) */
export async function moveStorage(dir: 'deposit' | 'withdraw', itemId: string, qty: number) {
  if (st().busy) return null;
  st().set({ busy: true });
  try {
    const r = await econ((id) => (dir === 'deposit' ? backend().depositStorage(itemId, qty, id) : backend().withdrawStorage(itemId, qty, id)));
    apply(r);
    play(dir === 'deposit' ? 'pop' : 'click');
    return r.storage ?? {};
  } catch (e) { fail(e); return null; } finally { st().set({ busy: false }); }
}

// ───────────────────────── 주민 게시판 ─────────────────────────
export async function writeBoardPost(raw: string) {
  const v = validateBoard(raw);
  if (!v.ok) { fail(new Error(v.code)); return false; }
  try {
    await backend().createBoardPost(v.body);
    play('quest');
    st().toast('게시판에 글을 붙였어요! 📌', 'success');
    return true;
  } catch (e) { fail(e); return false; }
}

export async function removeBoardPost(id: string) {
  try { await backend().deleteBoardPost(id); play('close'); return true; } catch (e) { fail(e); return false; }
}

// ───────────────────────── 농장 방명록 ─────────────────────────
export async function writeGuestbook(ownerId: string, raw: string) {
  const v = validateGuestbook(raw);
  if (!v.ok) { fail(new Error(v.code)); return false; }
  try {
    await backend().writeGuestbook(ownerId, v.body);
    play('quest');
    st().toast('방명록에 글을 남겼어요! 💌', 'success');
    return true;
  } catch (e) { fail(e); return false; }
}

export async function removeGuestbookEntry(id: string) {
  try { await backend().deleteGuestbookEntry(id); play('close'); return true; } catch (e) { fail(e); return false; }
}

// ───────────────────────── 과일 나무 ─────────────────────────
export async function pickFruit(treeId: string) {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().pickFruit(treeId, id));
    apply(r);
    play('coin');
    bus.emit('fx:fruit', { treeId });
    bus.emit('fx:coins', { amount: r.goldDelta ?? 0 });
    const def = FRUIT_TREES.find((t) => t.id === treeId);
    st().toast(`${def ? FRUIT_NAMES[def.fruit] : '과일'}를 따서 ${r.goldDelta ?? 0}G를 벌었어요! 30분 뒤에 다시 열려요 🍎`, 'gold');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

// ───────────────────────── 햇살 카지노 ─────────────────────────
type CasinoCall = () => Promise<CasinoState>;
/** 카지노 요청 실행 → 다른 사람들에게 "판이 바뀌었어요" 알림 */
export async function casinoCall(fn: CasinoCall, sfx: Parameters<typeof play>[0] = 'click'): Promise<CasinoState | null> {
  try {
    const s = await withTimeout(fn());
    play(sfx);
    session.notifyCasino();
    return s;
  } catch (e) { fail(e); return null; }
}
export const casinoJoin = (stake: number) => casinoCall(() => backend().casinoJoin(stake, newRequestId()), 'buy');
export const casinoLeave = () => casinoCall(() => backend().casinoLeave(newRequestId()), 'close');
export const casinoReady = (ready: boolean) => casinoCall(() => backend().casinoReady(ready), ready ? 'pop' : 'click');

/** 카지노 결과/판돈 반영 후 내 골드 표시 맞추기 */
export function syncGold(gold: number) {
  const p = st().profile;
  if (p && p.gold !== gold) st().set({ profile: { ...p, gold } });
}

// ───────────────────────── 친구 밭 물 주기 ─────────────────────────
export async function waterFarm() {
  const s = st();
  const owner = farmOwnerOf(s.space);
  if (!owner || s.busy) return;
  if (owner === s.profile?.id) { fail(new Error('OWN_FARM_WATER')); return; }
  s.set({ busy: true });
  try {
    const before = s.viewFarm?.crops ?? [];
    const now = serverNow();
    const r = await withTimeout(backend().waterCrop(owner, 0, 0, newRequestId()));
    st().set({ viewFarm: r.farm, waterLogs: r.waterLogs, serverOffset: r.serverNow - Date.now() });
    bus.emit('farm:update', r.farm);
    before.filter((c) => c.readyAt > now).forEach((c) => bus.emit('fx:water', { x: c.x, y: c.y }));
    session.notifyFarmChanged();
    session.pingNotice(owner); // 농장 주인에게 "누가 물을 줬어요" 알림
    play('plant');
    st().toast(`💧 친구 밭 작물 ${r.count}개에 물을 줬어요! 모두 수확까지 5분 빨라졌어요. (이 밭은 30분 뒤에 다시)`, 'success');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

// ───────────────────────── 분수 소원 ─────────────────────────
const WISH_LINES = [
  '소원을 빌었더니 분수 바닥에서 동전이 반짝!',
  '퐁당! 소원을 빌었더니 행운의 동전이 떠올랐어요!',
  '무지개가 살짝 비치더니 동전이 반짝였어요!',
];
export async function makeWish() {
  try {
    const r = await withTimeout(backend().makeWish());
    const reward = r.reward ?? (r.won ? WISH.reward : 0);
    syncGold(r.gold);
    play('coin');
    bus.emit('fx:coins', { amount: reward });
    st().toast(`⛲ ${WISH_LINES[Math.floor(Math.random() * WISH_LINES.length)]} +${reward}G (1분 뒤에 다시 빌 수 있어요)`, 'gold');
  } catch (e) { fail(e); }
}


// ───────────────────────── 비료 ─────────────────────────
async function fertilize(x: number, y: number, fertId: string) {
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().useFertilizer(x, y, fertId, id));
    apply(r);
    play('plant');
    const f = FERT_MAP[fertId];
    bus.emit('fx:fertilize', { x, y, minutes: f?.minutes ?? 0 });
    session.notifyFarmChanged();
    st().toast(`${f?.name ?? '비료'}를 줬어요! 수확까지 ${f?.minutes ?? 0}분 빨라졌어요 🌱`, 'success');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

// ───────────────────────── 상점 품목 (비료 · 낚싯대 · 가구) ─────────────────────────
export async function buyItem(itemId: string, color: number, qty: number) {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().buyItem(itemId, color, qty, id));
    apply(r);
    play('buy');
    const furn = FURN_MAP[itemId];
    if (furn) st().toast(`${FURNITURE_COLORS[color]?.name} ${furn.name} ${qty}개를 샀어요! 집에서 "꾸미기"로 놓아 보세요 🏠`, 'success');
    else if (ROD_MAP[itemId]) st().toast(`${ROD_MAP[itemId].name}를 샀어요! 연못 앞에서 E를 눌러 낚시해 보세요 🎣`, 'success');
    else st().toast(`${shopItemName(itemId) ?? itemId} ${qty}개를 샀어요! 퀵슬롯에서 고른 뒤 자라는 작물에 E 🌱`, 'success');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

export async function sellFish(itemId: string, qty: number) {
  if (st().busy) return;
  st().set({ busy: true });
  try {
    const r = await econ((id) => backend().sellItem(itemId, qty, id));
    apply(r);
    play('coin');
    bus.emit('fx:coins', { amount: r.goldDelta ?? 0 });
    st().toast(`${shopItemName(itemId) ?? '물고기'} ${qty}마리를 팔아서 ${(r.goldDelta ?? 0).toLocaleString()}G를 벌었어요!`, 'gold');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

// ───────────────────────── 낚시 ─────────────────────────
let fishTimer: ReturnType<typeof setTimeout> | null = null;
let fishToken = 0;

/** 낚시 그만두기 (움직이거나 다른 곳으로 이동할 때) */
export function cancelFishing() {
  fishToken++;
  if (fishTimer) clearTimeout(fishTimer);
  fishTimer = null;
  if (st().fishing) { st().set({ fishing: null }); bus.emit('fish:end'); }
}

/** 찌 던지기: 서버가 입질 시각을 정해 줌 */
export async function startFishing() {
  const s = st();
  if (s.fishing || s.busy) return;
  const rod = bestRod(s.inventory);
  if (!rod) { fail(new Error('NO_ROD')); return; }
  const token = ++fishToken;
  s.set({ fishing: { phase: 'cast', rodTier: rod.tier } });
  play('click');
  try {
    const r = await withTimeout(backend().fishCast());
    if (token !== fishToken) return;
    const waitMs = Math.max(400, r.biteAt - r.serverNow);
    st().set({ fishing: { phase: 'wait', rodTier: r.tier }, serverOffset: r.serverNow - Date.now() });
    fishTimer = setTimeout(() => {
      if (token !== fishToken) return;
      st().set({ fishing: { phase: 'bite', rodTier: r.tier } });
      play('pop');
      bus.emit('fish:bite');
      fishTimer = setTimeout(() => {
        if (token !== fishToken) return;
        cancelFishing();
        play('error');
        st().toast('앗, 물고기가 도망갔어요! 찌가 "툭!" 하면 바로 E를 눌러 주세요 🐟');
      }, FISHING.biteWindowMs);
    }, waitMs);
  } catch (e) {
    if (token === fishToken) { cancelFishing(); fail(e); }
  }
}

/** 낚싯대 당기기 (E) */
export async function reelFishing() {
  const s = st();
  const f = s.fishing;
  if (!f) return;
  if (f.phase !== 'bite') {
    cancelFishing();
    play('error');
    s.toast(f.phase === 'cast' ? '찌를 던지는 중이에요. 잠깐만요!' : '너무 빨리 당겼어요! 찌가 "툭!" 하고 움직일 때 당겨 주세요 🎣');
    return;
  }
  fishToken++;
  if (fishTimer) clearTimeout(fishTimer);
  fishTimer = null;
  st().set({ fishing: null, busy: true });
  try {
    const r = await econ((id) => backend().fishReel(id));
    if (r.inventory) apply(r);
    if (r.escaped || !r.fish) {
      play('error');
      bus.emit('fish:caught', { fishId: null });
      st().toast('아깝다! 물고기가 빠져나갔어요. 다시 던져 봐요 🎣');
    } else {
      play('harvest');
      const def = FISH_MAP[r.fish];
      bus.emit('fish:caught', { fishId: r.fish });
      st().toast(`🎣 ${def?.name ?? '물고기'}를 낚았어요! (판매가 ${def?.price ?? 0}G · 판매소에서 팔 수 있어요)`, 'success');
    }
    if (r.rodBroken && r.rodId) {
      const next = bestRod(st().inventory);
      st().toast(`${ROD_MAP[r.rodId]?.name ?? '낚싯대'}를 다 썼어요! 🎣 ${next ? `이제 ${next.name}로 낚시해요.` : '씨앗 상점 낚시 코너에서 새로 사 주세요.'}`, 'info');
    } else if (r.rodId && r.rodUses?.[r.rodId] !== undefined && r.rodUses[r.rodId] <= 2) {
      st().toast(`${ROD_MAP[r.rodId]?.name} 남은 횟수 ${r.rodUses[r.rodId]}번! 🎣`, 'info');
    }
  } catch (e) { fail(e); } finally {
    st().set({ busy: false });
    bus.emit('fish:end');
  }
}

// ───────────────────────── 집 / 가구 ─────────────────────────
function myHouseHere() {
  const s = st();
  return houseOwnerOf(s.space) === s.profile?.id && s.viewHouse ? s.viewHouse : null;
}

export async function expandHouse() {
  const s = st();
  const h = myHouseHere();
  if (s.busy || !h) return;
  const next = HOUSE_LEVELS.find((l) => l.level === h.level + 1);
  if (!next) { s.toast('이미 최고 단계까지 넓혔어요!'); return; }
  s.set({ busy: true });
  try {
    const r = await econ((id) => backend().expandHouse(next.level, id));
    apply(r);
    play('expand');
    session.notifyFarmChanged();
    // 바닥이 넓어지니 집 안을 다시 그림
    st().set({ modal: null, housePlacing: null, sceneNonce: st().sceneNonce + 1 });
    st().toast(`집이 ${next.w}×${next.h}칸으로 넓어졌어요! 🎉 더 많은 가구를 놓아 보세요`, 'success');
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

/** 꾸미기 모드 켜기/끄기 */
export function setHouseEdit(on: boolean) {
  if (!myHouseHere()) return;
  st().set({ houseEdit: on, housePlacing: null });
  play(on ? 'open' : 'close');
}

/** 가방의 가구를 골라 놓을 준비 */
export function pickFurniture(furnId: string, color: number) {
  if (!myHouseHere()) return;
  st().set({ houseEdit: true, housePlacing: { furnId, color } });
  play('click');
}

/** 놓인 가구를 옮기려고 집어 들기 */
export function grabFurniture(id: number) {
  const h = myHouseHere();
  const it = h?.items.find((i) => i.id === id);
  if (!it) return;
  st().set({ housePlacing: { furnId: it.type, color: it.color, moveId: it.id } });
  play('pop');
}

/** 고른 가구를 (x, y) 칸에 놓기 / 옮기기 */
export async function placeAt(x: number, y: number) {
  const s = st();
  const p = s.housePlacing;
  if (!p || s.busy || !myHouseHere()) return;
  s.set({ busy: true });
  try {
    if (p.moveId) {
      const r = await withTimeout(backend().moveFurniture(p.moveId, x, y));
      st().set({ viewHouse: r.house, housePlacing: null });
      bus.emit('house:update', r.house);
      play('plant');
    } else {
      const r = await econ((id) => backend().placeFurniture(p.furnId, p.color, x, y, id));
      apply(r);
      play('plant');
      // 같은 가구가 더 있으면 계속 놓을 수 있게
      if (!(r.inventory[furnItemId(p.furnId, p.color)] > 0)) st().set({ housePlacing: null });
    }
    session.notifyFarmChanged();
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

/** 놓인 가구를 가방으로 */
export async function storeFurniture(id: number) {
  const s = st();
  if (s.busy || !myHouseHere()) return;
  s.set({ busy: true });
  try {
    const r = await withTimeout(backend().storeFurniture(id));
    apply(r);
    st().set({ housePlacing: null });
    play('close');
    session.notifyFarmChanged();
  } catch (e) { fail(e); } finally { st().set({ busy: false }); }
}

// ───────────────────────── 밤 · 마을 거지 ─────────────────────────
let robbing = false;
/** 거지에게 잡힘 → 서버가 돈을 뜯을지 결정 (밤 · 마을 · 거지마다 하루 1번) */
export async function beggarCaught(beggarId: number) {
  if (robbing) return;
  robbing = true;
  try {
    const r = await econ((id) => backend().beggarRob(beggarId, id));
    apply(r);
    const amt = r.amount ?? 0;
    st().set({ beggarRobbed: r.robbed ?? [...st().beggarRobbed, beggarId] });
    play('error');
    if (amt > 0) bus.emit('fx:coins', { amount: -amt });
    st().toast(amt > 0 ? `💸 마을 거지에게 돈을 갈취당했습니다! (-${amt}G)` : '💸 마을 거지가 주머니를 뒤졌지만 텅 비어 있었어요…', 'error');
    bus.emit('beggar:result', { id: beggarId, text: amt > 0 ? '히히, 잘 쓸게요~ 💸' : '에이, 빈털터리잖아!' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ALREADY_ROBBED|이미 돈을 뜯어/.test(msg)) st().set({ beggarRobbed: [...new Set([...st().beggarRobbed, beggarId])] });
    else if (!/NOT_NIGHT|WRONG_SPACE|밤에만|지금 있는 곳/.test(msg)) fail(e);
    bus.emit('beggar:result', { id: beggarId, text: null });
  } finally { robbing = false; }
}

/** 밤이 시작될 때 오늘 나를 털어 간 거지 목록 다시 불러오기 (날짜가 바뀌면 초기화) */
export async function refreshBeggars() {
  try { const r = await backend().beggarStatus(); st().set({ beggarRobbed: r.robbed }); } catch { /* 다음 밤에 */ }
}
