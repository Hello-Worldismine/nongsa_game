-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 친구 밭에 물 주기 + 분수 소원
--   * 물 주기: 친구 농장에 놀러 가서 자라는 작물 한 칸에 R 키 → 그 칸의 수확까지 시간이 5분 줄어듦
--     (친구마다 30분에 한 번. 두 친구가 같은 칸에 주면 10분)
--   * 분수 소원: 1분에 한 번, 10% 확률로 10G
-- ═══════════════════════════════════════════════════════════════════════

alter table public.economy_transactions drop constraint if exists economy_transactions_kind_check;
alter table public.economy_transactions add constraint economy_transactions_kind_check
  check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest', 'deposit', 'withdraw',
                  'fruit', 'casino_bet', 'casino_refund', 'casino_win', 'water', 'wish'));

-- ───────────────────────────── 물 주기 ─────────────────────────────
create table if not exists public.water_logs (
  waterer_id uuid not null references public.profiles (id) on delete cascade,  -- 물 준 사람
  owner_id   uuid not null references public.profiles (id) on delete cascade,  -- 농장 주인
  x          smallint not null,
  y          smallint not null,
  watered_at timestamptz not null default now(),
  primary key (waterer_id, owner_id),                                            -- 친구마다 마지막 기록 하나
  check (waterer_id <> owner_id)
);

-- 최근 30분 안에 내가 물 준 농장 (농장 주인 → 시각 ms)
create or replace function public._water_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(owner_id, public._ms(watered_at)), '{}'::jsonb)
  from public.water_logs where waterer_id = p_uid and watered_at > now() - interval '30 minutes';
$$;

create or replace function public.water_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return jsonb_build_object('logs', public._water_json(uid), 'serverNow', public._ms(clock_timestamp()));
end $$;

create or replace function public.water_crop(p_owner uuid, p_x int, p_y int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; prof record; last_w timestamptz; v_crop text; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  if p_owner is null or not exists (select 1 from public.farms where owner_id = p_owner) then raise exception 'INVALID_TARGET'; end if;
  if p_owner = uid then raise exception 'OWN_FARM_WATER'; end if;
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from ('farm:' || p_owner::text) then raise exception 'WRONG_SPACE'; end if;
  select watered_at into last_w from public.water_logs where waterer_id = uid and owner_id = p_owner for update;
  if last_w is not null and last_w > now() - interval '30 minutes' then raise exception 'WATER_COOLDOWN'; end if;
  -- 아직 자라는 중인 작물만 (다 자란 작물·빈 밭은 물이 필요 없음)
  update public.planted_crops
     set ready_at = greatest(now(), ready_at - interval '5 minutes')
   where owner_id = p_owner and x = p_x and y = p_y and ready_at > now()
   returning crop_id into v_crop;
  if v_crop is null then
    if exists (select 1 from public.planted_crops where owner_id = p_owner and x = p_x and y = p_y) then
      raise exception 'CROP_ALREADY_READY';
    end if;
    raise exception 'PLOT_EMPTY';
  end if;
  insert into public.water_logs (waterer_id, owner_id, x, y, watered_at) values (uid, p_owner, p_x, p_y, now())
  on conflict (waterer_id, owner_id) do update set x = excluded.x, y = excluded.y, watered_at = excluded.watered_at;
  res := jsonb_build_object(
    'farm', public._farm_json(p_owner),
    'waterLogs', public._water_json(uid),
    'cropId', v_crop,
    'serverNow', public._ms(clock_timestamp()));
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, quantity, result)
    values (uid, p_request_id, 'water', v_crop, 1, res);
  return res;
end $$;

-- ───────────────────────────── 분수 소원 ─────────────────────────────
create table if not exists public.wish_logs (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  wished_at timestamptz not null default now()
);

create or replace function public.make_wish()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; last_w timestamptz; won boolean;
begin
  select * into prof from public.profiles where id = uid for update;
  if prof.current_space is distinct from 'village' then raise exception 'WRONG_SPACE'; end if;
  select wished_at into last_w from public.wish_logs where player_id = uid;
  if last_w is not null and last_w > now() - interval '1 minute' then raise exception 'WISH_COOLDOWN'; end if;
  insert into public.wish_logs (player_id, wished_at) values (uid, now())
  on conflict (player_id) do update set wished_at = excluded.wished_at;
  won := random() < 0.1;   -- 10% 확률
  if won then
    update public.profiles set gold = gold + 10 where id = uid;
    insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta)
      values (uid, 'wish-' || uid || '-' || public._ms(clock_timestamp()), 'wish', 0, 10);
  end if;
  return jsonb_build_object('won', won, 'gold', (select gold from public.profiles where id = uid));
end $$;

-- ───────────────────────────── 보안 ─────────────────────────────
alter table public.water_logs enable row level security;
alter table public.wish_logs  enable row level security;
revoke all on public.water_logs, public.wish_logs from anon;
revoke insert, update, delete, truncate on public.water_logs, public.wish_logs from authenticated;
grant select on public.water_logs, public.wish_logs to authenticated;

drop policy if exists "own water logs" on public.water_logs;
create policy "own water logs" on public.water_logs for select to authenticated using (waterer_id = auth.uid() or owner_id = auth.uid());
drop policy if exists "own wish log" on public.wish_logs;
create policy "own wish log" on public.wish_logs for select to authenticated using (player_id = auth.uid());

revoke execute on function
  public._water_json(uuid), public.water_status(), public.water_crop(uuid, int, int, text), public.make_wish()
from public, anon, authenticated;
grant execute on function
  public.water_status(), public.water_crop(uuid, int, int, text), public.make_wish()
to authenticated;
