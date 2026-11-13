/**
 * Supabase 마이그레이션 SQL 을 PGlite(WASM PostgreSQL)에서 실제로 실행해
 * RPC 경제 로직과 RLS/권한 정책을 검증합니다.
 * (auth.uid(), auth.users, realtime 스키마는 Supabase 와 같은 형태의 최소 스텁으로 대체)
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIG_DIR = path.resolve(__dirname, '../../supabase/migrations');
const migrationSql = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n');

const PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create publication supabase_realtime;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean);
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
`;

let db: PGlite;
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
let reqN = 0;
const req = () => `req-${Date.now()}-${++reqN}`;

/** 특정 사용자(authenticated 역할)로 쿼리 실행 */
async function as<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}
async function rpc<T = unknown>(uid: string | null, fn: string, args: unknown[] = []): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await as<{ v: T }>(uid, `select public.${fn}(${ph}) as v`, args);
  return r.rows[0].v;
}
async function rpcErr(uid: string | null, fn: string, args: unknown[] = []): Promise<string> {
  try {
    await rpc(uid, fn, args);
  } catch (e) {
    return (e as Error).message;
  }
  return 'NO_ERROR';
}
const state = (uid: string) => rpc<{ profile: { gold: number }; inventory: Record<string, number>; farm: { size: number; crops: unknown[] } }>(uid, 'get_my_state');

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(PRELUDE);
  await db.exec(migrationSql);
  await db.exec(`insert into auth.users (id, email) values
    ('${A}', 'a@test.dev'), ('${B}', 'b@test.dev'), ('${C}', 'c@test.dev'), ('${D}', 'd@test.dev')`);
  await db.exec(`update public.game_settings set max_players = 2`);
}, 60000);

describe('플레이어 슬롯', () => {
  it('비로그인 사용자는 슬롯을 받을 수 없다', async () => {
    expect(await rpcErr(null, 'claim_player_slot')).toMatch(/NOT_AUTHENTICATED|permission denied/);
  });
  it('정원(2명)까지만 배정되고 초과 시 full', async () => {
    expect(await rpc(A, 'claim_player_slot')).toEqual({ status: 'ok', slot: 1 });
    expect(await rpc(A, 'claim_player_slot')).toEqual({ status: 'ok', slot: 1 }); // 재호출 = 같은 슬롯
    expect(await rpc(B, 'claim_player_slot')).toEqual({ status: 'ok', slot: 2 });
    expect(await rpc(C, 'claim_player_slot')).toEqual({ status: 'full', max: 2 });
  });
  it('allowlist 모드에서는 승인된 이메일만 배정', async () => {
    await db.exec(`update public.game_settings set max_players = 10, signup_mode = 'allowlist'`);
    expect(await rpc(C, 'claim_player_slot')).toEqual({ status: 'not_approved' });
    await db.exec(`insert into public.player_allowlist (email) values ('C@test.dev')`);
    expect(await rpc(C, 'claim_player_slot')).toEqual({ status: 'ok', slot: 3 });
    await db.exec(`update public.game_settings set max_players = 3, signup_mode = 'open'`);
  });
  it('슬롯 없는 사용자는 게임 RPC 사용 불가', async () => {
    expect(await rpcErr(D, 'get_my_state')).toContain('NO_SLOT');
    expect(await rpcErr(D, 'save_character', ['디디', '{}'])).toContain('NO_SLOT');
  });
});

describe('캐릭터', () => {
  it('닉네임 검증과 중복 방지', async () => {
    expect(await rpcErr(A, 'save_character', ['a', '{}'])).toContain('NICKNAME_INVALID');
    expect(await rpcErr(A, 'save_character', ['<script>', '{}'])).toContain('NICKNAME_INVALID');
    await rpc(A, 'save_character', ['토끼농부', JSON.stringify({ hair: 3, hairColor: 2, skin: 0, outfit: 1, outfitColor: 7 })]);
    await rpc(B, 'save_character', ['감자왕', JSON.stringify({ hair: 999, skin: 'x' })]);
    await rpc(C, 'save_character', ['딸기소녀', '{}']);
    expect(await rpcErr(B, 'save_character', ['토끼농부', '{}'])).toContain('NICKNAME_TAKEN');
    const b = await rpc<{ appearance: { hair: number; skin: number } }>(B, 'get_my_character');
    expect(b.appearance.hair).toBe(0); // 범위 밖 값은 서버에서 정규화
    expect(b.appearance.skin).toBe(1);
  });
  it('신규 플레이어는 300G, 3x3 농장, 기본 도구로 시작', async () => {
    const s = await state(A);
    expect(s.profile.gold).toBe(300);
    expect(s.farm.size).toBe(3);
    expect(s.inventory['tool:hoe']).toBe(1);
  });
});

