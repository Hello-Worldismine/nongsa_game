-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 (Haetsal Village) — 초기 스키마 / 보안 정책 / 서버 RPC
--
--  원칙
--   1. 클라이언트는 테이블에 직접 쓰기(INSERT/UPDATE/DELETE) 권한이 없습니다.
--   2. 모든 데이터 변경은 SECURITY DEFINER RPC 로만 일어나며, 각 RPC 는
--      auth.uid() 로 호출자를 식별하고 가격/성장시간은 서버 기준 데이터만 사용합니다.
--   3. 경제 RPC 는 플레이어 행을 FOR UPDATE 로 잠가 직렬화하고,
--      request_id 로 멱등성을 보장합니다 (네트워크 재시도 시 중복 처리 없음).
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 기준 데이터 ─────────────────────────────
create table if not exists public.game_settings (
  id           int primary key default 1 check (id = 1),
  village_name text not null default '햇살마을',
  max_players  int  not null default 10 check (max_players between 1 and 100),
  signup_mode  text not null default 'open' check (signup_mode in ('open', 'allowlist')),
  updated_at   timestamptz not null default now()
);
insert into public.game_settings (id) values (1) on conflict (id) do nothing;

-- signup_mode = 'allowlist' 일 때만 사용: 여기에 등록된 이메일만 슬롯을 받을 수 있음
create table if not exists public.player_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.crop_types (
  id             text primary key,
  name           text not null,
  seed_price     int  not null check (seed_price > 0),
  grow_seconds   int  not null check (grow_seconds > 0),
  sell_price     int  not null check (sell_price > 0),
  regrow_seconds int  not null default 0 check (regrow_seconds >= 0),
  sort_order     int  not null default 0
);

-- ⚠ src/config/crops.ts 와 값이 같아야 합니다 (tests/unit/configSync.test.ts 에서 검사)
insert into public.crop_types (id, name, seed_price, grow_seconds, sell_price, regrow_seconds, sort_order) values
  ('carrot',       '당근',   20,   30,  35, 0, 1),
  ('potato',       '감자',   35,   60,  60, 0, 2),
  ('rice',         '벼',     50,  120,  90, 0, 3),
  ('sweet_potato', '고구마', 80,  240, 145, 0, 4),
  ('tomato',       '토마토', 110, 360, 200, 0, 5),
  ('corn',         '옥수수', 150, 480, 275, 0, 6),
  ('strawberry',   '딸기',   200, 600, 370, 0, 7),
  ('cabbage',      '양배추', 250, 720, 470, 0, 8),
  ('pumpkin',      '호박',   300, 900, 570, 0, 9),
  ('watermelon',   '수박',   450, 1200, 880, 0, 10)
on conflict (id) do update set
  name = excluded.name, seed_price = excluded.seed_price, grow_seconds = excluded.grow_seconds,
  sell_price = excluded.sell_price, regrow_seconds = excluded.regrow_seconds, sort_order = excluded.sort_order;

create table if not exists public.farm_levels (
  level int primary key,
  size  int not null check (size between 1 and 20),
  cost  int not null check (cost >= 0)
);

-- ⚠ src/config/farm.ts 와 값이 같아야 합니다
insert into public.farm_levels (level, size, cost) values
  (1, 3, 0), (2, 4, 500), (3, 5, 1200), (4, 6, 2500),
  (5, 7, 5000), (6, 8, 10000), (7, 9, 20000), (8, 10, 40000)
on conflict (level) do update set size = excluded.size, cost = excluded.cost;

create table if not exists public.quest_defs (
  id      text primary key,
  kind    text not null check (kind in ('harvest', 'sell', 'plant')),
  crop_id text references public.crop_types (id),
  target  int  not null check (target > 0),
  reward  int  not null check (reward >= 0),
  title   text not null
);

-- ⚠ src/config/quests.ts 와 값이 같아야 합니다
insert into public.quest_defs (id, kind, crop_id, target, reward, title) values
  ('harvest_carrot_5', 'harvest', 'carrot', 5, 50,  '당근 5개 수확하기'),
  ('sell_potato_3',    'sell',    'potato', 3, 60,  '감자 3개 판매하기'),
  ('plant_any_10',     'plant',   null,    10, 80,  '작물 10개 심기'),
  ('harvest_any_20',   'harvest', null,    20, 150, '아무 작물 20개 수확하기')
