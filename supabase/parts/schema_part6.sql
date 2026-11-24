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
