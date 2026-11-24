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