on conflict (id) do update set kind = excluded.kind, crop_id = excluded.crop_id,
  target = excluded.target, reward = excluded.reward, title = excluded.title;

-- ───────────────────────────── 플레이어 데이터 ─────────────────────────────
create table if not exists public.player_slots (
  slot_no    int primary key check (slot_no > 0),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  active     boolean not null default true,
  claimed_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nickname      text not null,
  appearance    jsonb not null,
  gold          bigint not null default 300 check (gold >= 0),
  tutorial_step int not null default 0,
  settings      jsonb not null default '{"volume":0.6,"muted":false,"showChatLog":true}'::jsonb,
  current_space text not null default 'village',
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists profiles_nickname_lower_idx on public.profiles (lower(nickname));

create table if not exists public.farms (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  level      int not null default 1 references public.farm_levels (level),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_plots (
  owner_id    uuid not null references public.farms (owner_id) on delete cascade,
  x           smallint not null check (x >= 0),
  y           smallint not null check (y >= 0),
  unlocked_at timestamptz not null default now(),
  primary key (owner_id, x, y)
);

create table if not exists public.planted_crops (
  owner_id   uuid not null,
  x          smallint not null,
  y          smallint not null,
  crop_id    text not null references public.crop_types (id),
  planted_at timestamptz not null default now(),
  ready_at   timestamptz not null,
  primary key (owner_id, x, y),
  foreign key (owner_id, x, y) references public.farm_plots (owner_id, x, y) on delete cascade
);

create table if not exists public.inventory_items (
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id   text not null,
  quantity  int  not null check (quantity >= 0),
  primary key (player_id, item_id)
);

create table if not exists public.economy_transactions (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  request_id text not null,
  kind       text not null check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest')),
  crop_id    text,
  quantity   int not null default 0,
  gold_delta bigint not null default 0,
  result     jsonb,
  created_at timestamptz not null default now(),
  unique (player_id, request_id)
);
create index if not exists economy_tx_player_time_idx on public.economy_transactions (player_id, created_at desc);

create table if not exists public.player_statistics (
  player_id        uuid primary key references public.profiles (id) on delete cascade,
  total_harvests   int not null default 0,
  total_planted    int not null default 0,
  total_sales_gold bigint not null default 0,
  total_sold       int not null default 0,
  crop_harvests    jsonb not null default '{}'::jsonb,
  sessions         int not null default 0,
  first_played_at  timestamptz,
  last_played_at   timestamptz
);

create table if not exists public.quest_claims (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  quest_id   text not null references public.quest_defs (id),
  quest_date date not null,
  claimed_at timestamptz not null default now(),
  primary key (player_id, quest_id, quest_date)
);

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  nickname   text not null,
  space      text not null,
  body       text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists chat_space_time_idx on public.chat_messages (space, created_at desc);
create index if not exists chat_sender_time_idx on public.chat_messages (sender_id, created_at desc);

create table if not exists public.player_reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_id   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null,
  detail      text not null default '',
  status      text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now()
);

create table if not exists public.player_blocks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  target_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);

-- ───────────────────────────── 내부 헬퍼 ─────────────────────────────
create or replace function public.is_active_player(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select uid is not null and exists (select 1 from public.player_slots s where s.user_id = uid and s.active);
$$;

create or replace function public._ms(ts timestamptz)
returns bigint language sql immutable as $$ select (extract(epoch from ts) * 1000)::bigint $$;

create or replace function public._require_player()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.player_slots where user_id = uid and active) then raise exception 'NO_SLOT'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'NO_PROFILE'; end if;
  return uid;
end $$;

create or replace function public._farm_json(p_owner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ownerId', f.owner_id,
    'ownerNickname', p.nickname,
    'level', f.level,
    'size', l.size,
    'crops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'x', c.x, 'y', c.y, 'cropId', c.crop_id,
        'plantedAt', public._ms(c.planted_at), 'readyAt', public._ms(c.ready_at)) order by c.y, c.x)
      from public.planted_crops c where c.owner_id = f.owner_id), '[]'::jsonb))
  from public.farms f
  join public.profiles p on p.id = f.owner_id
  join public.farm_levels l on l.level = f.level
  where f.owner_id = p_owner;
