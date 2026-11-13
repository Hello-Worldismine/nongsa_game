-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 낮과 밤 / 거지 조정
--   * 15분 주기: 낮 10분 → 밤 5분
--   * 거지가 뜯는 돈: 100~1000G (100G 단위, 가진 돈까지만 · 100G 미만이면 못 뜯음)
--   ⚠ src/config/night.ts 와 같아야 합니다
-- ═══════════════════════════════════════════════════════════════════════

-- 지금이 밤인가? (15분 주기 중 10~15분 구간, 통신 지연을 감안해 밤이 끝난 뒤 5초까지 인정)
create or replace function public._is_night()
returns boolean language sql stable as $$
  select mod(extract(epoch from now())::numeric, 900) >= 600 or mod(extract(epoch from now())::numeric, 900) < 5;
$$;

create or replace function public.beggar_rob(p_beggar int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; prof record; amt int; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  if p_beggar is null or p_beggar < 1 or p_beggar > 5 then raise exception 'INVALID_TARGET'; end if;
  select * into prof from public.profiles where id = uid;
  if prof.current_space is distinct from 'village' then raise exception 'WRONG_SPACE'; end if;
  if not public._is_night() then raise exception 'NOT_NIGHT'; end if;
  if exists (select 1 from public.beggar_robberies where player_id = uid and beggar_id = p_beggar and day = public._kst_today()) then
    raise exception 'ALREADY_ROBBED';
  end if;
  amt := least((1 + floor(random() * 10))::int * 100, (prof.gold / 100)::int * 100);
  update public.profiles set gold = gold - amt where id = uid;
  insert into public.beggar_robberies (player_id, beggar_id, day, amount) values (uid, p_beggar, public._kst_today(), amt);
  insert into public.chat_messages (sender_id, nickname, space, body)
    values (uid, prof.nickname, 'village',
            case when amt > 0 then '💸 마을 거지에게 돈을 갈취당했습니다! (-' || amt || 'G)'
                 else '💸 마을 거지가 주머니를 뒤졌지만 텅 비어 있었어요…' end);
  res := public._result(uid, -amt, false) || jsonb_build_object('amount', amt, 'beggar', p_beggar, 'robbed', public._beggar_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'robbed', p_beggar, -amt, res);
  return res;
end $$;

revoke execute on function public.beggar_rob(int, text) from public, anon, authenticated;
grant execute on function public.beggar_rob(int, text) to authenticated;
