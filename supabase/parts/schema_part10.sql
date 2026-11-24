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

