-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 낚시 · 비료 · 집(들어가기/확장) · 가구(색상 선택, 배치)
--   * 상점: 비료 / 낚싯대 / 가구를 서버 기준 가격으로 판매 (씨앗은 기존 crop_types)
--   * 낚시: 서버가 입질 시각을 정하고, 낚싯대 등급에 따른 확률로 물고기를 뽑음
--   * 비료: 내 밭의 자라는 작물 한 칸에 사용 → 수확까지 4분 / 10분 단축
--   * 집: 농장 집에 들어갈 수 있고(친구 집도 구경), 돈을 내고 넓힐 수 있음
--   * 가구: 색상까지 골라서 구매 → 집 안 원하는 칸에 배치 / 옮기기 / 보관
-- ═══════════════════════════════════════════════════════════════════════

alter table public.economy_transactions drop constraint if exists economy_transactions_kind_check;
alter table public.economy_transactions add constraint economy_transactions_kind_check
  check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest', 'deposit', 'withdraw',
                  'fruit', 'casino_bet', 'casino_refund', 'casino_win', 'water', 'wish',
                  'fish', 'fertilize', 'house_expand', 'furniture'));

-- ───────────────────────────── 상점 품목 (씨앗 제외) ─────────────────────────────
create table if not exists public.shop_items (
  id       text primary key,                  -- fert:4 / rod:2 / furn:bed
  category text not null check (category in ('fertilizer', 'rod', 'furniture')),
  name     text not null,
  price    int  not null check (price > 0),
  minutes  int  not null default 0,           -- 비료: 단축 시간(분)
  tier     int  not null default 0,           -- 낚싯대 등급
  w        int  not null default 1,           -- 가구 크기(칸)
  h        int  not null default 1,
  walkable boolean not null default false,    -- 러그·쿠션처럼 밟고 지나갈 수 있는 가구
  sort     int  not null default 0
);

-- ⚠ src/config/shop.ts 와 값이 같아야 합니다 (tests/unit/configSync.test.ts 에서 검사)
insert into public.shop_items (id, category, name, price, minutes, tier, w, h, walkable, sort) values
  ('fert:4',  'fertilizer', '4분 비료',  80, 4, 0, 1, 1, false, 1),
  ('fert:10', 'fertilizer', '10분 비료', 200, 10, 0, 1, 1, false, 2),
  ('rod:1', 'rod', '나무 낚싯대',   150, 0, 1, 1, 1, false, 1),
  ('rod:2', 'rod', '대나무 낚싯대', 800, 0, 2, 1, 1, false, 2),
  ('rod:3', 'rod', '은빛 낚싯대',   3000, 0, 3, 1, 1, false, 3),
  ('rod:4', 'rod', '황금 낚싯대',   10000, 0, 4, 1, 1, false, 4),
  ('furn:bed',       'furniture', '포근 침대',    400, 0, 0, 1, 2, false, 1),
  ('furn:sofa',      'furniture', '말랑 소파',    600, 0, 0, 2, 1, false, 2),
  ('furn:chair',     'furniture', '나무 의자',    120, 0, 0, 1, 1, false, 3),
  ('furn:table',     'furniture', '동그란 탁자',  200, 0, 0, 1, 1, false, 4),
  ('furn:desk',      'furniture', '작은 책상',    350, 0, 0, 2, 1, false, 5),
  ('furn:bookshelf', 'furniture', '책장',         500, 0, 0, 2, 1, false, 6),
  ('furn:wardrobe',  'furniture', '옷장',         450, 0, 0, 1, 1, false, 7),
  ('furn:lamp',      'furniture', '스탠드 조명',  180, 0, 0, 1, 1, false, 8),
  ('furn:plant',     'furniture', '화분',         100, 0, 0, 1, 1, false, 9),
  ('furn:teddy',     'furniture', '곰인형',       150, 0, 0, 1, 1, false, 10),
  ('furn:rug',       'furniture', '폭신 러그',    300, 0, 0, 2, 2, true, 11),
  ('furn:cushion',   'furniture', '방석',          80, 0, 0, 1, 1, true, 12)
