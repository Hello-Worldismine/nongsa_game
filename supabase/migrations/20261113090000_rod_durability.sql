-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 낚싯대 내구도 (소모품)
--   * 낚싯대마다 쓸 수 있는 횟수가 있고, 물고기를 낚거나 놓칠 때 1회씩 줄어듦
--   * 다 쓰면 낚싯대가 사라짐 → 상점에서 다시 구매
--   * 다 쓸 때까지 잡은 물고기를 팔면 구매가보다 평균적으로 더 벌도록 가격/횟수 조정
--       나무   80G · 10회 (평균 판매액 약 129G)
--       대나무 300G · 20회 (약 467G)
--       은빛   900G · 30회 (약 1,439G)
--       황금 2,000G · 40회 (약 3,300G)
--   ⚠ src/config/shop.ts 와 같아야 합니다
-- ═══════════════════════════════════════════════════════════════════════

alter table public.shop_items add column if not exists uses int not null default 0;

insert into public.shop_items (id, category, name, price, minutes, tier, w, h, walkable, sort, uses) values
  ('rod:1', 'rod', '나무 낚싯대',   80,   0, 1, 1, 1, false, 1, 10),
  ('rod:2', 'rod', '대나무 낚싯대', 300,  0, 2, 1, 1, false, 2, 20),
  ('rod:3', 'rod', '은빛 낚싯대',   900,  0, 3, 1, 1, false, 3, 30),
  ('rod:4', 'rod', '황금 낚싯대',   2000, 0, 4, 1, 1, false, 4, 40)
on conflict (id) do update set price = excluded.price, uses = excluded.uses, name = excluded.name, tier = excluded.tier;

-- 낚싯대 남은 횟수 (없으면 = 새 낚싯대, 가득 참)
create table if not exists public.rod_uses (
  player_id uuid not null references public.profiles (id) on delete cascade,
  item_id   text not null,
  uses_left int  not null check (uses_left >= 0),
  primary key (player_id, item_id)
);

-- 가지고 있는 낚싯대 → 남은 횟수
create or replace function public._rod_uses_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(i.item_id, coalesce(r.uses_left, s.uses)), '{}'::jsonb)
  from public.inventory_items i
  join public.shop_items s on s.id = i.item_id and s.category = 'rod'
  left join public.rod_uses r on r.player_id = i.player_id and r.item_id = i.item_id
  where i.player_id = p_uid and i.quantity > 0;
$$;

create or replace function public.rod_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return public._rod_uses_json(uid);
end $$;

-- 상점 구매: 낚싯대를 사면 횟수 가득
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
  if s.category = 'rod' then
    insert into public.rod_uses (player_id, item_id, uses_left) values (uid, inv_id, s.uses)
    on conflict (player_id, item_id) do update set uses_left = excluded.uses_left;
  end if;
  res := public._result(uid, -cost, false) || jsonb_build_object('rodUses', public._rod_uses_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, gold_delta, result)
    values (uid, p_request_id, 'buy', inv_id, p_qty, -cost, res);
  return res;
end $$;

-- 낚싯대 당기기: 낚든 놓치든 1회 사용, 다 쓰면 낚싯대가 사라짐
create or replace function public.fish_reel(p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; s record; total int; roll int; acc int := 0; w record;
  v_fish text; res jsonb; v_rod text; v_left int; v_broken boolean := false; v_escaped boolean;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into s from public.fishing_sessions where player_id = uid for update;
  if not found then raise exception 'NOT_FISHING'; end if;
  if now() < s.bite_at then raise exception 'FISH_TOO_EARLY'; end if;
  delete from public.fishing_sessions where player_id = uid;
  v_escaped := now() > s.bite_at + interval '4 seconds';  -- 화면엔 3초, 통신 지연 1초 여유

  -- 낚싯대 1회 사용
  v_rod := 'rod:' || s.tier;
  if exists (select 1 from public.inventory_items where player_id = uid and item_id = v_rod and quantity > 0) then
    select coalesce((select uses_left from public.rod_uses where player_id = uid and item_id = v_rod for update),
                    (select uses from public.shop_items where id = v_rod)) - 1 into v_left;
    if v_left <= 0 then
      delete from public.rod_uses where player_id = uid and item_id = v_rod;
      perform public._add_item(uid, v_rod, -1);
      v_broken := true;
    else
      insert into public.rod_uses (player_id, item_id, uses_left) values (uid, v_rod, v_left)
      on conflict (player_id, item_id) do update set uses_left = excluded.uses_left;
    end if;
  end if;

  if not v_escaped then
    select sum(weight) into total from public.fish_weights where tier = s.tier;
    roll := floor(random() * total)::int;
    for w in select * from public.fish_weights where tier = s.tier and weight > 0 order by fish_id loop
      acc := acc + w.weight;
      if roll < acc then v_fish := w.fish_id; exit; end if;
    end loop;
    perform public._add_item(uid, 'fish:' || v_fish, 1);
  end if;

  res := public._result(uid, 0, false) || jsonb_build_object(
    'fish', v_fish, 'escaped', v_escaped, 'rodId', v_rod, 'rodBroken', v_broken, 'rodUses', public._rod_uses_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, result)
    values (uid, p_request_id, 'fish', case when v_escaped then null else 'fish:' || v_fish end, case when v_escaped then 0 else 1 end, res);
  return res;
end $$;

alter table public.rod_uses enable row level security;
revoke all on public.rod_uses from anon;
revoke insert, update, delete, truncate on public.rod_uses from authenticated;
grant select on public.rod_uses to authenticated;
drop policy if exists "own rod uses" on public.rod_uses;
create policy "own rod uses" on public.rod_uses for select to authenticated using (player_id = auth.uid());

revoke execute on function public._rod_uses_json(uuid), public.rod_status(), public.buy_item(text, int, int, text), public.fish_reel(text)
  from public, anon, authenticated;
grant execute on function public.rod_status(), public.buy_item(text, int, int, text), public.fish_reel(text) to authenticated;
