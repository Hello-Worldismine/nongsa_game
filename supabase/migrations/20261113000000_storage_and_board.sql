-- ═══════════════════════════════════════════════════════════════════════
--  햇살마을 — 농장 보관함 + 주민 게시판
--   * 출하 상자 → "보관함": 주인만 넣고/빼기, 모든 주민이 내용과 최근 기록을 구경
--     (판매는 마을 농산물 판매소에서만)
--   * 분수대 위 "주민 게시판": 주민이 글을 쓰고, 모든 주민이 읽기
-- ═══════════════════════════════════════════════════════════════════════

-- 거래 기록에 보관함 넣기/빼기 종류 추가 + 아이템 ID 기록
alter table public.economy_transactions drop constraint if exists economy_transactions_kind_check;
alter table public.economy_transactions add constraint economy_transactions_kind_check
  check (kind in ('buy', 'sell', 'plant', 'harvest', 'expand', 'quest', 'deposit', 'withdraw'));
alter table public.economy_transactions add column if not exists item_id text;

-- ───────────────────────────── 보관함 ─────────────────────────────
create table if not exists public.storage_items (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  item_id  text not null check (item_id ~ '^(seed|crop):[a-z_]+$'),
  quantity int  not null check (quantity >= 0),
  primary key (owner_id, item_id)
);

create or replace function public._storage_json(p_owner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(item_id, quantity), '{}'::jsonb)
  from public.storage_items where owner_id = p_owner and quantity > 0;
$$;

create or replace function public._check_storage_item(p_item_id text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_item_id is null or p_item_id !~ '^(seed|crop):[a-z_]+$'
     or not exists (select 1 from public.crop_types where id = split_part(p_item_id, ':', 2)) then
    raise exception 'INVALID_ITEM';
  end if;
end $$;

-- 가방 → 보관함 (항상 "내" 보관함)
create or replace function public.storage_deposit(p_item_id text, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; res jsonb;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  perform public._check_storage_item(p_item_id);
  if p_qty is null or p_qty < 1 or p_qty > 9999 then raise exception 'INVALID_QTY'; end if;
  perform public._add_item(uid, p_item_id, -p_qty, 'NOT_ENOUGH_ITEMS');
  insert into public.storage_items (owner_id, item_id, quantity) values (uid, p_item_id, p_qty)
  on conflict (owner_id, item_id) do update set quantity = public.storage_items.quantity + excluded.quantity;
  res := public._result(uid, 0, false) || jsonb_build_object('storage', public._storage_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, item_id, quantity, result)
    values (uid, p_request_id, 'deposit', split_part(p_item_id, ':', 2), p_item_id, p_qty, res);
  return res;
end $$;

-- 보관함 → 가방
create or replace function public.storage_withdraw(p_item_id text, p_qty int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); cached jsonb; res jsonb; q int;
begin
  cached := public._begin(uid, p_request_id);
  if cached is not null then return cached; end if;
  perform public._check_storage_item(p_item_id);
  if p_qty is null or p_qty < 1 or p_qty > 9999 then raise exception 'INVALID_QTY'; end if;
  update public.storage_items set quantity = quantity - p_qty
   where owner_id = uid and item_id = p_item_id and quantity >= p_qty
   returning quantity into q;
  if not found then raise exception 'NOT_ENOUGH_STORED'; end if;
  if q = 0 then delete from public.storage_items where owner_id = uid and item_id = p_item_id; end if;
  perform public._add_item(uid, p_item_id, p_qty);
  res := public._result(uid, 0, false) || jsonb_build_object('storage', public._storage_json(uid));
  insert into public.economy_transactions (player_id, request_id, kind, crop_id, item_id, quantity, result)
    values (uid, p_request_id, 'withdraw', split_part(p_item_id, ':', 2), p_item_id, p_qty, res);
  return res;
end $$;

-- 누구의 보관함이든 구경 (내용 + 최근 넣고/뺀 기록 15개)
create or replace function public.get_storage(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare nick text;
begin
  perform public._require_player();
  select nickname into nick from public.profiles where id = p_owner;
  if nick is null then raise exception 'INVALID_TARGET'; end if;
  return jsonb_build_object(
    'ownerId', p_owner,
    'ownerNickname', nick,
    'items', public._storage_json(p_owner),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', t.kind, 'itemId', t.item_id, 'qty', t.quantity, 'at', public._ms(t.created_at))
                       order by t.created_at desc)
      from (select * from public.economy_transactions
             where player_id = p_owner and kind in ('deposit', 'withdraw')
             order by created_at desc limit 15) t), '[]'::jsonb));