on conflict (id) do update set category = excluded.category, name = excluded.name, price = excluded.price,
  minutes = excluded.minutes, tier = excluded.tier, w = excluded.w, h = excluded.h,
  walkable = excluded.walkable, sort = excluded.sort;

-- 상점 구매 (가구는 색상 0~7 을 골라서 'furn:종류:색상' 아이템이 됨)
create or replace function public.buy_item(p_item_id text, p_color int, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; s record; inv_id text; cost bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into s from public.shop_items where id = p_item_id;
  if not found then raise exception 'UNKNOWN_ITEM'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception 'INVALID_QTY'; end if;
  inv_id := p_item_id;
  if s.category = 'furniture' then
    if p_color is null or p_color < 0 or p_color > 7 then raise exception 'INVALID_COLOR'; end if;
    if p_qty > 10 then raise exception 'INVALID_QTY'; end if;
    inv_id := p_item_id || ':' || p_color;
  elsif s.category = 'rod' then
    if p_qty <> 1 then raise exception 'INVALID_QTY'; end if;
    if exists (select 1 from public.inventory_items where player_id = uid and item_id = inv_id and quantity > 0) then
      raise exception 'ALREADY_OWNED';
    end if;
  end if;
  cost := s.price::bigint * p_qty;
  update public.profiles set gold = gold - cost where id = uid and gold >= cost;
  if not found then raise exception 'INSUFFICIENT_GOLD'; end if;
  perform public._add_item(uid, inv_id, p_qty);
  res := public._result(uid, -cost, false);
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'buy', inv_id, p_qty, -cost, res);
  return res;
end $$;

-- ───────────────────────────── 낚시 ─────────────────────────────
create table if not exists public.fish_types (
  id    text primary key,
  name  text not null,
  price int  not null check (price > 0),
  sort  int  not null default 0
);
-- ⚠ src/config/shop.ts 와 같아야 합니다
insert into public.fish_types (id, name, price, sort) values
  ('minnow', '피라미', 6, 1), ('crucian', '붕어', 12, 2), ('carp', '잉어', 25, 3), ('catfish', '메기', 45, 4),
  ('trout', '송어', 70, 5), ('salmon', '연어', 120, 6), ('eel', '뱀장어', 200, 7), ('goldfish', '황금잉어', 500, 8)
on conflict (id) do update set name = excluded.name, price = excluded.price, sort = excluded.sort;

-- 낚싯대 등급별 물고기 확률(가중치)
create table if not exists public.fish_weights (
  tier    int  not null,
  fish_id text not null references public.fish_types (id),
  weight  int  not null check (weight >= 0),
  primary key (tier, fish_id)
);
insert into public.fish_weights (tier, fish_id, weight) values
  (1, 'minnow', 45), (1, 'crucian', 35), (1, 'carp', 15), (1, 'catfish', 5),
  (2, 'minnow', 25), (2, 'crucian', 30), (2, 'carp', 25), (2, 'catfish', 12), (2, 'trout', 6), (2, 'salmon', 2),
  (3, 'minnow', 10), (3, 'crucian', 20), (3, 'carp', 25), (3, 'catfish', 20), (3, 'trout', 13), (3, 'salmon', 8), (3, 'eel', 3), (3, 'goldfish', 1),
  (4, 'minnow', 5), (4, 'crucian', 10), (4, 'carp', 18), (4, 'catfish', 22), (4, 'trout', 18), (4, 'salmon', 15), (4, 'eel', 8), (4, 'goldfish', 4)
on conflict (tier, fish_id) do update set weight = excluded.weight;

create table if not exists public.fishing_sessions (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  tier      int not null,
  bite_at   timestamptz not null,
  cast_at   timestamptz not null default now()
);

