-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 농장 방명록 (농장 우편함)
--   * 친구가 그 농장에 "방문한 상태"에서만 글을 남길 수 있음 (주인은 자기 방명록에 쓰지 않음)
--   * 모든 주민이 읽을 수 있음
--   * 지우기: 글쓴이 본인, 농장 주인, 관리자
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.guestbook_entries (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references public.profiles (id) on delete cascade,  -- 방명록 주인(농장 주인)
  author_id  uuid not null references public.profiles (id) on delete cascade,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now(),
  check (owner_id <> author_id)
);
create index if not exists guestbook_owner_time_idx on public.guestbook_entries (owner_id, created_at desc);
create index if not exists guestbook_author_time_idx on public.guestbook_entries (author_id, created_at desc);

create or replace function public.write_guestbook(p_owner uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; body text; new_id bigint;
begin
  select * into prof from public.profiles where id = uid for update;   -- 사용자별 직렬화
  if p_owner is null or not exists (select 1 from public.farms where owner_id = p_owner) then
    raise exception 'INVALID_TARGET';
  end if;
  if p_owner = uid then raise exception 'OWN_GUESTBOOK'; end if;
  -- 실제로 그 농장에 놀러 와 있어야 함
  if prof.current_space is distinct from ('farm:' || p_owner::text) then raise exception 'WRONG_SPACE'; end if;
  body := regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g');
  body := btrim(regexp_replace(body, '[[:cntrl:]]', '', 'g'));
  if body = '' then raise exception 'GUESTBOOK_EMPTY'; end if;
  if char_length(body) > 120 then raise exception 'GUESTBOOK_TOO_LONG'; end if;
  if exists (select 1 from public.guestbook_entries where author_id = uid and created_at > now() - interval '15 seconds') then
    raise exception 'GUESTBOOK_RATE_LIMIT';
  end if;
  -- 닉네임은 서버가 프로필에서 채움 → 사칭 불가
  insert into public.guestbook_entries (owner_id, author_id, nickname, body)
    values (p_owner, uid, prof.nickname, body) returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.list_guestbook(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'ownerId', g.owner_id, 'authorId', g.author_id, 'nickname', g.nickname,
      'body', g.body, 'createdAt', public._ms(g.created_at)) order by g.created_at desc)
    from (select * from public.guestbook_entries e
           where e.owner_id = p_owner
             and not exists (select 1 from public.player_blocks k where k.user_id = uid and k.target_id = e.author_id)
           order by e.created_at desc limit 50) g), '[]'::jsonb);
end $$;

create or replace function public.delete_guestbook_entry(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  delete from public.guestbook_entries
   where id = p_id
     and (author_id = uid or owner_id = uid
          or exists (select 1 from public.profiles where id = uid and is_admin));
  if not found then raise exception 'INVALID_TARGET'; end if;
end $$;

-- ───────────────────────────── 보안 ─────────────────────────────
alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from anon;
revoke insert, update, delete, truncate on public.guestbook_entries from authenticated;
grant select on public.guestbook_entries to authenticated;

drop policy if exists "guestbook visible to players" on public.guestbook_entries;
create policy "guestbook visible to players" on public.guestbook_entries for select to authenticated using (public.is_active_player());

revoke execute on function
  public.write_guestbook(uuid, text), public.list_guestbook(uuid), public.delete_guestbook_entry(bigint)
from public, anon, authenticated;
grant execute on function
  public.write_guestbook(uuid, text), public.list_guestbook(uuid), public.delete_guestbook_entry(bigint)
to authenticated;
