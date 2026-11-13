/** 체험 모드 서버(LocalServer)가 Supabase RPC 와 같은 규칙을 지키는지 검증 */
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDB, LocalServer } from '@/services/backend/localServer';

let now = 1_000_000;
let s: LocalServer;
const A = 'user-a', B = 'user-b';
let n = 0;
const rid = () => `req-${++n}-xxxxxxxx`;

const err = (fn: () => unknown) => { try { fn(); return 'NO_ERROR'; } catch (e) { return (e as { code?: string }).code ?? String(e); } };

beforeEach(() => {
  now = 1_000_000;
  const db = emptyDB();
  db.settings.maxPlayers = 2;
  s = new LocalServer(db, () => now);
  s.claimSlot(A, 'a@x.dev');
  s.claimSlot(B, 'b@x.dev');
  s.saveCharacter(A, '토끼농부', { hair: 0, hairColor: 0, skin: 0, outfit: 0, outfitColor: 0 });
  s.saveCharacter(B, '감자왕', { hair: 1, hairColor: 1, skin: 1, outfit: 1, outfitColor: 1 });
});

describe('슬롯', () => {
  it('정원 초과 시 full, 재요청은 같은 슬롯', () => {
    expect(s.claimSlot('c', 'c@x.dev')).toEqual({ status: 'full', max: 2 });
    expect(s.claimSlot(A, 'a@x.dev')).toEqual({ status: 'ok', slot: 1 });
  });
  it('allowlist 모드', () => {
    s.db.settings = { ...s.db.settings, maxPlayers: 5, signupMode: 'allowlist', allowlist: ['ok@x.dev'] };
    expect(s.claimSlot('c', 'c@x.dev')).toEqual({ status: 'not_approved' });
    expect(s.claimSlot('d', 'OK@x.dev').status).toBe('ok');
  });
  it('슬롯 없는 사용자는 아무것도 못 함', () => {
    expect(err(() => s.buySeed('zzz', 'carrot', 1, rid()))).toBe('NO_SLOT');
  });
  it('닉네임 검증 / 중복', () => {
    expect(err(() => s.saveCharacter(A, '감자왕', { hair: 0, hairColor: 0, skin: 0, outfit: 0, outfitColor: 0 }))).toBe('NICKNAME_TAKEN');
    expect(err(() => s.saveCharacter(A, '<b>', { hair: 0, hairColor: 0, skin: 0, outfit: 0, outfitColor: 0 }))).toBe('NICKNAME_INVALID');
  });
});

describe('경제', () => {
  it('구매: 서버 가격, 멱등성, 잔액 초과 불가', () => {
    const id = rid();
    expect(s.buySeed(A, 'carrot', 3, id).gold).toBe(240);
    expect(s.buySeed(A, 'carrot', 3, id).gold).toBe(240); // 재전송
    expect(s.loadState(A).profile.gold).toBe(240);
    expect(err(() => s.buySeed(A, 'watermelon', 1, rid()))).toBe('INSUFFICIENT_GOLD');
    expect(err(() => s.buySeed(A, 'carrot', 0, rid()))).toBe('INVALID_QTY');
    expect(err(() => s.buySeed(A, 'carrot', 1.5, rid()))).toBe('INVALID_QTY');
  });
  it('심기 → 시간 전 수확 불가 → 수확 → 중복 수확 불가 → 판매', () => {
    s.buySeed(A, 'carrot', 1, rid());
    s.plant(A, 1, 1, 'carrot', rid());
    expect(err(() => s.plant(A, 1, 1, 'carrot', rid()))).toBe('PLOT_OCCUPIED');
    expect(err(() => s.plant(A, 3, 0, 'carrot', rid()))).toBe('PLOT_LOCKED');
    expect(err(() => s.harvest(A, 1, 1, rid()))).toBe('NOT_READY');
    now += 29_000;
    expect(err(() => s.harvest(A, 1, 1, rid()))).toBe('NOT_READY');
    now += 1_000;
    const r = s.harvest(A, 1, 1, rid());
    expect(r.inventory['crop:carrot']).toBe(1);
    expect(err(() => s.harvest(A, 1, 1, rid()))).toBe('PLOT_EMPTY');
    expect(s.sell(A, 'carrot', 1, rid()).gold).toBe(300 - 20 + 35);
    expect(err(() => s.sell(A, 'carrot', 1, rid()))).toBe('NOT_ENOUGH_ITEMS');
  });
  it('남의 밭은 건드릴 수 없음 (호출자 본인 농장만 대상)', () => {
    s.buySeed(A, 'carrot', 1, rid());
    s.plant(A, 0, 0, 'carrot', rid());
    now += 60_000;
    expect(err(() => s.harvest(B, 0, 0, rid()))).toBe('PLOT_EMPTY');
    expect(s.getFarm(B, A).farm.crops).toHaveLength(1); // 구경은 가능
  });
  it('확장: 순서대로만, 비용 차감, 기존 작물 유지', () => {
    s.buySeed(A, 'carrot', 1, rid());
    s.plant(A, 2, 2, 'carrot', rid());
    expect(err(() => s.expandFarm(A, 2, rid()))).toBe('INSUFFICIENT_GOLD');
    s.db.profiles[A].gold = 5000;
    expect(err(() => s.expandFarm(A, 3, rid()))).toBe('INVALID_LEVEL');
    const r = s.expandFarm(A, 2, rid());
    expect(r.farm!.size).toBe(4);
    expect(r.farm!.crops).toHaveLength(1);
    expect(r.gold).toBe(4500);
    expect(err(() => s.expandFarm(A, 2, rid()))).toBe('INVALID_LEVEL');
  });
  it('전체 판매', () => {
    s.db.inventory[A]['crop:potato'] = 2;
    s.db.inventory[A]['crop:corn'] = 1;
    expect(s.sellAll(A, rid()).goldDelta).toBe(2 * 60 + 275);
    expect(err(() => s.sellAll(A, rid()))).toBe('NOTHING_TO_SELL');
  });
  it('일일 퀘스트: 진행도, 보상 1회', () => {
    s.db.profiles[A].gold = 1000;
    s.buySeed(A, 'carrot', 10, rid());
    for (let i = 0; i < 9; i++) s.plant(A, i % 3, Math.floor(i / 3), 'carrot', rid());
    expect(err(() => s.claimQuest(A, 'plant_any_10', rid()))).toBe('QUEST_NOT_DONE');
    s.db.profiles[A].gold += 2000;
    s.expandFarm(A, 2, rid());
    s.plant(A, 3, 3, 'carrot', rid());
    const before = s.loadState(A).profile.gold;
    expect(s.claimQuest(A, 'plant_any_10', rid()).gold).toBe(before + 80);
    expect(err(() => s.claimQuest(A, 'plant_any_10', rid()))).toBe('QUEST_CLAIMED');
  });
});

