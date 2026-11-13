-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 과일 나무 + 햇살 카지노
--   * 과일 나무: 나무 하나당 30G, 같은 나무는 30분에 한 번 (사람마다 따로)
--   * 카지노: 판을 처음 여는 사람이 참가비를 정하고(마을 채팅으로 모집 글이 자동으로 올라감),
--     다른 사람은 같은 참가비로만 참가 → 모두 "준비 완료" 하면 서버가 똑같은 확률로 당첨자 1명을 뽑아
--     판돈 전부를 지급 (게임 속 골드만 사용)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.economy_transactions drop constraint if exists economy_transactions_kind_check;
alter table public.economy_transactions add constraint economy_transactions_kind_check
  check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest', 'deposit', 'withdraw',
                  'fruit', 'casino_bet', 'casino_refund', 'casino_win'));

-- ───────────────────────────── 과일 나무 ─────────────────────────────
create table if not exists public.fruit_trees (
  id     text primary key,                         -- 지도 좌표 기반 ID (예: v:4,31 / f:27,13)
  place  text not null check (place in ('village', 'farm')),
  fruit  text not null check (fruit in ('apple', 'peach')),
  reward int  not null default 30 check (reward > 0)
);

-- ⚠ src/game/maps 의 과일 나무 위치와 같아야 합니다 (tests/unit/configSync.test.ts 에서 검사)
insert into public.fruit_trees (id, place, fruit, reward) values
  ('v:4,31', 'village', 'peach', 30), ('v:7,33', 'village', 'apple', 30), ('v:4,35', 'village', 'peach', 30),
  ('v:7,37', 'village', 'apple', 30), ('v:10,38', 'village', 'peach', 30),
  ('v:51,5', 'village', 'peach', 30), ('v:53,8', 'village', 'apple', 30), ('v:50,9', 'village', 'peach', 30),
  ('f:4,14', 'farm', 'peach', 30), ('f:8,22', 'farm', 'apple', 30), ('f:27,13', 'farm', 'peach', 30),
  ('f:30,9', 'farm', 'apple', 30), ('f:24,23', 'farm', 'peach', 30), ('f:2,20', 'farm', 'apple', 30)
on conflict (id) do update set place = excluded.place, fruit = excluded.fruit, reward = excluded.reward;

create table if not exists public.fruit_picks (
  player_id uuid not null references public.profiles (id) on delete cascade,
  tree_id   text not null references public.fruit_trees (id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (player_id, tree_id)
);

create or replace function public._fruit_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(tree_id, public._ms(picked_at)), '{}'::jsonb)
  from public.fruit_picks where player_id = p_uid and picked_at > now() - interval '30 minutes';
$$;

-- 내가 최근 30분 안에 딴 나무들 (나무 ID → 딴 시각 ms)
create or replace function public.fruit_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return jsonb_build_object('picks', public._fruit_json(uid), 'serverNow', public._ms(clock_timestamp()));
end $$;

