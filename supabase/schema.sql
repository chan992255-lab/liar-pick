-- 라이어픽(LiarPick) 온라인 매칭 스키마
-- 기존 Supabase 프로젝트(스터디픽, ref: cwiftbtyfndnthzuutrx)의 public 스키마를 재사용하므로
-- 모든 객체 이름에 liarpick_ 접두사를 붙여 다른 앱과 완전히 분리한다.
-- 재실행 안전(idempotent).

-- ───────────────────────── 프로필 ─────────────────────────
create table if not exists public.liarpick_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '플레이어',
  games integer not null default 0,
  wins integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.liarpick_profiles enable row level security;

drop policy if exists liarpick_profiles_select on public.liarpick_profiles;
create policy liarpick_profiles_select on public.liarpick_profiles
  for select to authenticated using (true);

drop policy if exists liarpick_profiles_update on public.liarpick_profiles;
create policy liarpick_profiles_update on public.liarpick_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.liarpick_profiles to authenticated;
grant update (nickname) on public.liarpick_profiles to authenticated;

-- 회원가입 시 프로필 자동 생성 (닉네임은 가입 메타데이터에서)
create or replace function public.liarpick_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.liarpick_profiles (user_id, nickname)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data->>'nickname'), ''), '플레이어'))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists liarpick_on_new_user on auth.users;
create trigger liarpick_on_new_user
  after insert on auth.users
  for each row execute function public.liarpick_new_user();

-- ───────────────────────── 방 ─────────────────────────
create table if not exists public.liarpick_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game text not null check (game in ('liar', 'mafia')),
  title text not null default '파티 방',
  host_id uuid not null references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  phase text not null default 'lobby',
  round integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  phase_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists liarpick_rooms_public_idx
  on public.liarpick_rooms (game, status, is_public, created_at desc);

-- 제시어 후보 등 절대 공개되면 안 되는 데이터 (클라이언트 접근 불가)
create table if not exists public.liarpick_secrets (
  room_id uuid primary key references public.liarpick_rooms(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.liarpick_rooms enable row level security;
alter table public.liarpick_secrets enable row level security;

-- ───────────────────────── 참가자 ─────────────────────────
create table if not exists public.liarpick_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.liarpick_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  seat integer not null default 0,
  is_ready boolean not null default false,
  is_alive boolean not null default true,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists liarpick_players_room_idx on public.liarpick_players (room_id, joined_at);

alter table public.liarpick_players enable row level security;

-- ───────────────────────── 역할 (본인만 조회) ─────────────────────────
create table if not exists public.liarpick_roles (
  room_id uuid not null references public.liarpick_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  round integer not null,
  role text not null,
  word text,
  meta jsonb not null default '{}'::jsonb,
  primary key (room_id, user_id, round)
);

alter table public.liarpick_roles enable row level security;

-- ───────────────────────── 투표 · 밤 행동 (본인 표만 조회) ─────────────────────────
create table if not exists public.liarpick_votes (
  room_id uuid not null references public.liarpick_rooms(id) on delete cascade,
  round integer not null,
  kind text not null check (kind in ('liar', 'mafia_day')),
  voter_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, round, kind, voter_id)
);

alter table public.liarpick_votes enable row level security;

create table if not exists public.liarpick_actions (
  room_id uuid not null references public.liarpick_rooms(id) on delete cascade,
  round integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('kill', 'protect', 'investigate')),
  target_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, round, user_id, kind)
);

alter table public.liarpick_actions enable row level security;

-- ───────────────────────── 채팅 ─────────────────────────
create table if not exists public.liarpick_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.liarpick_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  nickname text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 300),
  kind text not null default 'chat' check (kind in ('chat', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists liarpick_messages_room_idx on public.liarpick_messages (room_id, created_at);

alter table public.liarpick_messages enable row level security;

-- ───────────────────────── 멤버 판별 헬퍼 (RLS 재귀 방지) ─────────────────────────
create or replace function public.liarpick_is_member(p_room uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.liarpick_players p
    where p.room_id = p_room and p.user_id = auth.uid()
  );
$$;

-- 방 조회: 내가 참가한 방만
drop policy if exists liarpick_rooms_select on public.liarpick_rooms;
create policy liarpick_rooms_select on public.liarpick_rooms
  for select to authenticated using (public.liarpick_is_member(id));

drop policy if exists liarpick_players_select on public.liarpick_players;
create policy liarpick_players_select on public.liarpick_players
  for select to authenticated using (public.liarpick_is_member(room_id));

drop policy if exists liarpick_players_update on public.liarpick_players;
create policy liarpick_players_update on public.liarpick_players
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.liarpick_rooms to authenticated;
grant select on public.liarpick_players to authenticated;
grant update (is_ready) on public.liarpick_players to authenticated;

drop policy if exists liarpick_roles_select on public.liarpick_roles;
create policy liarpick_roles_select on public.liarpick_roles
  for select to authenticated using (user_id = auth.uid());

grant select on public.liarpick_roles to authenticated;

drop policy if exists liarpick_votes_select on public.liarpick_votes;
create policy liarpick_votes_select on public.liarpick_votes
  for select to authenticated using (voter_id = auth.uid());

grant select on public.liarpick_votes to authenticated;

drop policy if exists liarpick_actions_select on public.liarpick_actions;
create policy liarpick_actions_select on public.liarpick_actions
  for select to authenticated using (user_id = auth.uid());

grant select on public.liarpick_actions to authenticated;

drop policy if exists liarpick_messages_select on public.liarpick_messages;
create policy liarpick_messages_select on public.liarpick_messages
  for select to authenticated using (public.liarpick_is_member(room_id));

drop policy if exists liarpick_messages_insert on public.liarpick_messages;
create policy liarpick_messages_insert on public.liarpick_messages
  for insert to authenticated
  with check (kind = 'chat' and user_id = auth.uid() and public.liarpick_is_member(room_id));

grant select, insert on public.liarpick_messages to authenticated;

-- 닉네임 위조 방지
create or replace function public.liarpick_message_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.kind = 'chat' then
    new.user_id := auth.uid();
    select coalesce(pr.nickname, '플레이어') into new.nickname
    from public.liarpick_profiles pr where pr.user_id = auth.uid();
    new.body := nullif(btrim(new.body), '');
    if new.body is null then
      raise exception 'empty_message';
    end if;
    new.body := left(new.body, 300);
  end if;
  return new;
end $$;

drop trigger if exists liarpick_messages_guard on public.liarpick_messages;
create trigger liarpick_messages_guard
  before insert on public.liarpick_messages
  for each row execute function public.liarpick_message_guard();

-- ───────────────────────── 프로필 RPC ─────────────────────────
create or replace function public.liarpick_my_profile()
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
      'userId', user_id, 'nickname', nickname,
      'games', games, 'wins', wins, 'score', score)
     from public.liarpick_profiles where user_id = auth.uid()),
    jsonb_build_object('userId', auth.uid(), 'nickname', '플레이어', 'games', 0, 'wins', 0, 'score', 0)
  );