describe('경제 RPC', () => {
  it('씨앗 구매: 서버 가격으로 차감, 같은 request_id 재전송은 한 번만 처리', async () => {
    const id = req();
    const r1 = await rpc<{ gold: number; inventory: Record<string, number> }>(A, 'buy_seed', ['carrot', 3, id]);
    expect(r1.gold).toBe(240);
    expect(r1.inventory['seed:carrot']).toBe(3);
    const r2 = await rpc<{ gold: number }>(A, 'buy_seed', ['carrot', 3, id]);
    expect(r2.gold).toBe(240);
    expect((await state(A)).profile.gold).toBe(240);
  });
  it('잔액 초과 구매 불가 / 잘못된 수량 불가', async () => {
    expect(await rpcErr(A, 'buy_seed', ['watermelon', 1, req()])).toContain('INSUFFICIENT_GOLD');
    expect(await rpcErr(A, 'buy_seed', ['carrot', 0, req()])).toContain('INVALID_QTY');
    expect(await rpcErr(A, 'buy_seed', ['carrot', -5, req()])).toContain('INVALID_QTY');
    expect(await rpcErr(A, 'buy_seed', ['gold_bar', 1, req()])).toContain('UNKNOWN_CROP');
    expect((await state(A)).profile.gold).toBe(240);
  });
  it('연속 구매 요청이 잔액을 넘지 않는다', async () => {
    // B: 300G, 감자 35G → 최대 8개
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => rpc(B, 'buy_seed', ['potato', 1, req()])));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(8);
    expect((await state(B)).profile.gold).toBe(300 - 8 * 35);
  });
  it('심기: 해금된 빈 밭 + 보유 씨앗 필요', async () => {
    await rpc(A, 'plant_crop', [0, 0, 'carrot', req()]);
    expect(await rpcErr(A, 'plant_crop', [0, 0, 'carrot', req()])).toContain('PLOT_OCCUPIED');
    expect(await rpcErr(A, 'plant_crop', [5, 5, 'carrot', req()])).toContain('PLOT_LOCKED');
    expect(await rpcErr(A, 'plant_crop', [1, 0, 'potato', req()])).toContain('NOT_ENOUGH_SEEDS');
    const s = await state(A);
    expect(s.inventory['seed:carrot']).toBe(2);
    expect(s.farm.crops).toHaveLength(1);
  });
  it('수확: 서버 시간 기준으로만 가능, 중복 수확 불가', async () => {
    expect(await rpcErr(A, 'harvest_crop', [0, 0, req()])).toContain('NOT_READY');
    // 타인(B)은 A 의 밭을 지정할 방법이 없음: RPC 는 항상 호출자 본인 농장만 대상으로 함
    expect(await rpcErr(B, 'harvest_crop', [0, 0, req()])).toContain('PLOT_EMPTY');
    await db.exec(`update public.planted_crops set ready_at = now() - interval '1 second' where owner_id = '${A}'`);
    const id = req();
    const r = await rpc<{ inventory: Record<string, number> }>(A, 'harvest_crop', [0, 0, id]);
    expect(r.inventory['crop:carrot']).toBe(1);
    const again = await rpc<{ inventory: Record<string, number> }>(A, 'harvest_crop', [0, 0, id]); // 재시도
    expect(again.inventory['crop:carrot']).toBe(1);
    expect(await rpcErr(A, 'harvest_crop', [0, 0, req()])).toContain('PLOT_EMPTY');
    expect((await state(A)).inventory['crop:carrot']).toBe(1);
  });
  it('판매: 보유 수량까지만, 골드 증가', async () => {
    expect(await rpcErr(A, 'sell_crop', ['carrot', 2, req()])).toContain('NOT_ENOUGH_ITEMS');
    const r = await rpc<{ gold: number; goldDelta: number }>(A, 'sell_crop', ['carrot', 1, req()]);
    expect(r.gold).toBe(275);
    expect(r.goldDelta).toBe(35);
    expect(await rpcErr(A, 'sell_all_crops', [req()])).toContain('NOTHING_TO_SELL');
  });
  it('전체 판매', async () => {
    await db.exec(`insert into public.inventory_items values ('${C}', 'crop:potato', 2), ('${C}', 'crop:corn', 1)`);
    const r = await rpc<{ gold: number; goldDelta: number }>(C, 'sell_all_crops', [req()]);
    expect(r.goldDelta).toBe(2 * 60 + 275);
    expect(r.gold).toBe(300 + 395);
  });
  it('농장 확장: 순서대로만, 잔액 필요, 기존 작물 유지', async () => {
    expect(await rpcErr(A, 'expand_farm', [2, req()])).toContain('INSUFFICIENT_GOLD');
    await db.exec(`update public.profiles set gold = 2000 where id = '${A}'`);
    expect(await rpcErr(A, 'expand_farm', [3, req()])).toContain('INVALID_LEVEL');
    await rpc(A, 'plant_crop', [2, 2, 'carrot', req()]);
    const r = await rpc<{ gold: number; farm: { size: number; level: number; crops: unknown[] } }>(A, 'expand_farm', [2, req()]);
    expect(r.gold).toBe(1500);
    expect(r.farm.size).toBe(4);
    expect(r.farm.crops).toHaveLength(1);
    expect(await rpcErr(A, 'expand_farm', [2, req()])).toContain('INVALID_LEVEL'); // 중복 확장
    await rpc(A, 'plant_crop', [3, 3, 'carrot', req()]); // 새로 해금된 밭
  });
});