$$;

create or replace function public._inventory_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(item_id, quantity), '{}'::jsonb)
  from public.inventory_items where player_id = p_uid and quantity > 0;
$$;

create or replace function public._stats_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'totalHarvests', s.total_harvests, 'totalPlanted', s.total_planted,
    'totalSalesGold', s.total_sales_gold, 'totalSold', s.total_sold,
    'cropHarvests', s.crop_harvests, 'sessions', s.sessions,
    'firstPlayedAt', case when s.first_played_at is null then null else public._ms(s.first_played_at) end)
  from public.player_statistics s where s.player_id = p_uid;
$$;

create or replace function public._result(p_uid uuid, p_delta bigint, p_with_farm boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gold', (select gold from public.profiles where id = p_uid),
    'inventory', public._inventory_json(p_uid),
    'goldDelta', p_delta,
    'serverNow', public._ms(clock_timestamp()),
    'stats', public._stats_json(p_uid),
    'farm', case when p_with_farm then public._farm_json(p_uid) else null end);
$$;

-- 수량 변경: 음수 결과가 되면 예외 (재고 이상으로 소비 불가)
create or replace function public._add_item(p_uid uuid, p_item text, p_delta int, p_err text default 'NOT_ENOUGH_ITEMS')
returns void language plpgsql security definer set search_path = public as $$
declare q int;
begin
  if p_delta = 0 then return; end if;
  if p_delta > 0 then
    insert into public.inventory_items (player_id, item_id, quantity) values (p_uid, p_item, p_delta)
    on conflict (player_id, item_id) do update set quantity = public.inventory_items.quantity + excluded.quantity;
  else
    update public.inventory_items set quantity = quantity + p_delta
      where player_id = p_uid and item_id = p_item and quantity + p_delta >= 0
      returning quantity into q;
    if not found then raise exception '%', p_err; end if;
    if q = 0 then delete from public.inventory_items where player_id = p_uid and item_id = p_item; end if;
  end if;
end $$;