-- 찌 던지기: 서버가 8~20초 뒤 입질 시각을 정함 (가장 좋은 낚싯대 등급으로)
create or replace function public.fish_cast()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; v_tier int; v_bite timestamptz;
begin
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from 'village' and prof.current_space !~ '^farm:' then raise exception 'NO_WATER_HERE'; end if;
  select max(s.tier) into v_tier from public.inventory_items i join public.shop_items s on s.id = i.item_id
   where i.player_id = uid and i.quantity > 0 and s.category = 'rod';
  if v_tier is null then raise exception 'NO_ROD'; end if;
  v_bite := now() + make_interval(secs => 8 + random() * 12);
  insert into public.fishing_sessions (player_id, tier, bite_at, cast_at) values (uid, v_tier, v_bite, now())
  on conflict (player_id) do update set tier = excluded.tier, bite_at = excluded.bite_at, cast_at = excluded.cast_at;
  return jsonb_build_object('biteAt', public._ms(v_bite), 'serverNow', public._ms(clock_timestamp()), 'tier', v_tier);
end $$;

-- 낚싯대 당기기: 입질 후 3초 안이어야 잡힘
create or replace function public.fish_reel(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; s record; total int; roll int; acc int := 0; w record; v_fish text; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into s from public.fishing_sessions where player_id = uid for update;
  if not found then raise exception 'NOT_FISHING'; end if;
  if now() < s.bite_at then raise exception 'FISH_TOO_EARLY'; end if;
  delete from public.fishing_sessions where player_id = uid;
  if now() > s.bite_at + interval '4 seconds' then  -- 화면엔 3초, 통신 지연 1초 여유
    insert into public.economy_transactions (player_id, request_id, kind, quantity, result)
      values (uid, p_request_id, 'fish', 0, jsonb_build_object('escaped', true));
    return jsonb_build_object('escaped', true);
  end if;
  select sum(weight) into total from public.fish_weights where tier = s.tier;
  roll := floor(random() * total)::int;
  for w in select * from public.fish_weights where tier = s.tier and weight > 0 order by fish_id loop
    acc := acc + w.weight;
    if roll < acc then v_fish := w.fish_id; exit; end if;
  end loop;
  perform public._add_item(uid, 'fish:' || v_fish, 1);
  res := public._result(uid, 0, false) || jsonb_build_object('fish', v_fish);
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, result)
    values (uid, p_request_id, 'fish', 'fish:' || v_fish, 1, res);
  return res;
end $$;

-- 물고기 판매 (판매소)
create or replace function public.sell_item(p_item_id text, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; f record; gain bigint; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into f from public.fish_types where 'fish:' || id = p_item_id;
  if not found then raise exception 'UNKNOWN_ITEM'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 9999 then raise exception 'INVALID_QTY'; end if;
  perform public._add_item(uid, p_item_id, -p_qty, 'NOT_ENOUGH_ITEMS');
  gain := f.price::bigint * p_qty;
  update public.profiles set gold = gold + gain where id = uid;
  update public.player_statistics set total_sales_gold = total_sales_gold + gain, total_sold = total_sold + p_qty where player_id = uid;
  res := public._result(uid, gain, false);
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'sell', p_item_id, p_qty, gain, res);
  return res;
end $$;

