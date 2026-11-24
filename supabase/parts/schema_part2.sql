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

