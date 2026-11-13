-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 비료는 한 칸에 한 번만
--   * 비료를 준 칸은 표시(fertilized)되고, 수확할 때까지 다시 줄 수 없음
--   * 수확하면 칸이 비워지므로 새로 심으면 다시 줄 수 있음
-- ═══════════════════════════════════════════════════════════════════════

alter table public.planted_crops add column if not exists fertilized boolean not null default false;

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
        'plantedAt', public._ms(c.planted_at), 'readyAt', public._ms(c.ready_at),
        'fertilized', c.fertilized) order by c.y, c.x)
      from public.planted_crops c where c.owner_id = f.owner_id), '[]'::jsonb))
  from public.farms f
  join public.profiles p on p.id = f.owner_id
  join public.farm_levels l on l.level = f.level
  where f.owner_id = p_owner;
$$;

create or replace function public.use_fertilizer(p_x int, p_y int, p_item_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; s record; c record; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  select * into s from public.shop_items where id = p_item_id and category = 'fertilizer';
  if not found then raise exception 'UNKNOWN_ITEM'; end if;
  select * into c from public.planted_crops where owner_id = uid and x = p_x and y = p_y for update;
  if not found then raise exception 'PLOT_EMPTY'; end if;
  if c.ready_at <= now() then raise exception 'CROP_ALREADY_READY'; end if;
  if c.fertilized then raise exception 'ALREADY_FERTILIZED'; end if;
  perform public._add_item(uid, p_item_id, -1, 'NO_FERTILIZER');
  update public.planted_crops set ready_at = greatest(now(), ready_at - make_interval(mins => s.minutes)), fertilized = true
   where owner_id = uid and x = p_x and y = p_y;
  res := public._result(uid, 0, true);
  insert into public.economy_transactions (player_id, request_id, kind, item_id, quantity, result)
    values (uid, p_request_id, 'fertilize', p_item_id, 1, res);
  return res;
end $$;