create or replace function public.pick_fruit(p_tree_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; t record; prof record; last_pick timestamptz; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into t from public.fruit_trees where id = p_tree_id;
  if not found then raise exception 'INVALID_TARGET'; end if;
  select * into prof from public.profiles where id = uid;
  -- 마을 나무는 마을에서, 농장 나무는 "내" 농장에서만
  if t.place = 'village' and prof.current_space is distinct from 'village' then raise exception 'WRONG_SPACE'; end if;
  if t.place = 'farm' and prof.current_space is distinct from ('farm:' || uid::text) then raise exception 'NOT_OWNER'; end if;
  select picked_at into last_pick from public.fruit_picks where player_id = uid and tree_id = t.id for update;
  if last_pick is not null and last_pick > now() - interval '30 minutes' then raise exception 'FRUIT_NOT_READY'; end if;
  insert into public.fruit_picks (player_id, tree_id, picked_at) values (uid, t.id, now())
  on conflict (player_id, tree_id) do update set picked_at = excluded.picked_at;
  update public.profiles set gold = gold + t.reward where id = uid;
  res := public._result(uid, t.reward, false) || jsonb_build_object('fruitPicks', public._fruit_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'fruit', 'fruit:' || t.fruit, 1, t.reward, res);
  return res;
end $$;

-- ───────────────────────────── 햇살 카지노 ─────────────────────────────
create table if not exists public.casino_rounds (
  id              bigint generated always as identity primary key,
  status          text not null default 'open' check (status in ('open', 'done')),
  pot             bigint not null default 0,
  stake           bigint,                       -- 이번 판 참가비 (판을 연 사람이 정함, 모두 같은 금액)
  roll            double precision,             -- 0~1 사이 추첨값 (룰렛 바늘 위치)
  winner_id       uuid references public.profiles (id) on delete set null,
  winner_nickname text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
-- 열려 있는 판은 언제나 하나
create unique index if not exists casino_one_open_round on public.casino_rounds ((true)) where status = 'open';

create table if not exists public.casino_bets (
  round_id   bigint not null references public.casino_rounds (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  nickname   text not null,
  amount     bigint not null check (amount > 0),
  ready      boolean not null default false,
  joined_at  timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- 열린 판을 잠그고 가져오기 (없으면 만들기)
create or replace function public._casino_open_round()
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  select id into rid from public.casino_rounds where status = 'open' for update;
  if rid is null then
    insert into public.casino_rounds (status) values ('open') returning id into rid;
  end if;
  return rid;
end $$;

-- 준비하지 않은 채 5분이 지난 참가자는 자동 환불 후 퇴장 (한 명 때문에 판이 멈추지 않도록)
create or replace function public._casino_cleanup(p_round bigint)
returns void language plpgsql security definer set search_path = public as $$
declare b record;
begin
  for b in select * from public.casino_bets
            where round_id = p_round and not ready and updated_at < now() - interval '5 minutes' for update
  loop
    update public.profiles set gold = gold + b.amount where id = b.player_id;
    insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta)
      values (b.player_id, 'casino-timeout-' || p_round || '-' || b.player_id || '-' || extract(epoch from now())::bigint,
              'casino_refund', 0, b.amount);
    delete from public.casino_bets where round_id = p_round and player_id = b.player_id;
  end loop;
  update public.casino_rounds
     set pot = coalesce((select sum(amount) from public.casino_bets where round_id = p_round), 0),
         stake = case when exists (select 1 from public.casino_bets where round_id = p_round) then stake else null end
   where id = p_round;
end $$;

create or replace function public._casino_bets_json(p_round bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'playerId', b.player_id, 'nickname', b.nickname, 'amount', b.amount, 'ready', b.ready) order by b.joined_at, b.player_id), '[]'::jsonb)
  from public.casino_bets b where b.round_id = p_round;
$$;

create or replace function public.casino_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); rid bigint; lr record;
begin
  rid := public._casino_open_round();
  perform public._casino_cleanup(rid);
  select * into lr from public.casino_rounds where status = 'done' order by id desc limit 1;
  return jsonb_build_object(
    'serverNow', public._ms(clock_timestamp()),
    'gold', (select gold from public.profiles where id = uid),
    'round', (select jsonb_build_object('id', r.id, 'pot', r.pot, 'stake', r.stake, 'bets', public._casino_bets_json(rid))
                from public.casino_rounds r where r.id = rid),
    'last', case when lr.id is null then null else jsonb_build_object(
      'id', lr.id, 'pot', lr.pot, 'roll', lr.roll, 'winnerId', lr.winner_id, 'winnerNickname', lr.winner_nickname,
      'resolvedAt', public._ms(lr.resolved_at), 'bets', public._casino_bets_json(lr.id)) end);
end $$;

-- 판에 참가. 아무도 없으면 p_stake 가 이번 판 참가비가 되고 마을에 모집 글이 올라감.
-- 이미 판이 열려 있으면 같은 참가비(p_stake = 현재 참가비)로만 참가 가능 → 모두 같은 금액, 같은 확률
create or replace function public.casino_join(p_stake bigint, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; prof record; rid bigint; v_stake bigint; n int; res jsonb; is_new boolean := false;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from 'village' then raise exception 'WRONG_SPACE'; end if;
  rid := public._casino_open_round();
  perform public._casino_cleanup(rid);
  if exists (select 1 from public.casino_bets where round_id = rid and player_id = uid) then raise exception 'CASINO_ALREADY_JOINED'; end if;
  select count(*) into n from public.casino_bets where round_id = rid;
  if n = 0 then
    if p_stake is null or p_stake < 10 or p_stake > 1000000 then raise exception 'CASINO_BAD_AMOUNT'; end if;
    v_stake := p_stake;
    update public.casino_rounds set stake = v_stake where id = rid;
    is_new := true;
  else
    if n >= 8 then raise exception 'CASINO_FULL'; end if;
    select stake into v_stake from public.casino_rounds where id = rid;
    if p_stake is distinct from v_stake then raise exception 'CASINO_STAKE_CHANGED'; end if;
  end if;
  update public.profiles set gold = gold - v_stake where id = uid and gold >= v_stake;
  if not found then raise exception 'INSUFFICIENT_GOLD'; end if;
  insert into public.casino_bets (round_id, player_id, nickname, amount, ready, updated_at)
    values (rid, uid, prof.nickname, v_stake, false, now());
  update public.casino_bets set ready = false where round_id = rid;   -- 새 사람이 왔으니 모두 다시 준비
  update public.casino_rounds set pot = (select sum(amount) from public.casino_bets where round_id = rid) where id = rid;
  if is_new then
    -- 마을에 모집 글 (판을 연 사람의 채팅으로 → 말풍선과 채팅 기록에 표시)
    insert into public.chat_messages (sender_id, nickname, space, body)
      values (uid, prof.nickname, 'village',
              '🎰 카지노에서 ' || to_char(v_stake, 'FM999,999,999') || 'G 판을 모집해요! 같이 하실 분은 광장 동쪽 카지노로 와 주세요 🙌');
  end if;
  res := public.casino_state();
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'casino_bet', 0, -v_stake, res);
  return res;