describe('채팅', () => {
  it('정리 / 길이 / 공간 / 도배', () => {
    s.startSession(A);
    expect(s.sendChat(A, 'village', '  안녕\n\n친구들 ').body).toBe('안녕 친구들');
    expect(err(() => s.sendChat(A, 'village', '가'.repeat(101)))).toBe('CHAT_TOO_LONG');
    expect(err(() => s.sendChat(A, `farm:${B}`, '안녕'))).toBe('WRONG_SPACE');
    for (let i = 0; i < 4; i++) s.sendChat(A, 'village', `${i}`);
    expect(err(() => s.sendChat(A, 'village', '또'))).toBe('CHAT_RATE_LIMIT');
    now += 6000;
    expect(s.sendChat(A, 'village', '이제 됨').nickname).toBe('토끼농부');
  });
});

describe('보관함 / 주민 게시판 (체험 모드)', () => {
  it('보관함: 주인만 넣고 빼기, 다른 주민은 구경', () => {
    s.db.inventory[A]['crop:corn'] = 4;
    const r = s.depositStorage(A, 'crop:corn', 3, rid());
    expect(r.inventory['crop:corn']).toBe(1);
    expect(r.storage).toEqual({ 'crop:corn': 3 });
    expect(err(() => s.depositStorage(A, 'crop:corn', 2, rid()))).toBe('NOT_ENOUGH_ITEMS');
    expect(err(() => s.depositStorage(A, 'tool:hoe', 1, rid()))).toBe('INVALID_ITEM');
    expect(err(() => s.withdrawStorage(A, 'crop:corn', 4, rid()))).toBe('NOT_ENOUGH_STORED');
    expect(err(() => s.withdrawStorage(B, 'crop:corn', 1, rid()))).toBe('NOT_ENOUGH_STORED'); // B 는 자기 보관함만
    s.withdrawStorage(A, 'crop:corn', 1, rid());
    const v = s.getStorage(B, A);
    expect(v.items).toEqual({ 'crop:corn': 2 });
    expect(v.recent.map((x) => `${x.kind}:${x.qty}`)).toEqual(['withdraw:1', 'deposit:3']);
  });
  it('게시판: 작성·정리·도배 방지·내 글만 삭제·차단', () => {
    expect(err(() => s.createBoardPost(A, '  \n ')).toString()).toBe('BOARD_EMPTY');
    expect(err(() => s.createBoardPost(A, '가'.repeat(201)))).toBe('BOARD_TOO_LONG');
    s.createBoardPost(A, ' 내일 광장에서 만나요!\r\n\n\n\n🍉 ');
    expect(err(() => s.createBoardPost(A, '또'))).toBe('BOARD_RATE_LIMIT');
    const [post] = s.listBoardPosts(B);
    expect(post).toMatchObject({ nickname: '토끼농부', body: '내일 광장에서 만나요!\n\n🍉' });
    expect(err(() => s.deleteBoardPost(B, post.id))).toBe('INVALID_TARGET');
    s.setBlocked(B, A, true);
    expect(s.listBoardPosts(B)).toHaveLength(0);
    s.deleteBoardPost(A, post.id);
    expect(s.listBoardPosts(A)).toHaveLength(0);
  });
});