-- 플레이어 잠금 + 멱등성 확인. 이미 처리된 request_id 면 이전 결과를 돌려줌.
create or replace function public._begin(p_uid uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cached jsonb;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 80 then
    raise exception 'INVALID_QTY';
  end if;
  perform 1 from public.profiles where id = p_uid for update;
  select result into cached from public.economy_transactions where player_id = p_uid and request_id = p_request_id;
  return cached;
end $$;

create or replace function public._kst_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- ───────────────────────────── 슬롯 / 캐릭터 ─────────────────────────────
create or replace function public.claim_player_slot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s record;
  st record;
  used int;
  free_no int;
  v_email text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- 전역 설정 행을 잠가서 동시 가입 시에도 정원을 넘지 않도록 직렬화
  select * into st from public.game_settings where id = 1 for update;
  select * into s from public.player_slots where user_id = uid;
  if found then
    if s.active then return jsonb_build_object('status', 'ok', 'slot', s.slot_no); end if;
    return jsonb_build_object('status', 'inactive');
  end if;
  if st.signup_mode = 'allowlist' then
    select email into v_email from auth.users where id = uid;
    if not exists (select 1 from public.player_allowlist a where lower(a.email) = lower(v_email)) then
      return jsonb_build_object('status', 'not_approved');
    end if;
  end if;
  select count(*) into used from public.player_slots where active;
  if used >= st.max_players then
    return jsonb_build_object('status', 'full', 'max', st.max_players);
  end if;
  select min(n) into free_no from generate_series(1, st.max_players + 1000) n
    where not exists (select 1 from public.player_slots ps where ps.slot_no = n);
  insert into public.player_slots (slot_no, user_id) values (free_no, uid);
  return jsonb_build_object('status', 'ok', 'slot', free_no);
end $$;

create or replace function public.get_my_character()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nickname', nickname, 'appearance', appearance) from public.profiles where id = auth.uid();
$$;

create or replace function public._clamp_int(v jsonb, n int, d int)
returns int language plpgsql immutable as $$
declare i int;
begin
  if v is null or jsonb_typeof(v) <> 'number' then return d; end if;
  i := (v #>> '{}')::numeric::int;
  if i < 0 or i >= n then return d; end if;
  return i;
end $$;

create or replace function public.save_character(p_nickname text, p_appearance jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nick text := btrim(coalesce(p_nickname, ''));
  app jsonb;
  is_new boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.player_slots where user_id = uid and active) then raise exception 'NO_SLOT'; end if;
  if nick !~ '^[가-힣a-zA-Z0-9_]{2,10}$' then raise exception 'NICKNAME_INVALID'; end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(nick) and id <> uid) then
    raise exception 'NICKNAME_TAKEN';
  end if;
  -- 외형 값은 서버에서 허용 범위로 정규화 (임의 JSON 저장 방지)
  app := jsonb_build_object(
    'hair',        public._clamp_int(p_appearance -> 'hair', 8, 0),
    'hairColor',   public._clamp_int(p_appearance -> 'hairColor', 8, 0),
    'skin',        public._clamp_int(p_appearance -> 'skin', 5, 1),
    'outfit',      public._clamp_int(p_appearance -> 'outfit', 4, 0),
    'outfitColor', public._clamp_int(p_appearance -> 'outfitColor', 8, 0));

  is_new := not exists (select 1 from public.profiles where id = uid);
  if is_new then
    insert into public.profiles (id, nickname, appearance, gold)
      values (uid, nick, app, 300);
    insert into public.farms (owner_id, level) values (uid, 1);
    insert into public.farm_plots (owner_id, x, y)
      select uid, gx, gy from generate_series(0, 2) gx, generate_series(0, 2) gy;
    insert into public.inventory_items (player_id, item_id, quantity) values
      (uid, 'tool:hoe', 1), (uid, 'tool:watering_can', 1), (uid, 'tool:basket', 1);
    insert into public.player_statistics (player_id) values (uid);
  else
    update public.profiles set nickname = nick, appearance = app, updated_at = now() where id = uid;
  end if;
exception when unique_violation then
  raise exception 'NICKNAME_TAKEN';
end $$;

create or replace function public.get_my_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return (
    select jsonb_build_object(
      'profile', jsonb_build_object(
        'id', p.id, 'nickname', p.nickname, 'appearance', p.appearance, 'gold', p.gold,
        'tutorialStep', p.tutorial_step, 'settings', p.settings, 'isAdmin', p.is_admin),
      'inventory', public._inventory_json(uid),
      'farm', public._farm_json(uid),
      'stats', public._stats_json(uid),
      'serverNow', public._ms(clock_timestamp()))
    from public.profiles p where p.id = uid);
end $$;

create or replace function public.start_session()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  update public.player_statistics
     set sessions = sessions + 1, first_played_at = coalesce(first_played_at, now()), last_played_at = now()
   where player_id = uid;
  update public.profiles set current_space = 'village' where id = uid;
end $$;

create or replace function public.enter_space(p_space text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); owner uuid;
begin
  if p_space = 'village' then
    update public.profiles set current_space = 'village' where id = uid;
    return;
  end if;
  if p_space !~ '^farm:[0-9a-fA-F-]{36}$' then raise exception 'INVALID_TARGET'; end if;
  owner := substring(p_space from 6)::uuid;
  if not exists (select 1 from public.farms where owner_id = owner) then raise exception 'INVALID_TARGET'; end if;
  update public.profiles set current_space = p_space where id = uid;
end $$;

create or replace function public.update_tutorial(p_step int)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); v int;
begin
  if p_step is null or p_step < 0 or p_step > 99 then raise exception 'INVALID_QTY'; end if;
  update public.profiles set tutorial_step = greatest(tutorial_step, p_step) where id = uid returning tutorial_step into v;
  return v;
end $$;

create or replace function public.update_settings(p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); vol numeric;
begin
  vol := least(1, greatest(0, coalesce((p_settings ->> 'volume')::numeric, 0.6)));
  update public.profiles set settings = jsonb_build_object(
    'volume', vol,
    'muted', coalesce((p_settings ->> 'muted')::boolean, false),
    'showChatLog', coalesce((p_settings ->> 'showChatLog')::boolean, true))
  where id = uid;
end $$;