describe('RLS / 직접 조작 방지', () => {
  it('클라이언트는 골드/인벤토리/작물 테이블에 직접 쓸 수 없다', async () => {
    await expect(as(A, `update public.profiles set gold = 999999 where id = '${A}'`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into public.inventory_items values ('${A}', 'crop:watermelon', 99)`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `update public.planted_crops set ready_at = now()`)).rejects.toThrow(/permission denied/);
    await expect(as(B, `delete from public.planted_crops where owner_id = '${A}'`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `update public.player_slots set active = true`)).rejects.toThrow(/permission denied/);
  });
  it('남의 인벤토리/거래내역은 보이지 않고, 농장은 조회 가능', async () => {
    const inv = await as<{ player_id: string }>(B, `select player_id from public.inventory_items`);
    expect(inv.rows.every((r) => r.player_id === B)).toBe(true);
    const tx = await as(B, `select * from public.economy_transactions where player_id = '${A}'`);
    expect(tx.rows).toHaveLength(0);
    const prof = await as(B, `select * from public.profiles where id = '${A}'`);
    expect(prof.rows).toHaveLength(0); // 골드가 담긴 프로필은 본인만
    const farm = await rpc<{ farm: { ownerNickname: string; crops: unknown[] } }>(B, 'get_farm', [A]);
    expect(farm.farm.ownerNickname).toBe('토끼농부');
    expect(farm.farm.crops.length).toBeGreaterThan(0);
  });
  it('내부 헬퍼 함수는 직접 호출할 수 없다', async () => {
    expect(await rpcErr(A, '_add_item', [A, 'crop:watermelon', 100])).toMatch(/permission denied/);
    expect(await rpcErr(A, 'admin_release_slot', [B])).toContain('NOT_ADMIN');
  });
  it('슬롯이 비활성화되면 모든 RPC 차단', async () => {
    await db.exec(`update public.player_slots set active = false where user_id = '${C}'`);
    expect(await rpcErr(C, 'buy_seed', ['carrot', 1, req()])).toContain('NO_SLOT');
    expect(await rpc(C, 'claim_player_slot')).toEqual({ status: 'inactive' });
    await db.exec(`update public.player_slots set active = true where user_id = '${C}'`);
  });
});

describe('채팅', () => {
  it('공간 검증, 길이 제한, 정리, 서버가 닉네임을 채움', async () => {
    await rpc(A, 'start_session');
    expect(await rpcErr(A, 'send_chat', [`farm:${B}`, '안녕'])).toContain('WRONG_SPACE');
    expect(await rpcErr(A, 'send_chat', ['village', '   '])).toContain('CHAT_EMPTY');
    expect(await rpcErr(A, 'send_chat', ['village', '가'.repeat(101)])).toContain('CHAT_TOO_LONG');
    await rpc(A, 'send_chat', ['village', '  안녕\n   <b>친구들</b>  ']);
    const m = await as<{ nickname: string; body: string; sender_id: string }>(B, `select nickname, body, sender_id from public.chat_messages order by id desc limit 1`);
    expect(m.rows[0]).toEqual({ nickname: '토끼농부', body: '안녕 <b>친구들</b>', sender_id: A });
  });
  it('도배 방지 (5초에 5개)', async () => {
    for (let i = 0; i < 4; i++) await rpc(A, 'send_chat', ['village', `메시지 ${i}`]);
    expect(await rpcErr(A, 'send_chat', ['village', '하나 더'])).toContain('CHAT_RATE_LIMIT');
  });
  it('차단한 사람의 메시지는 서버에서 걸러진다', async () => {
    await rpc(B, 'set_block', [A, true]);
    const m = await as(B, `select * from public.chat_messages where sender_id = '${A}'`);
    expect(m.rows).toHaveLength(0);
    await rpc(B, 'set_block', [A, false]);
  });
  it('농장 방문 공간 이동', async () => {
    await rpc(B, 'enter_space', [`farm:${A}`]);
    await rpc(B, 'send_chat', [`farm:${A}`, '놀러왔어요']);
    expect(await rpcErr(B, 'enter_space', ['farm:not-a-uuid'])).toContain('INVALID_TARGET');
  });
});

describe('일일 퀘스트', () => {
  it('진행도 계산과 보상 중복 방지', async () => {
    const qs = await rpc<{ id: string; progress: number; claimed: boolean }[]>(A, 'get_daily_quests');
    const plant = qs.find((q) => q.id === 'plant_any_10')!;
    expect(plant.progress).toBe(3);
    expect(await rpcErr(A, 'claim_quest', ['plant_any_10', req()])).toContain('QUEST_NOT_DONE');
    await db.exec(`update public.profiles set gold = gold + 1000 where id = '${A}'`);
    await rpc(A, 'buy_seed', ['carrot', 10, req()]);
    const before = (await state(A)).profile.gold;
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2]]) await rpc(A, 'plant_crop', [x, y, 'carrot', req()]);
    const r = await rpc<{ gold: number }>(A, 'claim_quest', ['plant_any_10', req()]);
    expect(r.gold).toBe(before + 80);
    expect(await rpcErr(A, 'claim_quest', ['plant_any_10', req()])).toContain('QUEST_CLAIMED');
  });
});

describe('Realtime 권한 정책', () => {
  it('활성 주민만 space 채널을 수신할 수 있다', async () => {
    await db.exec(`insert into realtime.messages (topic, extension) values ('space:village', 'broadcast')`);
    await db.exec(`select set_config('realtime.topic', 'space:village', false)`);
    const ok = await as(A, `select * from realtime.messages`);
    expect(ok.rows.length).toBe(1);
    const denied = await as(D, `select * from realtime.messages`);
    expect(denied.rows.length).toBe(0);
  });
});

describe('보관함 (구 출하 상자)', () => {
  it('주인만 넣고 빼기, 수량 검증, 멱등성', async () => {
    await db.exec(`insert into public.inventory_items values ('${A}', 'crop:corn', 5) on conflict (player_id, item_id) do update set quantity = 5`);
    const id = req();
    const r = await rpc<{ inventory: Record<string, number>; storage: Record<string, number> }>(A, 'storage_deposit', ['crop:corn', 3, id]);
    expect(r.inventory['crop:corn']).toBe(2);
    expect(r.storage['crop:corn']).toBe(3);
    const again = await rpc<{ storage: Record<string, number> }>(A, 'storage_deposit', ['crop:corn', 3, id]); // 재전송
    expect(again.storage['crop:corn']).toBe(3);
    expect(await rpcErr(A, 'storage_deposit', ['crop:corn', 5, req()])).toContain('NOT_ENOUGH_ITEMS');
    expect(await rpcErr(A, 'storage_deposit', ['tool:hoe', 1, req()])).toContain('INVALID_ITEM');
    expect(await rpcErr(A, 'storage_deposit', ['crop:gold_bar', 1, req()])).toContain('INVALID_ITEM');
    expect(await rpcErr(A, 'storage_withdraw', ['crop:corn', 4, req()])).toContain('NOT_ENOUGH_STORED');
    const w = await rpc<{ inventory: Record<string, number>; storage: Record<string, number> }>(A, 'storage_withdraw', ['crop:corn', 1, req()]);
    expect(w.inventory['crop:corn']).toBe(3);
    expect(w.storage['crop:corn']).toBe(2);
  });
  it('다른 주민은 구경만 (내용 + 최근 기록), 직접 수정 불가', async () => {
    const v = await rpc<{ ownerNickname: string; items: Record<string, number>; recent: { kind: string; itemId: string; qty: number }[] }>(B, 'get_storage', [A]);
    expect(v.ownerNickname).toBe('토끼농부');
    expect(v.items['crop:corn']).toBe(2);
    expect(v.recent[0]).toMatchObject({ kind: 'withdraw', itemId: 'crop:corn', qty: 1 });
    expect(v.recent[1]).toMatchObject({ kind: 'deposit', itemId: 'crop:corn', qty: 3 });
    // B 가 꺼내려 해도 항상 "자기" 보관함만 대상 → 없음
    expect(await rpcErr(B, 'storage_withdraw', ['crop:corn', 1, req()])).toContain('NOT_ENOUGH_STORED');
    await expect(as(B, `update public.storage_items set quantity = 999 where owner_id = '${A}'`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into public.storage_items values ('${A}', 'crop:watermelon', 99)`)).rejects.toThrow(/permission denied/);
    expect(await rpcErr(A, '_storage_json', [A])).toMatch(/permission denied/);
  });
});

describe('주민 게시판', () => {
  it('작성 · 정리 · 길이 · 도배 방지 · 모두가 읽기', async () => {
    expect(await rpcErr(A, 'create_board_post', ['   \n  '])).toContain('BOARD_EMPTY');
    expect(await rpcErr(A, 'create_board_post', ['가'.repeat(201)])).toContain('BOARD_TOO_LONG');
    await rpc(A, 'create_board_post', ['  내일 같이 수박 심어요!\r\n\n\n\n9시에 광장에서 🍉  ']);
    expect(await rpcErr(A, 'create_board_post', ['한 번 더'])).toContain('BOARD_RATE_LIMIT');
    const posts = await rpc<{ id: number; nickname: string; body: string; authorId: string }[]>(C, 'list_board_posts');
    expect(posts[0]).toMatchObject({ nickname: '토끼농부', body: '내일 같이 수박 심어요!\n\n9시에 광장에서 🍉', authorId: A });
    expect(await rpcErr(null, 'list_board_posts')).toMatch(/NOT_AUTHENTICATED|permission denied/);
  });
  it('내 글만 지울 수 있음, 직접 쓰기 불가, 차단한 사람 글은 안 보임', async () => {
    const [post] = await rpc<{ id: number }[]>(B, 'list_board_posts');
    expect(await rpcErr(B, 'delete_board_post', [post.id])).toContain('INVALID_TARGET');
    await expect(as(B, `insert into public.board_posts (author_id, nickname, body) values ('${A}', '토끼농부', '사칭')`)).rejects.toThrow(/permission denied/);
    await rpc(B, 'set_block', [A, true]);
    expect((await rpc<unknown[]>(B, 'list_board_posts')).length).toBe(0);
    await rpc(B, 'set_block', [A, false]);
    await rpc(A, 'delete_board_post', [post.id]);
    expect((await rpc<unknown[]>(B, 'list_board_posts')).length).toBe(0);
  });
});