describe('농장 방명록 (체험 모드)', () => {
  it('방문 중인 친구만 쓰기, 주인/글쓴이만 지우기', () => {
    s.startSession(B);
    expect(err(() => s.writeGuestbook(B, A, '안녕'))).toBe('WRONG_SPACE');
    s.enterSpace(B, `farm:${A}`);
    expect(err(() => s.writeGuestbook(A, A, '셀프'))).toBe('OWN_GUESTBOOK');
    expect(err(() => s.writeGuestbook(B, A, '가'.repeat(121)))).toBe('GUESTBOOK_TOO_LONG');
    s.writeGuestbook(B, A, ' 놀러 왔어요!\n또 올게요 ');
    expect(err(() => s.writeGuestbook(B, A, '또'))).toBe('GUESTBOOK_RATE_LIMIT');
    const [g] = s.listGuestbook(A, A);
    expect(g).toMatchObject({ nickname: '감자왕', body: '놀러 왔어요! 또 올게요' });
    s.deleteGuestbookEntry(A, g.id);
    expect(s.listGuestbook(B, A)).toHaveLength(0);
  });
});

describe('과일 나무 / 카지노 (체험 모드)', () => {
  it('과일: 30G, 30분 대기, 장소 확인', () => {
    s.startSession(A);
    const g0 = s.loadState(A).profile.gold;
    expect(s.pickFruit(A, 'v:4,31', rid()).gold).toBe(g0 + 30);
    expect(err(() => s.pickFruit(A, 'v:4,31', rid()))).toBe('FRUIT_NOT_READY');
    expect(err(() => s.pickFruit(A, 'f:27,13', rid()))).toBe('NOT_OWNER');
    now += 30 * 60 * 1000 + 1;
    expect(s.pickFruit(A, 'v:4,31', rid()).gold).toBe(g0 + 60);
  });
  it('카지노: 같은 참가비·모집 채팅·준비 해제·추첨·골드 보존', () => {
    s.startSession(A); s.startSession(B);
    s.db.profiles[A].gold = 1000; s.db.profiles[B].gold = 1000;
    let st = s.casinoJoin(A, 100, rid());
    expect(st.round.stake).toBe(100);
    expect(s.lastRecruit?.body).toContain('100G 판을 모집해요');
    expect(err(() => s.casinoJoin(B, 300, rid()))).toBe('CASINO_STAKE_CHANGED');
    s.casinoReady(A, true);
    st = s.casinoJoin(B, 100, rid()); // 새 사람 → 모두 준비 해제
    expect(st.round.bets.every((b) => !b.ready)).toBe(true);
    s.casinoReady(A, true);
    st = s.casinoReady(B, true, () => 0.2); // 0.2 × 200 = 40 < 100 → A 당첨
    expect(st.last).toMatchObject({ winnerId: A, pot: 200 });
    expect(s.db.profiles[A].gold + s.db.profiles[B].gold).toBe(2000);
    expect(st.round.stake).toBeNull();
  });
});

describe('물 주기 / 분수 소원 (체험 모드)', () => {
  it('친구 밭 물 주기: 5분 단축, 친구마다 30분, 두 명이면 10분', () => {
    const C = 'user-c';
    s.db.settings.maxPlayers = 3;
    s.claimSlot(C, 'c@x.dev');
    s.saveCharacter(C, '딸기소녀', { hair: 0, hairColor: 0, skin: 0, outfit: 0, outfitColor: 0 });
    s.db.farms[A].crops.push({ x: 1, y: 1, cropId: 'watermelon', plantedAt: now, readyAt: now + 20 * 60_000 });
    expect(err(() => s.waterCrop(B, A, 1, 1, rid()))).toBe('WRONG_SPACE');
    s.enterSpace(B, `farm:${A}`); s.enterSpace(C, `farm:${A}`); s.enterSpace(A, `farm:${A}`);
    s.waterCrop(B, A, 1, 1, rid());
    expect(err(() => s.waterCrop(B, A, 1, 1, rid()))).toBe('WATER_COOLDOWN');
    const r = s.waterCrop(C, A, 0, 0, rid());
    expect(r.count).toBe(1);
    expect(s.listNotices(A, 0).map((n) => n.body.slice(0, 18))).toEqual(['감자왕님이 내 밭에 물을 줬어요!', '딸기소녀님이 내 밭에 물을 줬어요']);
    expect(s.listNotices(B, 0)).toHaveLength(0);
    expect(r.farm.crops.find((c) => c.x === 1 && c.y === 1)!.readyAt).toBe(now + 10 * 60_000);
    expect(err(() => s.waterCrop(A, A, 1, 1, rid()))).toBe('OWN_FARM_WATER');
    now += 31 * 60_000; // 작물도 다 자람
    expect(err(() => s.waterCrop(B, A, 0, 0, rid()))).toBe('NOTHING_TO_WATER');
  });
  it('분수: 1분에 한 번, 30G 확정', () => {
    s.startSession(A);
    const g0 = s.loadState(A).profile.gold;
    expect(s.makeWish(A)).toMatchObject({ won: true, reward: 30, gold: g0 + 30 });
    expect(err(() => s.makeWish(A))).toBe('WISH_COOLDOWN');
    now += 61_000;
    expect(s.makeWish(A)).toMatchObject({ gold: g0 + 60 });
  });
});
