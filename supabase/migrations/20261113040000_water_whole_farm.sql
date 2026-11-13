-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 물 주기를 "친구 밭 전체"로
--   * R 키 한 번 → 친구 농장에서 자라는 중인 작물 "모두" 수확까지 5분 단축
--   * 같은 친구 밭에는 30분에 한 번 (기존과 같음)
--   * 함수 이름/인자는 그대로 두고 동작만 바꿔서, 아직 새로고침하지 않은 화면도 그대로 동작
--     (p_x, p_y 는 더 이상 쓰지 않음)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.water_crop(p_owner uuid, p_x int, p_y int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; prof record; last_w timestamptz; n int; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  if p_owner is null or not exists (select 1 from public.farms where owner_id = p_owner) then raise exception 'INVALID_TARGET'; end if;
  if p_owner = uid then raise exception 'OWN_FARM_WATER'; end if;
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from ('farm:' || p_owner::text) then raise exception 'WRONG_SPACE'; end if;
  select watered_at into last_w from public.water_logs where waterer_id = uid and owner_id = p_owner for update;
  if last_w is not null and last_w > now() - interval '30 minutes' then raise exception 'WATER_COOLDOWN'; end if;
  -- 자라는 중인 작물 전부 5분 단축 (다 자란 작물은 그대로)
  update public.planted_crops
     set ready_at = greatest(now(), ready_at - interval '5 minutes')
   where owner_id = p_owner and ready_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOTHING_TO_WATER'; end if;
  insert into public.water_logs (waterer_id, owner_id, x, y, watered_at) values (uid, p_owner, 0, 0, now())
  on conflict (waterer_id, owner_id) do update set watered_at = excluded.watered_at;
  res := jsonb_build_object(
    'farm', public._farm_json(p_owner),
    'waterLogs', public._water_json(uid),
    'count', n,
    'cropId', null,
    'serverNow', public._ms(clock_timestamp()));
  insert into public.economy_transactions (player_id, request_id, kind, quantity, result)
    values (uid, p_request_id, 'water', n, res);
  return res;
end $$;