end $$;

-- 판에서 나가기 (건 돈 전액 환불, 모두의 준비가 풀림)
create or replace function public.casino_leave(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; rid bigint; cur bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  rid := public._casino_open_round();
  delete from public.casino_bets where round_id = rid and player_id = uid returning amount into cur;
  if cur is null then raise exception 'CASINO_NOT_JOINED'; end if;
  update public.profiles set gold = gold + cur where id = uid;
  update public.casino_bets set ready = false where round_id = rid;
  update public.casino_rounds
     set pot = coalesce((select sum(amount) from public.casino_bets where round_id = rid), 0),
         stake = case when exists (select 1 from public.casino_bets where round_id = rid) then stake else null end
   where id = rid;
  res := public.casino_state();
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'casino_refund', 0, cur, res);
  return res;
end $$;

-- 준비 완료/취소. 2명 이상이 모두 준비되면 즉시 서버가 추첨 (모두 같은 참가비 → 같은 확률) → 당첨자에게 판돈 전부
create or replace function public.casino_ready(p_ready boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); rid bigint; n int; n_ready int; total bigint; v_roll double precision;
        acc bigint := 0; b record; win_id uuid; win_nick text;
begin
  rid := public._casino_open_round();          -- 판을 잠금 → 동시에 눌러도 한 번만 추첨
  perform public._casino_cleanup(rid);
  update public.casino_bets set ready = coalesce(p_ready, false), updated_at = now()
   where round_id = rid and player_id = uid;
  if not found then raise exception 'CASINO_NOT_JOINED'; end if;
  select count(*), count(*) filter (where ready), coalesce(sum(amount), 0) into n, n_ready, total
    from public.casino_bets where round_id = rid;
  if n >= 2 and n_ready = n then
    v_roll := random();
    for b in select * from public.casino_bets where round_id = rid order by joined_at, player_id loop
      acc := acc + b.amount;
      if v_roll * total < acc then win_id := b.player_id; win_nick := b.nickname; exit; end if;
    end loop;
    update public.profiles set gold = gold + total where id = win_id;
    update public.casino_rounds
       set status = 'done', pot = total, roll = v_roll, winner_id = win_id, winner_nickname = win_nick, resolved_at = now()
     where id = rid;
    insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta)
      values (win_id, 'casino-win-' || rid, 'casino_win', 0, total);
  end if;
  return public.casino_state();
end $$;

-- ───────────────────────────── 보안 ─────────────────────────────
alter table public.fruit_trees   enable row level security;
alter table public.fruit_picks   enable row level security;
alter table public.casino_rounds enable row level security;
alter table public.casino_bets   enable row level security;

revoke all on public.fruit_trees, public.fruit_picks, public.casino_rounds, public.casino_bets from anon;
revoke insert, update, delete, truncate on public.fruit_trees, public.fruit_picks, public.casino_rounds, public.casino_bets from authenticated;
grant select on public.fruit_trees, public.fruit_picks, public.casino_rounds, public.casino_bets to authenticated;

drop policy if exists "fruit trees readable" on public.fruit_trees;
create policy "fruit trees readable" on public.fruit_trees for select to authenticated using (true);
drop policy if exists "own fruit picks" on public.fruit_picks;
create policy "own fruit picks" on public.fruit_picks for select to authenticated using (player_id = auth.uid());
drop policy if exists "casino rounds visible" on public.casino_rounds;
create policy "casino rounds visible" on public.casino_rounds for select to authenticated using (public.is_active_player());
drop policy if exists "casino bets visible" on public.casino_bets;
create policy "casino bets visible" on public.casino_bets for select to authenticated using (public.is_active_player());

revoke execute on function
  public._fruit_json(uuid), public.fruit_status(), public.pick_fruit(text, text),
  public._casino_open_round(), public._casino_cleanup(bigint), public._casino_bets_json(bigint),
  public.casino_state(), public.casino_join(bigint, text), public.casino_leave(text), public.casino_ready(boolean)
from public, anon, authenticated;
grant execute on function
  public.fruit_status(), public.pick_fruit(text, text),
  public.casino_state(), public.casino_join(bigint, text), public.casino_leave(text), public.casino_ready(boolean)
to authenticated;