describe('농장 방명록', () => {
  it('그 농장에 놀러 온 친구만 쓰기, 주인은 못 씀, 모두 읽기', async () => {
    await rpc(B, 'enter_space', [`farm:${A}`]);
    expect(await rpcErr(C, 'write_guestbook', [A, '안녕!'])).toContain('WRONG_SPACE'); // C 는 마을에 있음
    expect(await rpcErr(A, 'write_guestbook', [A, '내 방명록'])).toContain('OWN_GUESTBOOK');
    expect(await rpcErr(B, 'write_guestbook', [A, '  '])).toContain('GUESTBOOK_EMPTY');
    expect(await rpcErr(B, 'write_guestbook', [A, '가'.repeat(121)])).toContain('GUESTBOOK_TOO_LONG');
    await rpc(B, 'write_guestbook', [A, '  농장  예뻐요!\n또 올게요 🌻 ']);
    expect(await rpcErr(B, 'write_guestbook', [A, '하나 더'])).toContain('GUESTBOOK_RATE_LIMIT');
    const list = await rpc<{ id: number; nickname: string; body: string; authorId: string }[]>(C, 'list_guestbook', [A]);
    expect(list[0]).toMatchObject({ nickname: '감자왕', body: '농장 예뻐요! 또 올게요 🌻', authorId: B });
    await expect(as(B, `insert into public.guestbook_entries (owner_id, author_id, nickname, body) values ('${A}', '${C}', '딸기소녀', '사칭')`)).rejects.toThrow(/permission denied/);
  });
  it('지우기: 글쓴이·농장 주인만', async () => {
    const [entry] = await rpc<{ id: number }[]>(A, 'list_guestbook', [A]);
    expect(await rpcErr(C, 'delete_guestbook_entry', [entry.id])).toContain('INVALID_TARGET');
    await rpc(A, 'delete_guestbook_entry', [entry.id]); // 농장 주인이 지움
    expect(await rpc<unknown[]>(B, 'list_guestbook', [A])).toHaveLength(0);
  });
});

describe('과일 나무', () => {
  const gold = async (u: string) => (await state(u)).profile.gold;
  it('나무마다 30G, 30분에 한 번, 장소 확인', async () => {
    await rpc(A, 'enter_space', ['village']);
    const g0 = await gold(A);
    const r = await rpc<{ gold: number; goldDelta: number; fruitPicks: Record<string, number> }>(A, 'pick_fruit', ['v:4,31', req()]);
    expect(r.goldDelta).toBe(30);
    expect(r.gold).toBe(g0 + 30);
    expect(Object.keys(r.fruitPicks)).toContain('v:4,31');
    expect(await rpcErr(A, 'pick_fruit', ['v:4,31', req()])).toContain('FRUIT_NOT_READY');
    expect(await rpcErr(A, 'pick_fruit', ['v:99,99', req()])).toContain('INVALID_TARGET');
    expect(await rpcErr(A, 'pick_fruit', ['f:27,13', req()])).toContain('NOT_OWNER'); // 농장 나무는 내 농장에서만
    await db.exec(`update public.fruit_picks set picked_at = now() - interval '31 minutes' where player_id = '${A}'`);
    await rpc(A, 'pick_fruit', ['v:4,31', req()]);
    await rpc(A, 'enter_space', [`farm:${A}`]);
    await rpc(A, 'pick_fruit', ['f:27,13', req()]);
    expect(await rpcErr(A, 'pick_fruit', ['v:7,33', req()])).toContain('WRONG_SPACE'); // 농장에서 마을 나무는 못 땀
    const st = await rpc<{ picks: Record<string, number> }>(A, 'fruit_status');
    expect(Object.keys(st.picks).sort()).toEqual(['f:27,13', 'v:4,31']);
    expect(await gold(A)).toBe(g0 + 90);
    await rpc(A, 'enter_space', ['village']);
    await expect(as(A, `update public.fruit_picks set picked_at = now() - interval '1 day'`)).rejects.toThrow(/permission denied/);
  });
});

