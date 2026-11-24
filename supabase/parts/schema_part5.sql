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