-- ───────────────────────────── 농장 조회 ─────────────────────────────
create or replace function public.get_farm(p_owner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f jsonb;
begin
  perform public._require_player();
  f := public._farm_json(p_owner_id);
  if f is null then raise exception 'INVALID_TARGET'; end if;
  return jsonb_build_object('farm', f, 'serverNow', public._ms(clock_timestamp()));
end $$;

create or replace function public.list_residents()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_player();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'nickname', p.nickname, 'appearance', p.appearance,
      'farmLevel', f.level, 'farmSize', l.size) order by s.slot_no)
    from public.player_slots s
    join public.profiles p on p.id = s.user_id
    join public.farms f on f.owner_id = p.id
    join public.farm_levels l on l.level = f.level
    where s.active), '[]'::jsonb);
end $$;

-- ───────────────────────────── 경제 RPC ─────────────────────────────
create or replace function public.buy_seed(p_crop_id text, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; c record; cost bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into c from public.crop_types where id = p_crop_id;
  if not found then raise exception 'UNKNOWN_CROP'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception 'INVALID_QTY'; end if;
  cost := c.seed_price::bigint * p_qty;            -- 가격은 서버 기준 데이터에서만
  update public.profiles set gold = gold - cost where id = uid and gold >= cost;
  if not found then raise exception 'INSUFFICIENT_GOLD'; end if;
  perform public._add_item(uid, 'seed:' || p_crop_id, p_qty);
  res := public._result(uid, -cost, false);
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'buy', p_crop_id, p_qty, -cost, res);
  return res;
end $$;

create or replace function public.plant_crop(p_x int, p_y int, p_crop_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; c record; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into c from public.crop_types where id = p_crop_id;
  if not found then raise exception 'UNKNOWN_CROP'; end if;
  -- 항상 "내" 농장(owner_id = uid)의 해금된 밭에만 심을 수 있음
  if not exists (select 1 from public.farm_plots where owner_id = uid and x = p_x and y = p_y) then
    raise exception 'PLOT_LOCKED';
  end if;
  if exists (select 1 from public.planted_crops where owner_id = uid and x = p_x and y = p_y) then
    raise exception 'PLOT_OCCUPIED';
  end if;
  perform public._add_item(uid, 'seed:' || p_crop_id, -1, 'NOT_ENOUGH_SEEDS');
  insert into public.planted_crops (owner_id, x, y, crop_id, planted_at, ready_at)
    values (uid, p_x, p_y, p_crop_id, now(), now() + make_interval(secs => c.grow_seconds));
  update public.player_statistics set total_planted = total_planted + 1 where player_id = uid;
  res := public._result(uid, 0, true);
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, result)
    values (uid, p_request_id, 'plant', p_crop_id, 1, res);
  return res;
end $$;

create or replace function public.harvest_crop(p_x int, p_y int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; v_crop text; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  -- 서버 시간(now()) 기준으로 다 자란 "내" 작물만 삭제 → 삭제된 경우에만 지급 (중복 수확 불가)
  delete from public.planted_crops
   where owner_id = uid and x = p_x and y = p_y and ready_at <= now()
   returning crop_id into v_crop;
  if not found then
    if exists (select 1 from public.planted_crops where owner_id = uid and x = p_x and y = p_y) then
      raise exception 'NOT_READY';
    end if;
    raise exception 'PLOT_EMPTY';
  end if;
  perform public._add_item(uid, 'crop:' || v_crop, 1);
  update public.player_statistics
     set total_harvests = total_harvests + 1,
         crop_harvests = jsonb_set(crop_harvests, array[v_crop], to_jsonb(coalesce((crop_harvests ->> v_crop)::int, 0) + 1))
   where player_id = uid;
  res := public._result(uid, 0, true);
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, result)
    values (uid, p_request_id, 'harvest', v_crop, 1, res);
  return res;
end $$;

create or replace function public.sell_crop(p_crop_id text, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; c record; gain bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into c from public.crop_types where id = p_crop_id;
  if not found then raise exception 'UNKNOWN_CROP'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 9999 then raise exception 'INVALID_QTY'; end if;
  perform public._add_item(uid, 'crop:' || p_crop_id, -p_qty, 'NOT_ENOUGH_ITEMS');
  gain := c.sell_price::bigint * p_qty;
  update public.profiles set gold = gold + gain where id = uid;
  update public.player_statistics set total_sales_gold = total_sales_gold + gain, total_sold = total_sold + p_qty
   where player_id = uid;
  res := public._result(uid, gain, false);
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'sell', p_crop_id, p_qty, gain, res);
  return res;