describe('햇살 카지노 (같은 참가비)', () => {
  const gold = async (u: string) => (await state(u)).profile.gold;
  type CS = { round: { id: number; pot: number; stake: number | null; bets: { playerId: string; amount: number; ready: boolean }[] }; last: { id: number; pot: number; winnerId: string; roll: number } | null };
  it('판을 연 사람이 참가비를 정하고, 나머지는 같은 금액으로만 참가 + 모집 채팅', async () => {
    await rpc(B, 'enter_space', ['village']);
    await rpc(C, 'start_session');
    await db.exec(`update public.profiles set gold = 1000 where id in ('${A}', '${B}', '${C}')`);
    expect(await rpcErr(A, 'casino_join', [5, req()])).toContain('CASINO_BAD_AMOUNT');
    let s = await rpc<CS>(A, 'casino_join', [100, req()]);
    expect(s.round.stake).toBe(100);
    const chat = await as<{ nickname: string; body: string; space: string }>(B, `select nickname, body, space from public.chat_messages order by id desc limit 1`);
    expect(chat.rows[0]).toMatchObject({ nickname: '토끼농부', space: 'village' });
    expect(chat.rows[0].body).toContain('100G 판을 모집해요');
    expect(await rpcErr(B, 'casino_join', [300, req()])).toContain('CASINO_STAKE_CHANGED'); // 다른 금액은 불가
    expect(await rpcErr(A, 'casino_join', [100, req()])).toContain('CASINO_ALREADY_JOINED');
    s = await rpc<CS>(B, 'casino_join', [100, req()]);
    expect(s.round.bets.map((b) => b.amount)).toEqual([100, 100]);
    expect(await gold(A)).toBe(900);
    expect(await gold(B)).toBe(900);
    await rpc(A, 'casino_ready', [true]);
    s = await rpc<CS>(C, 'casino_join', [100, req()]); // 새 사람 → 모두 준비 해제
    expect(s.round.bets.every((b) => !b.ready)).toBe(true);
    s = await rpc<CS>(C, 'casino_leave', [req()]);
    expect(await gold(C)).toBe(1000);
    await rpc(A, 'casino_ready', [true]);
    s = await rpc<CS>(B, 'casino_ready', [true]); // 모두 준비 → 서버 추첨
    expect(s.last?.pot).toBe(200);
    expect([A, B]).toContain(s.last?.winnerId);
    expect(s.round.bets).toHaveLength(0);
    expect(s.round.stake).toBeNull(); // 빈 판 → 다음 사람이 새 참가비를 정함
    expect((await gold(A)) + (await gold(B))).toBe(2000); // 골드가 생기거나 사라지지 않음
  });
  it('모두 같은 금액이라 확률도 같음 (60판)', async () => {
    let aWins = 0;
    for (let i = 0; i < 60; i++) {
      await db.exec(`update public.profiles set gold = 100000 where id in ('${A}', '${B}')`);
      await rpc(A, 'casino_join', [50, req()]);
      await rpc(B, 'casino_join', [50, req()]);
      await rpc(A, 'casino_ready', [true]);
      const s = await rpc<CS>(B, 'casino_ready', [true]);
      if (s.last?.winnerId === A) aWins++;
    }
    expect(aWins).toBeGreaterThan(12);  // 기대값 30번 (50%)
    expect(aWins).toBeLessThan(48);
  }, 60000);
  it('마을 밖에서는 못 걸고, 판 연 사람이 나가면 참가비 초기화, 5분 자동 환불', async () => {
    await rpc(B, 'enter_space', [`farm:${B}`]);
    expect(await rpcErr(B, 'casino_join', [50, req()])).toContain('WRONG_SPACE');
    await rpc(B, 'enter_space', ['village']);
    await rpc(A, 'casino_join', [70, req()]);
    let s = await rpc<CS>(A, 'casino_leave', [req()]);
    expect(s.round.stake).toBeNull();
    const g0 = await gold(C);
    await rpc(C, 'casino_join', [50, req()]);
    expect(await gold(C)).toBe(g0 - 50);
    await db.exec(`update public.casino_bets set updated_at = now() - interval '6 minutes' where player_id = '${C}'`);
    s = await rpc<CS>(A, 'casino_state');
    expect(s.round.bets.find((b) => b.playerId === C)).toBeUndefined();
    expect(s.round.stake).toBeNull();
    expect(await gold(C)).toBe(g0);
    await expect(as(A, `update public.casino_rounds set winner_id = '${A}'`)).rejects.toThrow(/permission denied/);
    await expect(as(A, `insert into public.casino_bets (round_id, player_id, nickname, amount) values (1, '${A}', 'x', 1)`)).rejects.toThrow(/permission denied/);
  });
});

describe('친구 밭에 물 주기 (밭 전체)', () => {
  const remainMin = async (x: number, y: number) => {
    const r = await db.query<{ m: number }>(`select extract(epoch from (ready_at - now())) / 60 as m from public.planted_crops where owner_id = '${A}' and x = ${x} and y = ${y}`);
    return Number(r.rows[0].m);
  };
  it('한 번에 자라는 작물 전부 5분 단축, 친구마다 30분에 한 번 (두 명이면 10분)', async () => {
    await db.exec(`delete from public.planted_crops where owner_id = '${A}'`);
    await db.exec(`insert into public.planted_crops (owner_id, x, y, crop_id, planted_at, ready_at) values
      ('${A}', 3, 0, 'watermelon', now(), now() + interval '20 minutes'),
      ('${A}', 2, 1, 'pumpkin', now(), now() + interval '15 minutes'),
      ('${A}', 0, 0, 'carrot', now() - interval '1 minute', now() - interval '1 second')`);
    await rpc(B, 'enter_space', ['village']);
    expect(await rpcErr(B, 'water_crop', [A, 0, 0, req()])).toContain('WRONG_SPACE');
    await rpc(B, 'enter_space', [`farm:${A}`]);
    const r = await rpc<{ count: number; waterLogs: Record<string, number> }>(B, 'water_crop', [A, 0, 0, req()]);
    expect(r.count).toBe(2);                         // 자라는 작물 2개 (다 자란 당근 제외)
    expect(Object.keys(r.waterLogs)).toEqual([A]);
    expect(await remainMin(3, 0)).toBeCloseTo(15, 0);
    expect(await remainMin(2, 1)).toBeCloseTo(10, 0);
    expect(await rpcErr(B, 'water_crop', [A, 0, 0, req()])).toContain('WATER_COOLDOWN');
    await rpc(C, 'enter_space', [`farm:${A}`]);
    await rpc(C, 'water_crop', [A, 0, 0, req()]);
    expect(await remainMin(3, 0)).toBeCloseTo(10, 0); // 두 명이 주면 10분 단축
    expect(await remainMin(2, 1)).toBeCloseTo(5, 0);
    expect(await rpcErr(A, 'water_crop', [A, 0, 0, req()])).toContain('OWN_FARM_WATER');
    await db.exec(`update public.water_logs set watered_at = now() - interval '31 minutes' where waterer_id = '${B}'`);
    await db.exec(`update public.planted_crops set ready_at = now() - interval '1 second' where owner_id = '${A}'`);
    expect(await rpcErr(B, 'water_crop', [A, 0, 0, req()])).toContain('NOTHING_TO_WATER');
    await expect(as(B, `update public.planted_crops set ready_at = now() where owner_id = '${A}'`)).rejects.toThrow(/permission denied/);
    const st = await rpc<{ logs: Record<string, number> }>(C, 'water_status');
    expect(Object.keys(st.logs)).toEqual([A]);
  });
});

