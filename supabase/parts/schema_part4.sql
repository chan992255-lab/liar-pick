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
