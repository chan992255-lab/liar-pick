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