describe('물 주기 알림', () => {
  it('친구가 물을 주면 주인에게만 서버가 만든 알림이 쌓임', async () => {
    await db.exec(`delete from public.water_logs where owner_id = '${A}'`);
    await db.exec(`insert into public.planted_crops (owner_id, x, y, crop_id, planted_at, ready_at) values ('${A}', 1, 2, 'corn', now(), now() + interval '8 minutes') on conflict (owner_id, x, y) do update set ready_at = excluded.ready_at`);
    const before = await rpc<{ id: number }[]>(A, 'list_notices', [0]);
    const lastId = before.length ? before[before.length - 1].id : 0;
    await rpc(B, 'enter_space', [`farm:${A}`]);
    await rpc(B, 'water_crop', [A, 0, 0, req()]);
    const after = await rpc<{ id: number; body: string; kind: string }[]>(A, 'list_notices', [lastId]);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: 'water' });
    expect(after[0].body).toContain('감자왕님이 내 밭에 물을 줬어요');
    expect(await rpc<unknown[]>(B, 'list_notices', [lastId])).toHaveLength(0); // 남의 알림은 안 보임
    await expect(as(B, `insert into public.notices (user_id, body) values ('${A}', '가짜 알림')`)).rejects.toThrow(/permission denied/);
    const leak = await as(B, `select * from public.notices where user_id = '${A}'`);
    expect(leak.rows).toHaveLength(0);
  });
});

describe('분수 소원', () => {
  it('1분에 한 번, 빌 때마다 30G 확정', async () => {
    await rpc(A, 'enter_space', ['village']);
    await db.exec(`delete from public.wish_logs where player_id = '${A}'`);
    await db.exec(`update public.profiles set gold = 0 where id = '${A}'`);
    for (let i = 0; i < 5; i++) {
      await db.exec(`delete from public.wish_logs where player_id = '${A}'`);
      const r = await rpc<{ won: boolean; reward: number; gold: number }>(A, 'make_wish');
      expect(r).toMatchObject({ won: true, reward: 30, gold: (i + 1) * 30 });
    }
    expect(await rpcErr(A, 'make_wish')).toContain('WISH_COOLDOWN'); // 1분 안에는 다시 못 빎
    expect((await state(A)).profile.gold).toBe(150);
    await rpc(A, 'enter_space', [`farm:${A}`]);
    await db.exec(`delete from public.wish_logs where player_id = '${A}'`);
    expect(await rpcErr(A, 'make_wish')).toContain('WRONG_SPACE');
    await rpc(A, 'enter_space', ['village']);
  });
});

describe('상점 품목 (비료 · 낚싯대 · 가구)', () => {
  it('서버 가격, 가구는 색상까지, 낚싯대는 하나만', async () => {
    await db.exec(`update public.profiles set gold = 20000 where id = '${A}'`);
    const r = await rpc<{ gold: number; inventory: Record<string, number> }>(A, 'buy_item', ['fert:4', 0, 2, req()]);
    expect(r.gold).toBe(20000 - 40);
    const r2 = await rpc<{ gold: number; inventory: Record<string, number> }>(A, 'buy_item', ['fert:10', 0, 1, req()]);
    expect(r2.gold).toBe(20000 - 40 - 50); // 10분 비료 = 4분 비료 × 2.5
    const f = await rpc<{ inventory: Record<string, number> }>(A, 'buy_item', ['furn:bed', 5, 1, req()]);
    expect(f.inventory['furn:bed:5']).toBe(1);
    expect(await rpcErr(A, 'buy_item', ['furn:bed', 8, 1, req()])).toContain('INVALID_COLOR');
    await rpc(A, 'buy_item', ['rod:1', 0, 1, req()]);
    expect(await rpcErr(A, 'buy_item', ['rod:1', 0, 1, req()])).toContain('ALREADY_OWNED');
    expect(await rpcErr(A, 'buy_item', ['seed:carrot', 0, 1, req()])).toContain('UNKNOWN_ITEM');
    await db.exec(`update public.profiles set gold = 10 where id = '${A}'`);
    expect(await rpcErr(A, 'buy_item', ['rod:4', 0, 1, req()])).toContain('INSUFFICIENT_GOLD');
    await expect(as(A, `update public.shop_items set price = 1`)).rejects.toThrow(/permission denied/);
  });
});

describe('낚시', () => {
  it('찌 던지기 → 너무 빨리 당기면 실패, 입질 뒤 잡기, 늦으면 놓침, 물고기 판매', async () => {
    expect(await rpcErr(B, 'fish_cast')).toContain('NO_ROD');
    await rpc(A, 'enter_space', ['village']);
    const c = await rpc<{ biteAt: number; serverNow: number; tier: number }>(A, 'fish_cast');
    expect(c.tier).toBe(1);
    expect(c.biteAt - c.serverNow).toBeGreaterThanOrEqual(7900);
    expect(c.biteAt - c.serverNow).toBeLessThanOrEqual(20100);
    expect(await rpcErr(A, 'fish_reel', [req()])).toContain('FISH_TOO_EARLY');
    await db.exec(`update public.fishing_sessions set bite_at = now() - interval '1 second' where player_id = '${A}'`);
    const got = await rpc<{ fish: string; inventory: Record<string, number> }>(A, 'fish_reel', [req()]);
    expect(['minnow', 'crucian', 'carp', 'catfish']).toContain(got.fish); // 나무 낚싯대: 싼 물고기만
    expect(got.inventory[`fish:${got.fish}`]).toBe(1);
    expect(await rpcErr(A, 'fish_reel', [req()])).toContain('NOT_FISHING');
    await rpc(A, 'fish_cast');
    await db.exec(`update public.fishing_sessions set bite_at = now() - interval '10 seconds' where player_id = '${A}'`);
    const esc = await rpc<{ escaped: boolean; fish: string | null; rodUses: Record<string, number> }>(A, 'fish_reel', [req()]);
    expect(esc).toMatchObject({ escaped: true, fish: null });
    expect(esc.rodUses['rod:1']).toBe(8); // 낚아도 놓쳐도 1회씩 (10 → 9 → 8)
    // 판매
    const price = (await db.query<{ price: number }>(`select price from public.fish_types where id = '${got.fish}'`)).rows[0].price;
    const before = (await state(A)).profile.gold;
    const s = await rpc<{ gold: number }>(A, 'sell_item', [`fish:${got.fish}`, 1, req()]);
    expect(s.gold).toBe(before + price);
    expect(await rpcErr(A, 'sell_item', [`fish:${got.fish}`, 1, req()])).toContain('NOT_ENOUGH_ITEMS');
    expect(await rpcErr(A, 'sell_item', ['furn:bed:5', 1, req()])).toContain('UNKNOWN_ITEM');
    // 전체 판매에 물고기 포함
    await db.exec(`insert into public.inventory_items (player_id, item_id, quantity) values ('${A}', 'fish:goldfish', 2) on conflict (player_id, item_id) do update set quantity = 2`);
    const g0 = (await state(A)).profile.gold;
    const all = await rpc<{ gold: number; inventory: Record<string, number> }>(A, 'sell_all_crops', [req()]);
    expect(all.gold).toBeGreaterThanOrEqual(g0 + 1000);
    expect(all.inventory['fish:goldfish']).toBeUndefined();
    expect(all.inventory['furn:bed:5']).toBe(1); // 가구는 안 팔림
  });
  it('비싼 낚싯대일수록 비싼 물고기 확률이 높다', async () => {
    const avg = async (tier: number) => (await db.query<{ v: number }>(
      `select sum(w.weight * f.price)::float / sum(w.weight) as v from public.fish_weights w join public.fish_types f on f.id = w.fish_id where w.tier = ${tier}`)).rows[0].v;
    const a = [await avg(1), await avg(2), await avg(3), await avg(4)];
    expect(a[0]).toBeLessThan(a[1]); expect(a[1]).toBeLessThan(a[2]); expect(a[2]).toBeLessThan(a[3]);
  });
});