end $$;

create or replace function public.sell_all_crops(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; r record; gain bigint := 0; cnt int := 0; res jsonb;
  first boolean := true; sold jsonb := '[]'::jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  for r in
    select i.item_id, i.quantity, c.id as crop_id, c.sell_price
      from public.inventory_items i join public.crop_types c on i.item_id = 'crop:' || c.id
     where i.player_id = uid and i.quantity > 0
     for update of i
  loop
    sold := sold || jsonb_build_array(jsonb_build_object('crop_id', r.crop_id, 'qty', r.quantity, 'gold', r.quantity::bigint * r.sell_price));
    gain := gain + r.quantity::bigint * r.sell_price;
    cnt := cnt + r.quantity;
    delete from public.inventory_items where player_id = uid and item_id = r.item_id;
  end loop;
  if cnt = 0 then raise exception 'NOTHING_TO_SELL'; end if;
  update public.profiles set gold = gold + gain where id = uid;
  update public.player_statistics set total_sales_gold = total_sales_gold + gain, total_sold = total_sold + cnt
   where player_id = uid;
  res := public._result(uid, gain, false);
  for r in select * from jsonb_to_recordset(sold) as x(crop_id text, qty int, gold bigint) loop
    insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, gold_delta, result)
      values (uid, case when first then p_request_id else p_request_id || ':' || r.crop_id end,
              'sell', r.crop_id, r.qty, r.gold, case when first then res else null end);
    first := false;
  end loop;
  return res;
end $$;

create or replace function public.expand_farm(p_target_level int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; cur int; max_lv int; lv record; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select level into cur from public.farms where owner_id = uid for update;
  select max(level) into max_lv from public.farm_levels;
  if cur >= max_lv then raise exception 'MAX_LEVEL'; end if;
  if p_target_level is distinct from cur + 1 then raise exception 'INVALID_LEVEL'; end if; -- 중복/건너뛰기 방지
  select * into lv from public.farm_levels where level = p_target_level;
  update public.profiles set gold = gold - lv.cost where id = uid and gold >= lv.cost;
  if not found then raise exception 'INSUFFICIENT_GOLD'; end if;
  update public.farms set level = p_target_level, updated_at = now() where owner_id = uid;
  insert into public.farm_plots (owner_id, x, y)
    select uid, gx, gy from generate_series(0, lv.size - 1) gx, generate_series(0, lv.size - 1) gy
    on conflict do nothing;                              -- 기존 밭과 작물은 그대로 유지
  res := public._result(uid, -lv.cost, true);
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'expand', p_target_level, -lv.cost, res);
  return res;
end $$;

-- ───────────────────────────── 일일 퀘스트 ─────────────────────────────
create or replace function public.get_daily_quests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', q.id,
      'progress', least(q.target, coalesce((
        select sum(t.quantity) from public.economy_transactions t
         where t.player_id = uid and t.kind = q.kind
           and (q.crop_id is null or t.crop_id = q.crop_id)
           and (t.created_at at time zone 'Asia/Seoul')::date = public._kst_today()), 0)),
      'claimed', exists (select 1 from public.quest_claims c
                          where c.player_id = uid and c.quest_id = q.id and c.quest_date = public._kst_today())
    ) order by q.id)
    from public.quest_defs q), '[]'::jsonb);
end $$;

create or replace function public.claim_quest(p_quest_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; q record; prog bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into q from public.quest_defs where id = p_quest_id;
  if not found then raise exception 'UNKNOWN_QUEST'; end if;
  if exists (select 1 from public.quest_claims where player_id = uid and quest_id = q.id and quest_date = public._kst_today()) then
    raise exception 'QUEST_CLAIMED';
  end if;
  select coalesce(sum(t.quantity), 0) into prog from public.economy_transactions t
   where t.player_id = uid and t.kind = q.kind and (q.crop_id is null or t.crop_id = q.crop_id)
     and (t.created_at at time zone 'Asia/Seoul')::date = public._kst_today();
  if prog < q.target then raise exception 'QUEST_NOT_DONE'; end if;
  insert into public.quest_claims (player_id, quest_id, quest_date) values (uid, q.id, public._kst_today());
  update public.profiles set gold = gold + q.reward where id = uid;
  res := public._result(uid, q.reward, false);
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'quest', 0, q.reward, res);
  return res;