$$;

create or replace function public.liarpick_set_nickname(p_nickname text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_nick text;
begin
  v_nick := btrim(coalesce(p_nickname, ''));
  if char_length(v_nick) < 1 or char_length(v_nick) > 12 then
    raise exception 'nickname_length';
  end if;
  insert into public.liarpick_profiles (user_id, nickname)
  values (auth.uid(), v_nick)
  on conflict (user_id) do update set nickname = excluded.nickname, updated_at = now();
  return public.liarpick_my_profile();
end $$;

create or replace function public.liarpick_leaderboard()
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(jsonb_agg(row order by (row->>'score')::int desc), '[]'::jsonb)
  from (
    select jsonb_build_object('nickname', nickname, 'games', games, 'wins', wins, 'score', score) as row
    from public.liarpick_profiles
    where games > 0
    order by score desc
    limit 10
  ) s;
$$;

-- ───────────────────────── 내부 헬퍼 ─────────────────────────
create or replace function public.liarpick_nickname()
returns text
language sql security definer stable set search_path = public
as $$
  select coalesce((select nickname from public.liarpick_profiles where user_id = auth.uid()), '플레이어');
$$;

create or replace function public.liarpick_gen_code()
returns text
language plpgsql volatile
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text;
  i integer;
begin
  loop
    out_code := '';
    for i in 1..6 loop
      out_code := out_code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.liarpick_rooms r where r.code = out_code);
  end loop;
  return out_code;
end $$;

create or replace function public.liarpick_system_message(p_room uuid, p_body text)
returns void
language sql security definer set search_path = public
as $$
  insert into public.liarpick_messages (room_id, user_id, nickname, body, kind)
  values (p_room, null, '시스템', left(p_body, 300), 'system');
$$;

create or replace function public.liarpick_room_snapshot(p_room uuid)
returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
begin
  if not public.liarpick_is_member(p_room) then
    raise exception 'not_member';
  end if;
  select * into v_room from public.liarpick_rooms where id = p_room;
  if not found then
    raise exception 'room_not_found';
  end if;
  return jsonb_build_object(
    'serverNow', (extract(epoch from now()) * 1000)::bigint,
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'game', v_room.game,
      'title', v_room.title,
      'hostId', v_room.host_id,
      'isPublic', v_room.is_public,
      'status', v_room.status,
      'phase', v_room.phase,
      'round', v_room.round,
      'config', v_room.config,
      'state', v_room.state,
      'phaseEndsAt', (extract(epoch from v_room.phase_ends_at) * 1000)::bigint,
      'createdAt', (extract(epoch from v_room.created_at) * 1000)::bigint
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.user_id, 'nickname', p.nickname, 'seat', p.seat,
        'isReady', p.is_ready, 'isAlive', p.is_alive, 'isHost', p.is_host,
        'joinedAt', (extract(epoch from p.joined_at) * 1000)::bigint
      ) order by p.joined_at)
      from public.liarpick_players p where p.room_id = p_room
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object('role', r.role, 'word', r.word, 'meta', r.meta)
      from public.liarpick_roles r
      where r.room_id = p_room and r.user_id = auth.uid() and r.round = v_room.round
    ),
    'myVote', (
      select v.target_id from public.liarpick_votes v
      where v.room_id = p_room and v.voter_id = auth.uid() and v.round = v_room.round
    ),
    'myAction', (
      select a.target_id from public.liarpick_actions a
      where a.room_id = p_room and a.user_id = auth.uid() and a.round = v_room.round
      order by a.created_at desc limit 1
    ),
    'votesIn', (
      select count(*) from public.liarpick_votes v
      where v.room_id = p_room and v.round = v_room.round
    ),
    'actionsIn', (
      select count(distinct a.user_id) from public.liarpick_actions a
      where a.room_id = p_room and a.round = v_room.round
    ),
    'aliveCount', (
      select count(*) from public.liarpick_players p where p.room_id = p_room and p.is_alive
    )
  );
end $$;

-- ───────────────────────── 방 목록 / 생성 / 입장 / 퇴장 ─────────────────────────
create or replace function public.liarpick_list_rooms(p_game text default null)
returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare v_out jsonb;
begin
  select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'game', r.game,
      'title', r.title,
      'players', (select count(*) from public.liarpick_players p where p.room_id = r.id),
      'hostNickname', (select p.nickname from public.liarpick_players p where p.room_id = r.id and p.is_host limit 1),
      'mode', coalesce(r.config->>'mode', ''),
      'createdAt', (extract(epoch from r.created_at) * 1000)::bigint
    ) as entry, r.created_at
    from public.liarpick_rooms r
    where r.is_public
      and r.status = 'waiting'
      and (p_game is null or r.game = p_game)
      and (select count(*) from public.liarpick_players p where p.room_id = r.id) between 1 and 11
  ) s;
  return v_out;