end $$;

-- ───────────────────────────── 주민 게시판 ─────────────────────────────
create table if not exists public.board_posts (
  id         bigint generated always as identity primary key,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists board_posts_time_idx on public.board_posts (created_at desc);
create index if not exists board_posts_author_time_idx on public.board_posts (author_id, created_at desc);

create or replace function public.create_board_post(p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player(); prof record; body text; new_id bigint;
begin
  select * into prof from public.profiles where id = uid for update;   -- 사용자별 직렬화 (도배 방지 정확도)
  body := replace(coalesce(p_body, ''), E'\r\n', E'\n');
  body := regexp_replace(body, E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', '', 'g'); -- 줄바꿈만 남기고 제어문자 제거
  body := regexp_replace(body, E'\n{3,}', E'\n\n', 'g');
  body := btrim(body, E' \n\t');
  if body = '' then raise exception 'BOARD_EMPTY'; end if;
  if char_length(body) > 200 then raise exception 'BOARD_TOO_LONG'; end if;
  if exists (select 1 from public.board_posts where author_id = uid and created_at > now() - interval '20 seconds') then
    raise exception 'BOARD_RATE_LIMIT';
  end if;
  -- 닉네임은 서버가 프로필에서 채움 → 사칭 불가
  insert into public.board_posts (author_id, nickname, body) values (uid, prof.nickname, body) returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.delete_board_post(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  delete from public.board_posts
   where id = p_id
     and (author_id = uid or exists (select 1 from public.profiles where id = uid and is_admin));
  if not found then raise exception 'INVALID_TARGET'; end if;
end $$;

create or replace function public.list_board_posts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := public._require_player();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'authorId', p.author_id, 'nickname', p.nickname, 'body', p.body, 'createdAt', public._ms(p.created_at))
      order by p.created_at desc)
    from (select * from public.board_posts b
           where not exists (select 1 from public.player_blocks k where k.user_id = uid and k.target_id = b.author_id)
           order by b.created_at desc limit 50) p), '[]'::jsonb);
end $$;

-- ───────────────────────────── 보안 ─────────────────────────────
alter table public.storage_items enable row level security;
alter table public.board_posts   enable row level security;

revoke all on public.storage_items, public.board_posts from anon;
revoke insert, update, delete, truncate on public.storage_items, public.board_posts from authenticated;
grant select on public.storage_items, public.board_posts to authenticated;

drop policy if exists "storage visible to players" on public.storage_items;
create policy "storage visible to players" on public.storage_items for select to authenticated using (public.is_active_player());
drop policy if exists "board visible to players" on public.board_posts;
create policy "board visible to players" on public.board_posts for select to authenticated using (public.is_active_player());

revoke execute on function
  public._storage_json(uuid), public._check_storage_item(text),
  public.storage_deposit(text, int, text), public.storage_withdraw(text, int, text), public.get_storage(uuid),
  public.create_board_post(text), public.delete_board_post(bigint), public.list_board_posts()
from public, anon, authenticated;

grant execute on function
  public.storage_deposit(text, int, text), public.storage_withdraw(text, int, text), public.get_storage(uuid),
  public.create_board_post(text), public.delete_board_post(bigint), public.list_board_posts()
to authenticated;
