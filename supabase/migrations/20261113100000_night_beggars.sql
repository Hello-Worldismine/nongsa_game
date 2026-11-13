-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 낮과 밤 + 마을 거지
--   * 30분 주기: 낮 20분 → 밤 10분 (서버 시각 기준이라 모두 같은 시간)
--   * 밤에는 마을에 거지 5명이 돌아다니며 주민을 쫓아옴
--   * 잡히면 10~100G (10G 단위) 를 뜯김 — 거지 한 명당 주민마다 하루(한국 날짜) 1번만
--   * 뜯긴 주민의 말풍선/채팅으로 "마을 거지에게 돈을 갈취당했습니다" 가 떠서 주위 주민도 알 수 있음
--   ⚠ src/config/night.ts 와 같아야 합니다
-- ═══════════════════════════════════════════════════════════════════════

alter table public.economy_transactions drop constraint if exists economy_transactions_kind_check;
alter table public.economy_transactions add constraint economy_transactions_kind_check
  check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest', 'deposit', 'withdraw',
                  'fruit', 'casino_bet', 'casino_refund', 'casino_win', 'water', 'wish',
                  'fish', 'fertilize', 'house_expand', 'furniture', 'robbed'));

create table if not exists public.beggar_robberies (
  player_id  uuid not null references public.profiles (id) on delete cascade,
  beggar_id  int  not null check (beggar_id between 1 and 5),
  day        date not null,
  amount     int  not null check (amount >= 0),
  created_at timestamptz not null default now(),
  primary key (player_id, beggar_id, day)
);

-- 지금이 밤인가? (30분 주기 중 20~30분 구간, 통신 지연을 감안해 밤이 끝난 뒤 5초까지 인정)
create or replace function public._is_night()
returns boolean language sql stable as $$
  select mod(extract(epoch from now())::numeric, 1800) >= 1200 or mod(extract(epoch from now())::numeric, 1800) < 5;
$$;

create or replace function public._beggar_json(p_uid uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(beggar_id order by beggar_id), '[]'::jsonb)
  from public.beggar_robberies where player_id = p_uid and day = public._kst_today();
$$;

-- 오늘 나를 이미 털어 간 거지 목록
create or replace function public.beggar_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return jsonb_build_object('robbed', public._beggar_json(uid), 'serverNow', public._ms(clock_timestamp()));
end $$;

-- 거지에게 잡힘 → 10~100G (10G 단위, 가진 돈까지만)
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
  amt := least((1 + floor(random() * 10))::int * 10, (prof.gold / 10)::int * 10);
  update public.profiles set gold = gold - amt where id = uid;
  insert into public.beggar_robberies (player_id, beggar_id, day, amount) values (uid, p_beggar, public._kst_today(), amt);
  -- 뜯긴 사람의 말풍선 + 마을 채팅으로 → 주위 주민도 알 수 있음
  insert into public.chat_messages (sender_id, nickname, space, body)
    values (uid, prof.nickname, 'village',
            case when amt > 0 then '💸 마을 거지에게 돈을 갈취당했습니다! (-' || amt || 'G)'
                 else '💸 마을 거지가 주머니를 뒤졌지만 텅 비어 있었어요…' end);
  res := public._result(uid, -amt, false) || jsonb_build_object('amount', amt, 'beggar', p_beggar, 'robbed', public._beggar_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, quantity, gold_delta, result)
    values (uid, p_request_id, 'robbed', p_beggar, -amt, res);
  return res;
end $$;

alter table public.beggar_robberies enable row level security;
revoke all on public.beggar_robberies from anon;
revoke insert, update, delete, truncate on public.beggar_robberies from authenticated;
grant select on public.beggar_robberies to authenticated;
drop policy if exists "own robberies" on public.beggar_robberies;
create policy "own robberies" on public.beggar_robberies for select to authenticated using (player_id = auth.uid());

revoke execute on function public._beggar_json(uuid), public.beggar_status(), public.beggar_rob(int, text) from public, anon, authenticated;
grant execute on function public.beggar_status(), public.beggar_rob(int, text) to authenticated;