end $$;

create or replace function public.liarpick_cleanup_stale()
returns void
language sql security definer set search_path = public
as $$
  delete from public.liarpick_rooms r
  where r.status = 'waiting'
    and r.updated_at < now() - interval '3 hours';
$$;

create or replace function public.liarpick_create_room(
  p_game text,
  p_title text,
  p_is_public boolean,
  p_config jsonb,
  p_secret jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_game not in ('liar', 'mafia') then raise exception 'bad_game'; end if;

  insert into public.liarpick_rooms (code, game, title, host_id, is_public, config, state)
  values (
    public.liarpick_gen_code(),
    p_game,
    left(coalesce(nullif(btrim(p_title), ''), '파티 방'), 24),
    auth.uid(),
    coalesce(p_is_public, true),
    coalesce(p_config, '{}'::jsonb),
    jsonb_build_object('phase', 'lobby')
  )
  returning id into v_id;

  insert into public.liarpick_secrets (room_id, data) values (v_id, coalesce(p_secret, '{}'::jsonb));
  insert into public.liarpick_players (room_id, user_id, nickname, is_host)
  values (v_id, auth.uid(), public.liarpick_nickname(), true);

  return public.liarpick_room_snapshot(v_id);
end $$;

create or replace function public.liarpick_join_room(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_count integer;
  v_nick text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_room from public.liarpick_rooms
  where code = upper(btrim(coalesce(p_code, ''))) limit 1;
  if not found then raise exception 'room_not_found'; end if;

  if exists (select 1 from public.liarpick_players where room_id = v_room.id and user_id = auth.uid()) then
    return public.liarpick_room_snapshot(v_room.id);
  end if;
  if v_room.status <> 'waiting' then raise exception 'room_playing'; end if;

  select count(*) into v_count from public.liarpick_players where room_id = v_room.id;
  if v_count >= 12 then raise exception 'room_full'; end if;

  v_nick := public.liarpick_nickname();
  insert into public.liarpick_players (room_id, user_id, nickname)
  values (v_room.id, auth.uid(), v_nick);
  perform public.liarpick_system_message(v_room.id, v_nick || ' 님이 입장했어요');
  update public.liarpick_rooms set updated_at = now() where id = v_room.id;
  return public.liarpick_room_snapshot(v_room.id);
end $$;

create or replace function public.liarpick_quick_match(p_game text, p_config jsonb, p_secret jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
  v_nick text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  -- 이미 참가 중인 대기방이 있으면 그 방으로
  select r.id into v_id
  from public.liarpick_rooms r
  where r.game = p_game and r.is_public and r.status = 'waiting'
    and exists (select 1 from public.liarpick_players p where p.room_id = r.id and p.user_id = auth.uid())
  order by r.created_at desc limit 1;
  if v_id is not null then
    return public.liarpick_room_snapshot(v_id);
  end if;

  -- 자리 있는 공개 방 중 인원이 가장 많은 방
  select r.id, (select count(*) from public.liarpick_players p where p.room_id = r.id)
  into v_id, v_count
  from public.liarpick_rooms r
  where r.game = p_game and r.is_public and r.status = 'waiting'
    and (select count(*) from public.liarpick_players p where p.room_id = r.id) between 1 and 11
  order by v_count desc, r.created_at asc
  limit 1;

  if v_id is not null then
    v_nick := public.liarpick_nickname();
    insert into public.liarpick_players (room_id, user_id, nickname)
    values (v_id, auth.uid(), v_nick)
    on conflict (room_id, user_id) do nothing;
    perform public.liarpick_system_message(v_id, v_nick || ' 님이 매칭으로 입장했어요');
    update public.liarpick_rooms set updated_at = now() where id = v_id;
    return public.liarpick_room_snapshot(v_id);
  end if;

  return public.liarpick_create_room(
    p_game,
    public.liarpick_nickname() || '의 빠른 매칭 방',
    true, p_config, p_secret
  );
end $$;

create or replace function public.liarpick_leave_room(p_room uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_host uuid;
  v_next uuid;
  v_nick text;
begin
  v_nick := public.liarpick_nickname();
  delete from public.liarpick_players where room_id = p_room and user_id = auth.uid();

  if not exists (select 1 from public.liarpick_players where room_id = p_room) then
    delete from public.liarpick_rooms where id = p_room;
    return;
  end if;

  perform public.liarpick_system_message(p_room, v_nick || ' 님이 나갔어요');

  select host_id into v_host from public.liarpick_rooms where id = p_room;
  if v_host = auth.uid() then
    select user_id into v_next from public.liarpick_players where room_id = p_room order by joined_at limit 1;
    update public.liarpick_rooms set host_id = v_next, updated_at = now() where id = p_room;
    update public.liarpick_players set is_host = (user_id = v_next) where room_id = p_room;
  end if;
end $$;

create or replace function public.liarpick_set_config(p_room uuid, p_config jsonb, p_secret jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_room public.liarpick_rooms;
begin
  select * into v_room from public.liarpick_rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.status <> 'waiting' then raise exception 'already_started'; end if;

  update public.liarpick_rooms
  set config = coalesce(p_config, config), updated_at = now()
  where id = p_room;

  if p_secret is not null then
    insert into public.liarpick_secrets (room_id, data) values (p_room, p_secret)
    on conflict (room_id) do update set data = excluded.data;
  end if;
  return public.liarpick_room_snapshot(p_room);
end $$;

-- ───────────────────────── 게임 시작 ─────────────────────────
create or replace function public.liarpick_start_game(p_room uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_count integer;
  v_round integer;
  v_liar uuid;
  v_pair jsonb;
  v_word text;
  v_liar_word text;
  v_secret jsonb;
  v_cfg jsonb;
  v_roles text[];
  v_idx integer := 0;
  v_mafia integer;
  v_police integer;
  v_doctor integer;
  v_p record;
  v_role text;
  v_state jsonb;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.status <> 'waiting' then raise exception 'already_started'; end if;

  select count(*) into v_count from public.liarpick_players where room_id = p_room;
  if v_room.game = 'liar' and v_count < 3 then raise exception 'need_more_players'; end if;
  if v_room.game = 'mafia' and v_count < 4 then raise exception 'need_more_players'; end if;

  v_round := v_room.round + 1;
  v_cfg := v_room.config;
  select data into v_secret from public.liarpick_secrets where room_id = p_room;
  v_secret := coalesce(v_secret, '{}'::jsonb);

  delete from public.liarpick_roles where room_id = p_room;
  delete from public.liarpick_votes where room_id = p_room;
  delete from public.liarpick_actions where room_id = p_room;
  update public.liarpick_players set is_alive = true, is_ready = true where room_id = p_room;

  if v_room.game = 'liar' then
    select user_id into v_liar from public.liarpick_players
    where room_id = p_room order by random() limit 1;

    if jsonb_typeof(v_secret->'pairs') = 'array' and jsonb_array_length(v_secret->'pairs') > 0 then
      v_pair := (v_secret->'pairs')->(floor(random() * jsonb_array_length(v_secret->'pairs'))::int);
    else
      raise exception 'no_words';
    end if;
    v_word := v_pair->>'w';
    if coalesce(v_cfg->>'mode', 'normal') = 'fool' then
      v_liar_word := coalesce(v_pair->>'f', v_word);
    else
      v_liar_word := null;
    end if;

    for v_p in select * from public.liarpick_players where room_id = p_room loop
      if v_p.user_id = v_liar then
        insert into public.liarpick_roles (room_id, user_id, round, role, word, meta)
        values (p_room, v_p.user_id, v_round, 'liar', v_liar_word,
                jsonb_build_object('liarId', v_liar));
      else
        insert into public.liarpick_roles (room_id, user_id, round, role, word, meta)
        values (p_room, v_p.user_id, v_round, 'citizen', v_word, '{}'::jsonb);
      end if;
    end loop;

    v_state := jsonb_build_object(
      'phase', 'liar_reveal',
      'round', v_round,
      'categoryLabel', coalesce(v_cfg->>'categoryLabel', '제시어'),
      'categoryEmoji', coalesce(v_cfg->>'categoryEmoji', '🎲'),
      'mode', coalesce(v_cfg->>'mode', 'normal'),
      'voteMode', coalesce(v_cfg->>'voteMode', 'secret'),
      'discussSeconds', coalesce((v_cfg->>'seconds')::int, 180),
      'playerCount', v_count
    );
    update public.liarpick_rooms
    set status = 'playing', phase = 'liar_reveal', round = v_round,
        state = v_state, phase_ends_at = null, updated_at = now()
    where id = p_room;

  else
    v_mafia := greatest(1, least(coalesce((v_cfg->>'mafia')::int, 1), v_count - 2));
    v_police := case when coalesce((v_cfg->>'police')::int, 1) > 0 then 1 else 0 end;
    v_doctor := case when coalesce((v_cfg->>'doctor')::int, 1) > 0 and v_count >= 5 then 1 else 0 end;

    v_roles := '{}'::text[];
    for v_idx in 1..v_mafia loop v_roles := v_roles || 'mafia'; end loop;
    for v_idx in 1..v_police loop v_roles := v_roles || 'police'; end loop;
    for v_idx in 1..v_doctor loop v_roles := v_roles || 'doctor'; end loop;
    while array_length(v_roles, 1) < v_count loop v_roles := v_roles || 'citizen'; end loop;
    select array_agg(x order by random()) into v_roles from unnest(v_roles) x;

    v_idx := 0;
    for v_p in select * from public.liarpick_players where room_id = p_room order by joined_at loop
      v_idx := v_idx + 1;
      insert into public.liarpick_roles (room_id, user_id, round, role, meta)
      values (p_room, v_p.user_id, v_round, v_roles[v_idx], '{}'::jsonb);
    end loop;

    update public.liarpick_roles r
    set meta = jsonb_build_object('mates', coalesce((
      select jsonb_agg(jsonb_build_object('userId', r2.user_id, 'nickname', p2.nickname))
      from public.liarpick_roles r2
      join public.liarpick_players p2 on p2.room_id = r2.room_id and p2.user_id = r2.user_id
      where r2.room_id = p_room and r2.round = v_round and r2.role = 'mafia' and r2.user_id <> r.user_id
    ), '[]'::jsonb))
    where r.room_id = p_room and r.round = v_round and r.role = 'mafia';

    v_state := jsonb_build_object(
      'phase', 'mafia_reveal',
      'round', v_round,
      'day', 1,
      'nightSeconds', coalesce((v_cfg->>'nightSeconds')::int, 45),
      'discussSeconds', coalesce((v_cfg->>'discussSeconds')::int, 180),
      'voteSeconds', coalesce((v_cfg->>'voteSeconds')::int, 60),
      'mafia', v_mafia,
      'police', v_police,
      'doctor', v_doctor,
      'mafiaNames', coalesce((
        select jsonb_agg(p.nickname order by p.joined_at)
        from public.liarpick_roles r
        join public.liarpick_players p on p.room_id = r.room_id and p.user_id = r.user_id
        where r.room_id = p_room and r.round = v_round and r.role = 'mafia'
      ), '[]'::jsonb)
    );
    update public.liarpick_rooms
    set status = 'playing', phase = 'mafia_reveal', round = v_round,
        state = v_state, phase_ends_at = null, updated_at = now()
    where id = p_room;
  end if;

  perform public.liarpick_system_message(p_room, '게임을 시작했어요! 역할을 확인해 주세요.');
  return public.liarpick_room_snapshot(p_room);
end $$;

-- ───────────────────────── 투표 ─────────────────────────
create or replace function public.liarpick_cast_vote(p_room uuid, p_target uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_kind text;
begin
  select * into v_room from public.liarpick_rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.phase not in ('liar_vote', 'mafia_vote') then raise exception 'not_voting'; end if;
  if not exists (
    select 1 from public.liarpick_players
    where room_id = p_room and user_id = auth.uid() and is_alive
  ) then
    raise exception 'not_alive';
  end if;
  if p_target = auth.uid() then raise exception 'self_vote'; end if;
  if p_target is not null and not exists (
    select 1 from public.liarpick_players
    where room_id = p_room and user_id = p_target and is_alive
  ) then
    raise exception 'bad_target';
  end if;

  v_kind := case when v_room.game = 'liar' then 'liar' else 'mafia_day' end;
  insert into public.liarpick_votes (room_id, round, kind, voter_id, target_id)
  values (p_room, v_room.round, v_kind, auth.uid(), p_target)
  on conflict (room_id, round, kind, voter_id)
  do update set target_id = excluded.target_id, created_at = now();

  return public.liarpick_room_snapshot(p_room);
end $$;

create or replace function public.liarpick_vote_stats(p_room uuid)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'voted', (select count(*) from public.liarpick_votes v
              join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.voter_id
              where v.room_id = p_room and v.round = (select round from public.liarpick_rooms where id = p_room)
                and p.is_alive),
    'total', (select count(*) from public.liarpick_players where room_id = p_room and is_alive)
  );
$$;

-- ───────────────────────── 라이어 게임 진행 ─────────────────────────
create or replace function public.liarpick_liar_phase(p_room uuid, p_phase text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_liar uuid;
  v_word text;
  v_liar_nick text;
  v_accused uuid;
  v_max integer;
  v_tie boolean;
  v_counts jsonb;
  v_total integer;
  v_guess text;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.game <> 'liar' then raise exception 'wrong_game'; end if;

  if p_phase = 'discuss' then
    if v_room.phase <> 'liar_reveal' then return public.liarpick_room_snapshot(p_room); end if;
    update public.liarpick_rooms
    set phase = 'liar_discuss',
        phase_ends_at = now() + make_interval(secs => coalesce((v_room.state->>'discussSeconds')::int, 180)),
        state = v_room.state || jsonb_build_object('phase', 'liar_discuss'),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'vote' then
    if v_room.phase <> 'liar_discuss' then return public.liarpick_room_snapshot(p_room); end if;
    update public.liarpick_rooms
    set phase = 'liar_vote',
        phase_ends_at = now() + interval '75 seconds',
        state = v_room.state || jsonb_build_object('phase', 'liar_vote'),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'tally' then
    if v_room.phase <> 'liar_vote' then return public.liarpick_room_snapshot(p_room); end if;

    select v.target_id, count(*)::int into v_accused, v_max
    from public.liarpick_votes v
    join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.target_id
    where v.room_id = p_room and v.round = v_room.round and v.kind = 'liar'
    group by v.target_id
    order by count(*) desc, v.target_id
    limit 1;

    select coalesce(sum(cnt), 0) into v_total from (
      select count(*)::int as cnt from public.liarpick_votes v
      where v.room_id = p_room and v.round = v_room.round and v.kind = 'liar'
      group by v.target_id
    ) s;

    select coalesce(jsonb_agg(jsonb_build_object(
      'userId', s.target_id, 'nickname', s.nickname, 'votes', s.cnt
    ) order by s.cnt desc), '[]'::jsonb) into v_counts
    from (
      select v.target_id, p.nickname, count(*)::int as cnt
      from public.liarpick_votes v
      join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.target_id
      where v.room_id = p_room and v.round = v_room.round and v.kind = 'liar' and v.target_id is not null
      group by v.target_id, p.nickname
    ) s;

    v_tie := true;
    if v_accused is not null then
      select count(*) = 1 into v_tie from (
        select v.target_id from public.liarpick_votes v
        where v.room_id = p_room and v.round = v_room.round and v.kind = 'liar'
        group by v.target_id having count(*) = v_max
      ) t;
    end if;

    v_liar := (select user_id from public.liarpick_roles
               where room_id = p_room and round = v_room.round and role = 'liar');
    v_liar_nick := (select nickname from public.liarpick_players
                    where room_id = p_room and user_id = v_liar);

    if not v_tie and v_accused = v_liar then
      update public.liarpick_rooms
      set phase = 'liar_guess',
          phase_ends_at = now() + interval '40 seconds',
          state = v_room.state || jsonb_build_object(
            'phase', 'liar_guess',
            'counts', v_counts,
            'totalVotes', v_total,
            'accused', jsonb_build_object('userId', v_accused, 'nickname', v_liar_nick),
            'accusedIsLiar', true,
            'liarNickname', v_liar_nick
          ),
          updated_at = now()
      where id = p_room;
      perform public.liarpick_system_message(p_room, '라이어를 잡았어요! 라이어의 마지막 반전 기회 · 제시어 맞히기');
    else
      update public.liarpick_rooms
      set state = v_room.state || jsonb_build_object(
        'counts', v_counts,
        'totalVotes', v_total,
        'accused', case when v_accused is null then null else jsonb_build_object(
          'userId', v_accused,
          'nickname', (select nickname from public.liarpick_players where room_id = p_room and user_id = v_accused)
        ) end,
        'accusedIsLiar', false
      ),
      updated_at = now()
      where id = p_room;
      perform public.liarpick_finish_liar(p_room, 'liar', v_accused, false, false, null);
    end if;

  elsif p_phase = 'result' then
    -- 제한 시간 안에 라이어가 정답을 못 냈을 때
    if v_room.phase <> 'liar_guess' then return public.liarpick_room_snapshot(p_room); end if;
    v_liar := (select user_id from public.liarpick_roles
               where room_id = p_room and round = v_room.round and role = 'liar');
    perform public.liarpick_finish_liar(p_room, 'citizens', v_liar, true, false, null);

  elsif p_phase = 'lobby' then
    perform public.liarpick_reset_lobby(p_room);

  else
    raise exception 'bad_phase';
  end if;

  return public.liarpick_room_snapshot(p_room);
end $$;

create or replace function public.liarpick_finish_liar(
  p_room uuid,
  p_winner text,
  p_accused uuid,
  p_accused_is_liar boolean,
  p_guess_correct boolean,
  p_guess text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_liar uuid;
  v_word text;
  v_liar_nick text;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if v_room.status = 'finished' then return; end if;

  v_liar := (select user_id from public.liarpick_roles
             where room_id = p_room and round = v_room.round and role = 'liar');
  v_word := (select word from public.liarpick_roles
             where room_id = p_room and round = v_room.round and role = 'citizen' and word is not null limit 1);
  v_liar_nick := (select nickname from public.liarpick_players where room_id = p_room and user_id = v_liar);

  update public.liarpick_profiles pr
  set games = pr.games + 1,
      wins = pr.wins + case
        when (p_winner = 'liar' and pr.user_id = v_liar)
          or (p_winner <> 'liar' and pr.user_id <> v_liar) then 1 else 0 end,
      score = pr.score + case
        when (p_winner = 'liar' and pr.user_id = v_liar)
          or (p_winner <> 'liar' and pr.user_id <> v_liar) then 30 else 10 end,
      updated_at = now()
  where pr.user_id in (select user_id from public.liarpick_players where room_id = p_room);

  update public.liarpick_rooms
  set status = 'finished',
      phase = 'liar_result',
      phase_ends_at = null,
      state = state || jsonb_build_object(
        'phase', 'liar_result',
        'winner', p_winner,
        'liarId', v_liar,
        'liarNickname', v_liar_nick,
        'word', v_word,
        'accusedId', p_accused,
        'accusedIsLiar', p_accused_is_liar,
        'guessCorrect', p_guess_correct,
        'guess', p_guess
      ),
      updated_at = now()
  where id = p_room;

  perform public.liarpick_system_message(
    p_room,
    case when p_winner = 'liar' then '😈 라이어 승리! 라이어는 ' || coalesce(v_liar_nick, '?')
         else '🎉 시민 승리! 라이어는 ' || coalesce(v_liar_nick, '?') end
  );
end $$;

create or replace function public.liarpick_submit_guess(p_room uuid, p_guess text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_liar uuid;
  v_word text;
  v_norm_guess text;
  v_norm_word text;
begin
  select * into v_room from public.liarpick_rooms where id = p_room;
  if v_room.phase <> 'liar_guess' then raise exception 'not_guessing'; end if;
  v_liar := (select user_id from public.liarpick_roles
             where room_id = p_room and round = v_room.round and role = 'liar');
  if auth.uid() <> v_liar then raise exception 'not_liar'; end if;
  v_word := (select word from public.liarpick_roles
             where room_id = p_room and round = v_room.round and role = 'citizen' and word is not null limit 1);
  v_norm_guess := lower(regexp_replace(coalesce(btrim(p_guess), ''), '[\s·.,!?()~\-''"]', '', 'g'));
  v_norm_word := lower(regexp_replace(coalesce(v_word, ''), '[\s·.,!?()~\-''"]', '', 'g'));

  if v_norm_guess <> '' and v_norm_guess = v_norm_word then
    perform public.liarpick_finish_liar(p_room, 'liar', v_liar, true, true, left(btrim(p_guess), 24));
  else
    perform public.liarpick_finish_liar(p_room, 'citizens', v_liar, true, false, left(coalesce(btrim(p_guess), ''), 24));
  end if;
  return public.liarpick_room_snapshot(p_room);
end $$;

-- ───────────────────────── 마피아 게임 진행 ─────────────────────────
create or replace function public.liarpick_night_action(p_room uuid, p_target uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_role text;
  v_kind text;
  v_is_mafia boolean;
  v_nick text;
begin
  select * into v_room from public.liarpick_rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.phase <> 'mafia_night' then raise exception 'not_night'; end if;
  if not exists (select 1 from public.liarpick_players
                 where room_id = p_room and user_id = auth.uid() and is_alive) then
    raise exception 'not_alive';
  end if;

  select role into v_role from public.liarpick_roles
  where room_id = p_room and round = v_room.round and user_id = auth.uid();
  if v_role is null then raise exception 'no_role'; end if;

  if p_target is not null and not exists (
    select 1 from public.liarpick_players where room_id = p_room and user_id = p_target and is_alive
  ) then
    raise exception 'bad_target';
  end if;

  if v_role = 'mafia' then
    if p_target = auth.uid() then raise exception 'self_target'; end if;
    v_kind := 'kill';
  elsif v_role = 'doctor' then
    v_kind := 'protect';
  elsif v_role = 'police' then
    v_kind := 'investigate';
  else
    return public.liarpick_room_snapshot(p_room);
  end if;

  insert into public.liarpick_actions (room_id, round, user_id, kind, target_id)
  values (p_room, v_room.round, auth.uid(), v_kind, p_target)
  on conflict (room_id, round, user_id, kind)
  do update set target_id = excluded.target_id, created_at = now();

  if v_role = 'police' and p_target is not null then
    v_is_mafia := exists (
      select 1 from public.liarpick_roles r
      where r.room_id = p_room and r.round = v_room.round
        and r.user_id = p_target and r.role = 'mafia'
    );
    v_nick := (select nickname from public.liarpick_players where room_id = p_room and user_id = p_target);
    update public.liarpick_roles
    set meta = meta || jsonb_build_object(
      'lastCheck', jsonb_build_object('userId', p_target, 'nickname', v_nick, 'isMafia', v_is_mafia)
    )
    where room_id = p_room and round = v_room.round and user_id = auth.uid();
  end if;

  return public.liarpick_room_snapshot(p_room);
end $$;

create or replace function public.liarpick_finish_mafia(p_room uuid, p_winner text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_mafia_ids uuid[];
  v_mafia_names jsonb;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if v_room.status = 'finished' then return; end if;

  select array_agg(r.user_id) into v_mafia_ids
  from public.liarpick_roles r
  where r.room_id = p_room and r.round = v_room.round and r.role = 'mafia';

  select coalesce(jsonb_agg(p.nickname order by p.joined_at), '[]'::jsonb) into v_mafia_names
  from public.liarpick_players p where p.room_id = p_room and p.user_id = any(v_mafia_ids);

  update public.liarpick_profiles pr
  set games = pr.games + 1,
      wins = pr.wins + case
        when (p_winner = 'mafia' and pr.user_id = any(v_mafia_ids))
          or (p_winner <> 'mafia' and not (pr.user_id = any(v_mafia_ids))) then 1 else 0 end,
      score = pr.score + case
        when (p_winner = 'mafia' and pr.user_id = any(v_mafia_ids))
          or (p_winner <> 'mafia' and not (pr.user_id = any(v_mafia_ids))) then 30 else 10 end,
      updated_at = now()
  where pr.user_id in (select user_id from public.liarpick_players where room_id = p_room);

  update public.liarpick_rooms
  set status = 'finished',
      phase = 'mafia_result',
      phase_ends_at = null,
      state = state || jsonb_build_object(
        'phase', 'mafia_result',
        'winner', p_winner,
        'mafiaNames', v_mafia_names
      ),
      updated_at = now()
  where id = p_room;

  perform public.liarpick_system_message(
    p_room,
    case when p_winner = 'mafia' then '🔪 마피아 승리!'
         else '🎉 시민 승리!' end
  );
end $$;

create or replace function public.liarpick_mafia_phase(p_room uuid, p_phase text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room public.liarpick_rooms;
  v_victim uuid;
  v_max integer;
  v_tops uuid[];
  v_protected boolean;
  v_mafia_alive integer;
  v_others_alive integer;
  v_accused uuid;
  v_tie boolean;
  v_counts jsonb;
  v_total integer;
  v_exec record;
  v_day integer;
  v_state jsonb;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.game <> 'mafia' then raise exception 'wrong_game'; end if;
  v_state := v_room.state;
  v_day := coalesce((v_state->>'day')::int, 1);

  if p_phase = 'night' then
    if v_room.phase not in ('mafia_reveal', 'mafia_execution') then
      return public.liarpick_room_snapshot(p_room);
    end if;
    if v_room.phase = 'mafia_execution' then
      v_day := v_day + 1;
    end if;
    delete from public.liarpick_actions where room_id = p_room and round = v_day;
    delete from public.liarpick_votes where room_id = p_room and round = v_day;
    update public.liarpick_rooms
    set phase = 'mafia_night',
        round = v_day,
        phase_ends_at = now() + make_interval(secs => coalesce((v_state->>'nightSeconds')::int, 45)),
        state = v_state || jsonb_build_object('phase', 'mafia_night', 'day', v_day),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'dawn' then
    if v_room.phase <> 'mafia_night' then return public.liarpick_room_snapshot(p_room); end if;

    select a.target_id, count(*)::int into v_victim, v_max
    from public.liarpick_actions a
    join public.liarpick_players p on p.room_id = a.room_id and p.user_id = a.target_id
    where a.room_id = p_room and a.round = v_room.round and a.kind = 'kill' and p.is_alive
    group by a.target_id
    order by count(*) desc
    limit 1;

    if v_victim is not null then
      select array_agg(target_id) into v_tops from (
        select a.target_id from public.liarpick_actions a
        join public.liarpick_players p on p.room_id = a.room_id and p.user_id = a.target_id
        where a.room_id = p_room and a.round = v_room.round and a.kind = 'kill' and p.is_alive
        group by a.target_id having count(*) = v_max
      ) t;
      if array_length(v_tops, 1) > 1 then
        v_victim := v_tops[1 + floor(random() * array_length(v_tops, 1))::int];
      end if;
    end if;

    v_protected := v_victim is not null and exists (
      select 1 from public.liarpick_actions a
      where a.room_id = p_room and a.round = v_room.round and a.kind = 'protect'
        and a.target_id = v_victim
    );

    if v_victim is not null and not v_protected then
      update public.liarpick_players set is_alive = false
      where room_id = p_room and user_id = v_victim;
    end if;

    select count(*) into v_mafia_alive
    from public.liarpick_players p
    join public.liarpick_roles r on r.room_id = p.room_id and r.user_id = p.user_id and r.round = v_room.round
    where p.room_id = p_room and p.is_alive and r.role = 'mafia';

    select count(*) into v_others_alive from public.liarpick_players
    where room_id = p_room and is_alive;

    if v_mafia_alive = 0 then
      update public.liarpick_rooms
      set state = v_state || jsonb_build_object(
        'dawn', jsonb_build_object(
          'victimId', v_victim,
          'victimNickname', (select nickname from public.liarpick_players where room_id = p_room and user_id = v_victim),
          'saved', v_protected
        ))
      where id = p_room;
      perform public.liarpick_finish_mafia(p_room, 'citizens');
      return public.liarpick_room_snapshot(p_room);
    elsif v_mafia_alive >= (v_others_alive - v_mafia_alive) then
      update public.liarpick_rooms
      set state = v_state || jsonb_build_object(
        'dawn', jsonb_build_object(
          'victimId', v_victim,
          'victimNickname', (select nickname from public.liarpick_players where room_id = p_room and user_id = v_victim),
          'saved', v_protected
        ))
      where id = p_room;
      perform public.liarpick_finish_mafia(p_room, 'mafia');
      return public.liarpick_room_snapshot(p_room);
    end if;

    update public.liarpick_rooms
    set phase = 'mafia_dawn',
        phase_ends_at = null,
        state = v_state || jsonb_build_object(
          'phase', 'mafia_dawn',
          'dawn', jsonb_build_object(
            'victimId', v_victim,
            'victimNickname', (select nickname from public.liarpick_players where room_id = p_room and user_id = v_victim),
            'saved', v_protected
          )),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'discuss' then
    if v_room.phase <> 'mafia_dawn' then return public.liarpick_room_snapshot(p_room); end if;
    update public.liarpick_rooms
    set phase = 'mafia_discuss',
        phase_ends_at = now() + make_interval(secs => coalesce((v_state->>'discussSeconds')::int, 180)),
        state = v_state || jsonb_build_object('phase', 'mafia_discuss'),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'vote' then
    if v_room.phase <> 'mafia_discuss' then return public.liarpick_room_snapshot(p_room); end if;
    update public.liarpick_rooms
    set phase = 'mafia_vote',
        phase_ends_at = now() + make_interval(secs => coalesce((v_state->>'voteSeconds')::int, 60)),
        state = v_state || jsonb_build_object('phase', 'mafia_vote'),
        updated_at = now()
    where id = p_room;

  elsif p_phase = 'tally' then
    if v_room.phase <> 'mafia_vote' then return public.liarpick_room_snapshot(p_room); end if;

    select v.target_id, count(*)::int into v_accused, v_max
    from public.liarpick_votes v
    join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.target_id
    where v.room_id = p_room and v.round = v_room.round and v.kind = 'mafia_day' and p.is_alive
    group by v.target_id
    order by count(*) desc, v.target_id
    limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
      'userId', s.target_id, 'nickname', s.nickname, 'votes', s.cnt
    ) order by s.cnt desc), '[]'::jsonb) into v_counts
    from (
      select v.target_id, p.nickname, count(*)::int as cnt
      from public.liarpick_votes v
      join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.target_id
      where v.room_id = p_room and v.round = v_room.round and v.kind = 'mafia_day' and v.target_id is not null
      group by v.target_id, p.nickname
    ) s;

    v_tie := true;
    if v_accused is not null then
      select count(*) = 1 into v_tie from (
        select v.target_id from public.liarpick_votes v
        join public.liarpick_players p on p.room_id = v.room_id and p.user_id = v.target_id
        where v.room_id = p_room and v.round = v_room.round and v.kind = 'mafia_day' and p.is_alive
        group by v.target_id having count(*) = v_max
      ) t;
    end if;

    if v_tie then
      update public.liarpick_rooms
      set phase = 'mafia_execution',
          phase_ends_at = null,
          state = v_state || jsonb_build_object(
            'phase', 'mafia_execution',
            'counts', v_counts,
            'executed', null,
            'tie', true
          ),
          updated_at = now()
      where id = p_room;
    else
      update public.liarpick_players set is_alive = false
      where room_id = p_room and user_id = v_accused;

      select r.role as role, p.nickname as nickname into v_exec
      from public.liarpick_roles r
      join public.liarpick_players p on p.room_id = r.room_id and p.user_id = r.user_id
      where r.room_id = p_room and r.round = v_room.round and r.user_id = v_accused;

      update public.liarpick_rooms
      set phase = 'mafia_execution',
          phase_ends_at = null,
          state = v_state || jsonb_build_object(
            'phase', 'mafia_execution',
            'counts', v_counts,
            'executed', jsonb_build_object(
              'userId', v_accused,
              'nickname', v_exec.nickname,
              'role', v_exec.role
            ),
            'tie', false
          ),
          updated_at = now()
      where id = p_room;

      select count(*) into v_mafia_alive
      from public.liarpick_players p
      join public.liarpick_roles r on r.room_id = p.room_id and r.user_id = p.user_id and r.round = v_room.round
      where p.room_id = p_room and p.is_alive and r.role = 'mafia';

      select count(*) into v_others_alive from public.liarpick_players
      where room_id = p_room and is_alive;

      if v_mafia_alive = 0 then
        perform public.liarpick_finish_mafia(p_room, 'citizens');
      elsif v_mafia_alive >= (v_others_alive - v_mafia_alive) then
        perform public.liarpick_finish_mafia(p_room, 'mafia');
      end if;
    end if;

  elsif p_phase = 'lobby' then
    perform public.liarpick_reset_lobby(p_room);

  else
    raise exception 'bad_phase';
  end if;

  return public.liarpick_room_snapshot(p_room);
end $$;

create or replace function public.liarpick_reset_lobby(p_room uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_room public.liarpick_rooms;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase not in ('liar_result', 'mafia_result') then return; end if;

  delete from public.liarpick_roles where room_id = p_room;
  delete from public.liarpick_votes where room_id = p_room;
  delete from public.liarpick_actions where room_id = p_room;
  update public.liarpick_players set is_alive = true, is_ready = false where room_id = p_room;

  update public.liarpick_rooms
  set status = 'waiting',
      phase = 'lobby',
      phase_ends_at = null,
      state = jsonb_build_object('phase', 'lobby'),
      updated_at = now()
  where id = p_room;

  perform public.liarpick_system_message(p_room, '대기실로 돌아왔어요. 준비되면 다시 시작!');
end $$;

-- ───────────────────────── 권한 정리 ─────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'liarpick\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ───────────────────────── Realtime ─────────────────────────
alter table public.liarpick_rooms replica identity full;
alter table public.liarpick_players replica identity full;
alter table public.liarpick_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.liarpick_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.liarpick_players;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.liarpick_messages;
  exception when duplicate_object then null;
  end;
  -- 역할/투표/행동/비밀 테이블은 절대 구독하지 않는다 (개인 정보 노출 방지)
  begin
    alter publication supabase_realtime drop table public.liarpick_roles;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_votes;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_actions;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_secrets;
  exception when undefined_object then null;
  end;
end $$;