describe('낚싯대 내구도', () => {
  it('다 쓰면 낚싯대가 사라지고, 다시 사면 가득', async () => {
    expect(await rpc<Record<string, number>>(A, 'rod_status')).toEqual({ 'rod:1': 8 });
    await db.exec(`update public.rod_uses set uses_left = 1 where player_id = '${A}'`);
    await rpc(A, 'enter_space', ['village']);
    await rpc(A, 'fish_cast');
    await db.exec(`update public.fishing_sessions set bite_at = now() - interval '1 second' where player_id = '${A}'`);
    const r = await rpc<{ rodBroken: boolean; rodUses: Record<string, number>; inventory: Record<string, number>; fish: string }>(A, 'fish_reel', [req()]);
    expect(r.rodBroken).toBe(true);
    expect(r.fish).toBeTruthy();                       // 마지막 1회도 물고기는 잡힘
    expect(r.inventory['rod:1']).toBeUndefined();
    expect(r.rodUses).toEqual({});
    expect(await rpcErr(A, 'fish_cast')).toContain('NO_ROD');
    await db.exec(`update public.profiles set gold = gold + 100 where id = '${A}'`);
    const b = await rpc<{ rodUses: Record<string, number> }>(A, 'buy_item', ['rod:1', 0, 1, req()]);
    expect(b.rodUses).toEqual({ 'rod:1': 10 });
    await expect(as(A, `update public.rod_uses set uses_left = 99`)).rejects.toThrow(/permission denied/);
  });
  it('낚싯대를 다 쓸 때까지 낚은 물고기를 팔면 (80%만 낚아도) 구매가보다 이득', async () => {
    const rows = (await db.query<{ id: string; price: number; uses: number; ev: number }>(`
      select s.id, s.price, s.uses, sum(w.weight * f.price)::float / sum(w.weight) as ev
      from public.shop_items s join public.fish_weights w on w.tier = s.tier join public.fish_types f on f.id = w.fish_id
      where s.category = 'rod' group by s.id, s.price, s.uses order by s.id`)).rows;
    expect(rows.map((r) => r.uses)).toEqual([10, 20, 30, 40]);
    for (const r of rows) expect(r.uses * r.ev * 0.8, r.id).toBeGreaterThan(r.price);
  });
});

describe('비료', () => {
  it('내 자라는 작물에만, 4분/10분 단축', async () => {
    await db.exec(`insert into public.planted_crops (owner_id, x, y, crop_id, planted_at, ready_at) values ('${A}', 1, 1, 'pumpkin', now(), now() + interval '12 minutes') on conflict (owner_id, x, y) do update set ready_at = excluded.ready_at`);
    await db.exec(`delete from public.planted_crops where owner_id = '${A}' and x = 2 and y = 2`);
    const left = async () => Number((await db.query<{ m: number }>(`select extract(epoch from (ready_at - now())) / 60 as m from public.planted_crops where owner_id = '${A}' and x = 1 and y = 1`)).rows[0].m);
    const r = await rpc<{ farm: unknown; inventory: Record<string, number> }>(A, 'use_fertilizer', [1, 1, 'fert:4', req()]);
    expect(r.farm).toBeTruthy();
    expect(await left()).toBeCloseTo(8, 0);
    expect(await rpcErr(A, 'use_fertilizer', [1, 1, 'fert:10', req()])).toContain('ALREADY_FERTILIZED'); // 한 칸에 한 번만
    expect((r.farm as { crops: { x: number; y: number; fertilized: boolean }[] }).crops.find((c) => c.x === 1 && c.y === 1)?.fertilized).toBe(true);
    // 수확 후 다시 심은 칸 = 새 작물이라 다시 줄 수 있음
    await db.exec(`delete from public.planted_crops where owner_id = '${A}' and x = 1 and y = 1`);
    await db.exec(`insert into public.planted_crops (owner_id, x, y, crop_id, planted_at, ready_at) values ('${A}', 1, 1, 'pumpkin', now(), now() + interval '8 minutes')`);
    await rpc(A, 'use_fertilizer', [1, 1, 'fert:10', req()]);
    expect(await left()).toBeLessThanOrEqual(0.01); // 다 자람
    expect(await rpcErr(A, 'use_fertilizer', [1, 1, 'fert:4', req()])).toContain('CROP_ALREADY_READY');
    expect(await rpcErr(A, 'use_fertilizer', [2, 2, 'fert:4', req()])).toContain('PLOT_EMPTY');
    await db.exec(`update public.planted_crops set ready_at = now() + interval '5 minutes', fertilized = false where owner_id = '${A}' and x = 1 and y = 1`);
    expect(await rpcErr(A, 'use_fertilizer', [1, 1, 'fert:10', req()])).toContain('NO_FERTILIZER');
    expect(await rpcErr(A, 'use_fertilizer', [1, 1, 'rod:1', req()])).toContain('UNKNOWN_ITEM');
  });
});