-- 전체 판매: 작물 + 물고기
create or replace function public.sell_all_crops(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; r record; gain bigint := 0; cnt int := 0; res jsonb;
  first boolean := true; sold jsonb := '[]'::jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  for r in
    select i.item_id, i.quantity, c.id as crop_id, coalesce(c.sell_price, f.price) as price
      from public.inventory_items i
      left join public.crop_types c on i.item_id = 'crop:' || c.id
      left join public.fish_types f on i.item_id = 'fish:' || f.id
     where i.player_id = uid and i.quantity > 0 and (c.id is not null or f.id is not null)
     for update of i
  loop
    sold := sold || jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'crop_id', r.crop_id, 'qty', r.quantity, 'gold', r.quantity::bigint * r.price));
    gain := gain + r.quantity::bigint * r.price;
    cnt := cnt + r.quantity;
    delete from public.inventory_items where player_id = uid and item_id = r.item_id;
  end loop;
  if cnt = 0 then raise exception 'NOTHING_TO_SELL'; end if;
  update public.profiles set gold = gold + gain where id = uid;
  update public.player_statistics set total_sales_gold = total_sales_gold + gain, total_sold = total_sold + cnt where player_id = uid;
  res := public._result(uid, gain, false);
  for r in select * from jsonb_to_recordset(sold) as x(item_id text, crop_id text, qty int, gold bigint) loop
    insert into public.economy_transactions (player_id, request_id, kind, crop_id, item_id, quantity, gold_delta, result)
      values (uid, case when first then p_request_id else p_request_id || ':' || r.item_id end,
              'sell', r.crop_id, r.item_id, r.qty, r.gold, case when first then res else null end);
    first := false;
  end loop;
  return res;
end $$;

-- ───────────────────────────── 비료 ─────────────────────────────
create or replace function public.use_fertilizer(p_x int, p_y int, p_item_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; s record; v_ready timestamptz; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into s from public.shop_items where id = p_item_id and category = 'fertilizer';
  if not found then raise exception 'UNKNOWN_ITEM'; end if;
  select ready_at into v_ready from public.planted_crops where owner_id = uid and x = p_x and y = p_y for update;
  if v_ready is null then raise exception 'PLOT_EMPTY'; end if;
  if v_ready <= now() then raise exception 'CROP_ALREADY_READY'; end if;
  perform public._add_item(uid, p_item_id, -1, 'NO_FERTILIZER');
  update public.planted_crops set ready_at = greatest(now(), ready_at - make_interval(mins => s.minutes))
   where owner_id = uid and x = p_x and y = p_y;
  res := public._result(uid, 0, true);
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, result)
    values (uid, p_request_id, 'fertilize', p_item_id, 1, res);
  return res;
end $$;

-- ───────────────────────────── 집 / 가구 ─────────────────────────────
create table if not exists public.house_levels (
  level int primary key,
  w     int not null check (w between 3 and 30),
  h     int not null check (h between 3 and 30),
  cost  int not null check (cost >= 0)
);
-- ⚠ src/config/shop.ts 와 같아야 합니다
insert into public.house_levels (level, w, h, cost) values
  (1, 6, 4, 0), (2, 8, 5, 1500), (3, 10, 6, 4000), (4, 12, 7, 10000), (5, 14, 8, 25000)
on conflict (level) do update set w = excluded.w, h = excluded.h, cost = excluded.cost;

create table if not exists public.houses (
  owner_id   uuid primary key references public.profiles (id) on delete cascade,
  level      int not null default 1 references public.house_levels (level),
  updated_at timestamptz not null default now()
);

create table if not exists public.house_items (
  id       bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  type     text not null references public.shop_items (id),
  color    int  not null check (color between 0 and 7),
  x        int  not null,
  y        int  not null
);
create index if not exists house_items_owner_idx on public.house_items (owner_id);

create or replace function public._house_json(p_owner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ownerId', p.id, 'ownerNickname', p.nickname,
    'level', coalesce(h.level, 1), 'w', l.w, 'h', l.h,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.type, 'color', i.color, 'x', i.x, 'y', i.y) order by i.id)
                       from public.house_items i where i.owner_id = p.id), '[]'::jsonb))
  from public.profiles p
  left join public.houses h on h.owner_id = p.id
  join public.house_levels l on l.level = coalesce(h.level, 1)
  where p.id = p_owner;
$$;

