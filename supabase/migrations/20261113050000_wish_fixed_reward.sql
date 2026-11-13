-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 분수 소원: 확률 없이 1분에 한 번, 빌 때마다 30G 확정
--   * 함수 이름은 그대로 두고 동작만 바꿈 (아직 새로고침하지 않은 화면도 그대로 동작)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.make_wish()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; last_w timestamptz;
begin
  select * into prof from public.profiles where id = uid for update;
  if prof.current_space is distinct from 'village' then raise exception 'WRONG_SPACE'; end if;
  select wished_at into last_w from public.wish_logs where player_id = uid;
  if last_w is not null and last_w > now() - interval '1 minute' then raise exception 'WISH_COOLDOWN'; end if;
  insert into public.wish_logs (player_id, wished_at) values (uid, now())
  on conflict (player_id) do update set wished_at = excluded.wished_at;
  update public.profiles set gold = gold + 30 where id = uid;
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta)
    values (uid, 'wish-' || uid || '-' || public._ms(clock_timestamp()), 'wish', 0, 30);
  return jsonb_build_object('won', true, 'reward', 30, 'gold', (select gold from public.profiles where id = uid));
end $$;