end $$;

-- ───────────────────────────── 채팅 / 신고 / 차단 ─────────────────────────────
create or replace function public.send_chat(p_space text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; body text; recent int; new_id bigint;
begin
  select * into prof from public.profiles where id = uid for update;   -- 사용자별 직렬화 (도배 방지 정확도)
  body := regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g');          -- 줄바꿈/탭 → 공백 하나
  body := btrim(regexp_replace(body, '[[:cntrl:]]', '', 'g'));          -- 남은 제어문자 제거
  if body = '' then raise exception 'CHAT_EMPTY'; end if;
  if char_length(body) > 100 then raise exception 'CHAT_TOO_LONG'; end if;
  if prof.current_space is distinct from p_space then raise exception 'WRONG_SPACE'; end if;
  select count(*) into recent from public.chat_messages
   where sender_id = uid and created_at > now() - interval '5 seconds';
  if recent >= 5 then raise exception 'CHAT_RATE_LIMIT'; end if;
  -- 닉네임은 서버가 프로필에서 채움 → 사칭 불가
  insert into public.chat_messages (sender_id, nickname, space, body)
    values (uid, prof.nickname, p_space, body) returning id into new_id;
  return new_id;
end $$;

create or replace function public.report_player(p_target uuid, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'INVALID_TARGET';
  end if;
  insert into public.player_reports (reporter_id, target_id, reason, detail)
    values (uid, p_target, left(coalesce(p_reason, ''), 40), left(coalesce(p_detail, ''), 300));
end $$;

create or replace function public.set_block(p_target uuid, p_blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'INVALID_TARGET';
  end if;
  if p_blocked then
    insert into public.player_blocks (user_id, target_id) values (uid, p_target) on conflict do nothing;
  else
    delete from public.player_blocks where user_id = uid and target_id = p_target;
  end if;
end $$;

-- ───────────────────────────── 관리자 기능 ─────────────────────────────
create or replace function public._require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid and is_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  return uid;
end $$;

-- 슬롯 비활성화/재활성화 (비활성 계정은 모든 RPC 에서 차단됨)
create or replace function public.admin_set_slot_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.player_slots set active = p_active where user_id = p_user;
end $$;

-- 슬롯 완전 해제 (새 플레이어가 그 자리를 쓸 수 있음. 프로필/농장 데이터는 남겨둠)
create or replace function public.admin_release_slot(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.player_slots where user_id = p_user;
end $$;

create or replace function public.admin_update_settings(p_max_players int, p_signup_mode text, p_village_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.game_settings set
    max_players = coalesce(p_max_players, max_players),
    signup_mode = coalesce(p_signup_mode, signup_mode),
    village_name = coalesce(p_village_name, village_name),
    updated_at = now()
  where id = 1;
end $$;

-- ───────────────────────────── Row Level Security ─────────────────────────────
alter table public.game_settings        enable row level security;
alter table public.player_allowlist     enable row level security;
alter table public.crop_types           enable row level security;
alter table public.farm_levels          enable row level security;
alter table public.quest_defs           enable row level security;
alter table public.player_slots         enable row level security;
alter table public.profiles             enable row level security;
alter table public.farms                enable row level security;
alter table public.farm_plots           enable row level security;
alter table public.planted_crops        enable row level security;
alter table public.inventory_items      enable row level security;
alter table public.economy_transactions enable row level security;
alter table public.player_statistics    enable row level security;
alter table public.quest_claims         enable row level security;
alter table public.chat_messages        enable row level security;
alter table public.player_reports       enable row level security;
alter table public.player_blocks        enable row level security;

-- 쓰기 권한은 전부 회수 (RPC 를 통해서만 변경). anon 은 조회도 불가.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

drop policy if exists "settings readable" on public.game_settings;
create policy "settings readable" on public.game_settings for select to authenticated using (true);

drop policy if exists "crops readable" on public.crop_types;
create policy "crops readable" on public.crop_types for select to authenticated using (true);
drop policy if exists "levels readable" on public.farm_levels;
create policy "levels readable" on public.farm_levels for select to authenticated using (true);
drop policy if exists "quests readable" on public.quest_defs;
create policy "quests readable" on public.quest_defs for select to authenticated using (true);

drop policy if exists "own slot" on public.player_slots;
create policy "own slot" on public.player_slots for select to authenticated using (user_id = auth.uid());

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- 농장은 등록된 주민이라면 누구나 "조회"만 가능 (방문 기능)
drop policy if exists "farms visible to players" on public.farms;
create policy "farms visible to players" on public.farms for select to authenticated using (public.is_active_player());
drop policy if exists "plots visible to players" on public.farm_plots;
create policy "plots visible to players" on public.farm_plots for select to authenticated using (public.is_active_player());
drop policy if exists "crops visible to players" on public.planted_crops;
create policy "crops visible to players" on public.planted_crops for select to authenticated using (public.is_active_player());

drop policy if exists "own inventory" on public.inventory_items;
create policy "own inventory" on public.inventory_items for select to authenticated using (player_id = auth.uid());
drop policy if exists "own transactions" on public.economy_transactions;
create policy "own transactions" on public.economy_transactions for select to authenticated using (player_id = auth.uid());
drop policy if exists "own stats" on public.player_statistics;
create policy "own stats" on public.player_statistics for select to authenticated using (player_id = auth.uid());
drop policy if exists "own quest claims" on public.quest_claims;
create policy "own quest claims" on public.quest_claims for select to authenticated using (player_id = auth.uid());
drop policy if exists "own blocks" on public.player_blocks;
create policy "own blocks" on public.player_blocks for select to authenticated using (user_id = auth.uid());

-- 채팅: 활성 주민만 읽을 수 있고, 내가 차단한 사람의 메시지는 서버에서 걸러짐
drop policy if exists "chat readable" on public.chat_messages;
create policy "chat readable" on public.chat_messages for select to authenticated using (
  public.is_active_player()
  and not exists (select 1 from public.player_blocks b where b.user_id = auth.uid() and b.target_id = chat_messages.sender_id)
);
-- player_reports / player_allowlist: 정책 없음 → 클라이언트 조회 불가 (관리자는 대시보드에서 확인)

-- ───────────────────────────── 함수 실행 권한 ─────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_active_player(uuid),
  public.claim_player_slot(),
  public.get_my_character(),
  public.save_character(text, jsonb),
  public.get_my_state(),
  public.start_session(),
  public.enter_space(text),
  public.update_tutorial(int),
  public.update_settings(jsonb),
  public.get_farm(uuid),
  public.list_residents(),
  public.buy_seed(text, int, text),
  public.plant_crop(int, int, text, text),
  public.harvest_crop(int, int, text),
  public.sell_crop(text, int, text),
  public.sell_all_crops(text),
  public.expand_farm(int, text),
  public.get_daily_quests(),
  public.claim_quest(text, text),
  public.send_chat(text, text),
  public.report_player(uuid, text, text),
  public.set_block(uuid, boolean),
  public.admin_set_slot_active(uuid, boolean),
  public.admin_release_slot(uuid),
  public.admin_update_settings(int, text, text)
to authenticated;

-- ───────────────────────────── Realtime ─────────────────────────────
-- 채팅은 DB 에 저장된 행(서버가 닉네임을 채운 것)만 postgres_changes 로 전달 → 사칭 방지
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.chat_messages';
    end if;
  end if;
end $$;

-- Private Broadcast/Presence 채널 권한: 활성 주민만 space:* / online 채널에 접속 가능
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists "haetsal players can listen" on realtime.messages';
    execute 'drop policy if exists "haetsal players can send" on realtime.messages';
    execute $p$
      create policy "haetsal players can listen" on realtime.messages for select to authenticated
      using (
        public.is_active_player()
        and realtime.messages.extension in ('broadcast', 'presence')
        and (realtime.topic() in ('space:village', 'online') or realtime.topic() ~ '^space:farm:[0-9a-f-]{36}$')
      )$p$;
    execute $p$
      create policy "haetsal players can send" on realtime.messages for insert to authenticated
      with check (
        public.is_active_player()
        and realtime.messages.extension in ('broadcast', 'presence')
        and (realtime.topic() in ('space:village', 'online') or realtime.topic() ~ '^space:farm:[0-9a-f-]{36}$')
      )$p$;
  end if;
end $$;
