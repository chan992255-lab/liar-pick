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

