-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 개인 알림 (누가 내 밭에 물을 줬는지)
--   * 친구가 물을 주면 농장 주인에게 서버가 알림을 저장 (문구도 서버가 만듦 → 흉내 불가)
--   * 주인은 마을/농장 어디에 있든 채팅창에 공지처럼 표시
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.notices (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,  -- 받는 사람
  kind       text not null default 'water',
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists notices_user_id_idx on public.notices (user_id, id desc);

-- 내 알림 중 p_after 보다 새 것 (최대 20개, 오래된 순)
create or replace function public.list_notices(p_after bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'createdAt', public._ms(n.created_at)) order by n.id)
    from (select * from public.notices
           where user_id = uid and id > coalesce(p_after, 0)
           order by id desc limit 20) n), '[]'::jsonb);
end $$;

-- 물 주기 (밭 전체) + 주인에게 알림
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
  update public.planted_crops
     set ready_at = greatest(now(), ready_at - interval '5 minutes')
   where owner_id = p_owner and ready_at > now();
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NOTHING_TO_WATER'; end if;
  insert into public.water_logs (waterer_id, owner_id, x, y, watered_at) values (uid, p_owner, 0, 0, now())
  on conflict (waterer_id, owner_id) do update set watered_at = excluded.watered_at;
  insert into public.notices (user_id, kind, body)
    values (p_owner, 'water', prof.nickname || '님이 내 밭에 물을 줬어요! 💧 (자라는 작물 ' || n || '개 수확 5분 단축)');
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

alter table public.notices enable row level security;
revoke all on public.notices from anon;
revoke insert, update, delete, truncate on public.notices from authenticated;
grant select on public.notices to authenticated;
drop policy if exists "own notices" on public.notices;
create policy "own notices" on public.notices for select to authenticated using (user_id = auth.uid());

revoke execute on function public.list_notices(bigint) from public, anon, authenticated;
grant execute on function public.list_notices(bigint) to authenticated;
