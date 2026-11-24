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