describe('집 · 가구 배치', () => {
  it('집 들어가기, 확장, 배치 규칙 (범위·문 앞·겹침), 옮기기·보관', async () => {
    const h = await rpc<{ level: number; w: number; h: number; items: unknown[] }>(B, 'get_house', [A]);
    expect(h).toMatchObject({ level: 1, w: 6, h: 4, items: [] });
    await rpc(A, 'enter_space', ['village']);
    expect(await rpcErr(A, 'place_furniture', ['furn:bed', 5, 0, 0, req()])).toContain('NOT_IN_HOUSE');
    await rpc(A, 'enter_space', [`house:${A}`]);
    expect(await rpcErr(A, 'place_furniture', ['furn:bed', 5, 5, 3, req()])).toContain('CANT_PLACE'); // 밖으로 삐져나옴
    expect(await rpcErr(A, 'place_furniture', ['furn:bed', 4, 0, 0, req()])).toContain('NO_FURNITURE'); // 다른 색은 없음
    const p = await rpc<{ house: { items: { id: number; type: string; color: number; x: number; y: number }[] }; inventory: Record<string, number> }>(A, 'place_furniture', ['furn:bed', 5, 0, 0, req()]);
    expect(p.house.items).toHaveLength(1);
    expect(p.inventory['furn:bed:5']).toBeUndefined();
    const bedId = p.house.items[0].id;
    await db.exec(`update public.profiles set gold = 50000 where id = '${A}'`);
    await rpc(A, 'buy_item', ['furn:chair', 2, 2, req()]);
    await rpc(A, 'buy_item', ['furn:rug', 1, 1, req()]);
    expect(await rpcErr(A, 'place_furniture', ['furn:chair', 2, 0, 1, req()])).toContain('CANT_PLACE'); // 침대와 겹침
    expect(await rpcErr(A, 'place_furniture', ['furn:chair', 2, 3, 3, req()])).toContain('CANT_PLACE'); // 문 앞
    await rpc(A, 'place_furniture', ['furn:rug', 1, 2, 2, req()]);            // 러그는 문 앞도 OK
    await rpc(A, 'place_furniture', ['furn:chair', 2, 2, 2, req()]);          // 러그 위 의자 OK
    expect(await rpcErr(B, 'move_furniture', [bedId, 4, 0])).toContain('INVALID_TARGET'); // 남의 가구
    const m = await rpc<{ house: { items: { id: number; x: number }[] } }>(A, 'move_furniture', [bedId, 5, 0]);
    expect(m.house.items.find((i) => i.id === bedId)?.x).toBe(5);
    const s = await rpc<{ inventory: Record<string, number>; house: { items: unknown[] } }>(A, 'store_furniture', [bedId]);
    expect(s.inventory['furn:bed:5']).toBe(1);
    expect(s.house.items).toHaveLength(2);
    // 확장
    expect(await rpcErr(A, 'expand_house', [3, req()])).toContain('INVALID_LEVEL');
    const e = await rpc<{ gold: number; house: { level: number; w: number; h: number } }>(A, 'expand_house', [2, req()]);
    expect(e.house).toMatchObject({ level: 2, w: 8, h: 5 });
    expect(e.gold).toBe(50000 - 2 * 120 - 300 - 1500);
    await db.exec(`update public.profiles set gold = 0 where id = '${A}'`);
    expect(await rpcErr(A, 'expand_house', [3, req()])).toContain('INSUFFICIENT_GOLD');
    // 직접 수정 불가, 친구 집 구경 가능
    await expect(as(A, `insert into public.house_items (owner_id, type, color, x, y) values ('${A}', 'furn:bed', 0, 0, 0)`)).rejects.toThrow(/permission denied/);
    await rpc(B, 'enter_space', [`house:${A}`]);
    expect((await rpc<{ items: unknown[] }>(B, 'get_house', [A])).items).toHaveLength(2);
    expect(await rpcErr(B, 'enter_space', ['house:not-a-uuid'])).toContain('INVALID_TARGET');
    // 실시간 채널: 집 토픽 허용
    await db.exec(`insert into realtime.messages (topic, extension) values ('space:house:${A}', 'broadcast')`);
    await db.exec(`select set_config('realtime.topic', 'space:house:${A}', false)`);
    expect((await as(B, `select * from realtime.messages`)).rows.length).toBeGreaterThan(0);
    await rpc(A, 'enter_space', ['village']);
    await rpc(B, 'enter_space', ['village']);
  });
});

describe('밤 · 마을 거지', () => {
  const setNight = (on: boolean) => db.exec(`create or replace function public._is_night() returns boolean language sql stable as $$ select ${on} $$`);
  it('밤에 마을에서만, 100~1000G (100G 단위), 거지마다 하루 1번, 마을 채팅으로 알림', async () => {
    await rpc(A, 'enter_space', ['village']);
    await db.exec(`update public.profiles set gold = 5000 where id = '${A}'`);
    await setNight(false);
    expect(await rpcErr(A, 'beggar_rob', [1, req()])).toContain('NOT_NIGHT');
    await setNight(true);
    expect(await rpcErr(A, 'beggar_rob', [6, req()])).toContain('INVALID_TARGET');
    const r = await rpc<{ amount: number; gold: number; robbed: number[] }>(A, 'beggar_rob', [1, req()]);
    expect(r.amount % 100).toBe(0);
    expect(r.amount).toBeGreaterThanOrEqual(100);
    expect(r.amount).toBeLessThanOrEqual(1000);
    expect(r.gold).toBe(5000 - r.amount);
    expect(r.robbed).toEqual([1]);
    expect(await rpcErr(A, 'beggar_rob', [1, req()])).toContain('ALREADY_ROBBED'); // 같은 거지는 하루 1번
    const chat = await db.query<{ body: string; space: string }>(`select body, space from public.chat_messages where sender_id = '${A}' order by id desc limit 1`);
    expect(chat.rows[0]).toMatchObject({ space: 'village' });
    expect(chat.rows[0].body).toContain('마을 거지에게 돈을 갈취당했습니다');
    // 다른 거지는 또 뜯을 수 있음 / 돈이 적으면 가진 만큼만 (100G 단위)
    await db.exec(`update public.profiles set gold = 250 where id = '${A}'`);
    const r2 = await rpc<{ amount: number; gold: number }>(A, 'beggar_rob', [2, req()]);
    expect([100, 200]).toContain(r2.amount);
    expect(r2.gold).toBe(250 - r2.amount);
    await db.exec(`update public.profiles set gold = 50 where id = '${A}'`);
    const r3 = await rpc<{ amount: number; gold: number }>(A, 'beggar_rob', [3, req()]);
    expect(r3).toMatchObject({ amount: 0, gold: 50 });
    expect((await rpc<{ robbed: number[] }>(A, 'beggar_status')).robbed).toEqual([1, 2, 3]);
    // 농장에서는 안 뜯김
    await rpc(A, 'enter_space', [`farm:${A}`]);
    expect(await rpcErr(A, 'beggar_rob', [4, req()])).toContain('WRONG_SPACE');
    await rpc(A, 'enter_space', ['village']);
    await expect(as(A, `delete from public.beggar_robberies`)).rejects.toThrow(/permission denied/);
    await db.exec(`create or replace function public._is_night() returns boolean language sql stable as $$
      select mod(extract(epoch from now())::numeric, 900) >= 600 or mod(extract(epoch from now())::numeric, 900) < 5 $$`);
  });
});