create or replace function public.get_house(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  perform public._require_player();
  j := public._house_json(p_owner);
  if j is null then raise exception 'INVALID_TARGET'; end if;
  return j;
end $$;

create or replace function public.expand_house(p_target_level int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; cur int; max_lv int; lv record; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  insert into public.houses (owner_id, level) values (uid, 1) on conflict (owner_id) do nothing;
  select level into cur from public.houses where owner_id = uid for update;
  select max(level) into max_lv from public.house_levels;
  if cur >= max_lv then raise exception 'MAX_LEVEL'; end if;
  if p_target_level is distinct from cur + 1 then raise exception 'INVALID_LEVEL'; end if;
  select * into lv from public.house_levels where level = p_target_level;
  update public.profiles set gold = gold - lv.cost where id = uid and gold >= lv.cost;
  if not found then raise exception 'INSUFFICIENT_GOLD'; end if;
  update public.houses set level = p_target_level, updated_at = now() where owner_id = uid;
  res := public._result(uid, -lv.cost, false) || jsonb_build_object('house', public._house_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'house_expand', p_target_level, -lv.cost, res);
  return res;
end $$;

-- 가구가 그 자리에 들어갈 수 있는지 (집 크기 안 + 문 앞 비우기 + 다른 가구와 안 겹침)
create or replace function public._house_fits(p_owner uuid, p_type text, p_x int, p_y int, p_ignore bigint)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare t record; hw int; hh int; door_x int;
begin
  select * into t from public.shop_items where id = p_type and category = 'furniture';
  if not found then return false; end if;
  select l.w, l.h into hw, hh from public.house_levels l
    join (select coalesce((select level from public.houses where owner_id = p_owner), 1) as lv) c on c.lv = l.level;
  if p_x < 0 or p_y < 0 or p_x + t.w > hw or p_y + t.h > hh then return false; end if;
  door_x := hw / 2;
  -- 문 앞 칸(아래쪽 가운데)은 밟을 수 있는 가구만
  if not t.walkable and door_x >= p_x and door_x < p_x + t.w and hh - 1 >= p_y and hh - 1 < p_y + t.h then return false; end if;
  -- 같은 종류(밟는 가구끼리 / 일반 가구끼리)는 겹칠 수 없음 (러그 위 탁자는 가능)
  return not exists (
    select 1 from public.house_items i join public.shop_items s on s.id = i.type
     where i.owner_id = p_owner and i.id is distinct from p_ignore and s.walkable = t.walkable
       and i.x < p_x + t.w and p_x < i.x + s.w and i.y < p_y + t.h and p_y < i.y + s.h);
end $$;

create or replace function public.place_furniture(p_type text, p_color int, p_x int, p_y int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; prof record; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from ('house:' || uid::text) then raise exception 'NOT_IN_HOUSE'; end if;
  if (select count(*) from public.house_items where owner_id = uid) >= 80 then raise exception 'HOUSE_FULL'; end if;
  if not public._house_fits(uid, p_type, p_x, p_y, null) then raise exception 'CANT_PLACE'; end if;
  perform public._add_item(uid, p_type || ':' || p_color, -1, 'NO_FURNITURE');
  insert into public.house_items (owner_id, type, color, x, y) values (uid, p_type, p_color, p_x, p_y);
  res := public._result(uid, 0, false) || jsonb_build_object('house', public._house_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, result)
    values (uid, p_request_id, 'furniture', p_type || ':' || p_color, 1, res);
  return res;
end $$;

create or replace function public.move_furniture(p_id bigint, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); it record;
begin
  select * into it from public.house_items where id = p_id and owner_id = uid for update;
  if not found then raise exception 'INVALID_TARGET'; end if;
  if not public._house_fits(uid, it.type, p_x, p_y, it.id) then raise exception 'CANT_PLACE'; end if;
  update public.house_items set x = p_x, y = p_y where id = p_id;
  return jsonb_build_object('house', public._house_json(uid));
end $$;

create or replace function public.store_furniture(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); it record;
begin
  delete from public.house_items where id = p_id and owner_id = uid returning * into it;
  if it.id is null then raise exception 'INVALID_TARGET'; end if;
  perform public._add_item(uid, it.type || ':' || it.color, 1);
  return public._result(uid, 0, false) || jsonb_build_object('house', public._house_json(uid));
end $$;

-- 공간 이동: 마을 / 농장 / 집
create or replace function public.enter_space(p_space text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); owner uuid;
begin
  if p_space = 'village' then
    update public.profiles set current_space = 'village' where id = uid;
    return;
  end if;
  if p_space !~ '^(farm|house):[0-9a-fA-F-]{36}$' then raise exception 'INVALID_TARGET'; end if;
  owner := split_part(p_space, ':', 2)::uuid;
  if not exists (select 1 from public.farms where owner_id = owner) then raise exception 'INVALID_TARGET'; end if;
  update public.profiles set current_space = p_space where id = uid;
end $$;

-- ───────────────────────────── 보안 ─────────────────────────────
alter table public.shop_items       enable row level security;
alter table public.fish_types       enable row level security;
alter table public.fish_weights     enable row level security;
alter table public.fishing_sessions enable row level security;
alter table public.house_levels     enable row level security;
alter table public.houses           enable row level security;
alter table public.house_items      enable row level security;

revoke all on public.shop_items, public.fish_types, public.fish_weights, public.fishing_sessions,
  public.house_levels, public.houses, public.house_items from anon;
revoke insert, update, delete, truncate on public.shop_items, public.fish_types, public.fish_weights, public.fishing_sessions,
  public.house_levels, public.houses, public.house_items from authenticated;
grant select on public.shop_items, public.fish_types, public.fish_weights, public.fishing_sessions,
  public.house_levels, public.houses, public.house_items to authenticated;

drop policy if exists "shop items readable" on public.shop_items;
create policy "shop items readable" on public.shop_items for select to authenticated using (true);
drop policy if exists "fish readable" on public.fish_types;
create policy "fish readable" on public.fish_types for select to authenticated using (true);
drop policy if exists "fish weights readable" on public.fish_weights;
create policy "fish weights readable" on public.fish_weights for select to authenticated using (true);
drop policy if exists "own fishing" on public.fishing_sessions;
create policy "own fishing" on public.fishing_sessions for select to authenticated using (player_id = auth.uid());
drop policy if exists "house levels readable" on public.house_levels;
create policy "house levels readable" on public.house_levels for select to authenticated using (true);
drop policy if exists "houses visible" on public.houses;
create policy "houses visible" on public.houses for select to authenticated using (public.is_active_player());
drop policy if exists "house items visible" on public.house_items;
create policy "house items visible" on public.house_items for select to authenticated using (public.is_active_player());

revoke execute on function
  public.buy_item(text, int, int, text), public.fish_cast(), public.fish_reel(text), public.sell_item(text, int, text),
  public.use_fertilizer(int, int, text, text), public._house_json(uuid), public.get_house(uuid), public.expand_house(int, text),
  public._house_fits(uuid, text, int, int, bigint), public.place_furniture(text, int, int, int, text),
  public.move_furniture(bigint, int, int), public.store_furniture(bigint)
from public, anon, authenticated;
grant execute on function
  public.buy_item(text, int, int, text), public.fish_cast(), public.fish_reel(text), public.sell_item(text, int, text),
  public.use_fertilizer(int, int, text, text), public.get_house(uuid), public.expand_house(int, text),
  public.place_furniture(text, int, int, int, text), public.move_furniture(bigint, int, int), public.store_furniture(bigint)
to authenticated;

-- 실시간 채널: 집(space:house:…)도 활성 주민만
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
        and (realtime.topic() in ('space:village', 'online') or realtime.topic() ~ '^space:(farm|house):[0-9a-f-]{36}$')
      )$p$;
    execute $p$
      create policy "haetsal players can send" on realtime.messages for insert to authenticated
      with check (
        public.is_active_player()
        and realtime.messages.extension in ('broadcast', 'presence')
        and (realtime.topic() in ('space:village', 'online') or realtime.topic() ~ '^space:(farm|house):[0-9a-f-]{36}$')
      )$p$;
  end if;
end $$;
