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
