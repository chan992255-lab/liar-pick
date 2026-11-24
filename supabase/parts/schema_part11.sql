create or replace function public.liarpick_reset_lobby(p_room uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_room public.liarpick_rooms;
begin
  select * into v_room from public.liarpick_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase not in ('liar_result', 'mafia_result') then return; end if;

  delete from public.liarpick_roles where room_id = p_room;
  delete from public.liarpick_votes where room_id = p_room;
  delete from public.liarpick_actions where room_id = p_room;
  update public.liarpick_players set is_alive = true, is_ready = false where room_id = p_room;

  update public.liarpick_rooms
  set status = 'waiting',
      phase = 'lobby',
      phase_ends_at = null,
      state = jsonb_build_object('phase', 'lobby'),
      updated_at = now()
  where id = p_room;

  perform public.liarpick_system_message(p_room, '대기실로 돌아왔어요. 준비되면 다시 시작!');
end $$;

-- ───────────────────────── 권한 정리 ─────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'liarpick\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ───────────────────────── Realtime ─────────────────────────
alter table public.liarpick_rooms replica identity full;
alter table public.liarpick_players replica identity full;
alter table public.liarpick_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.liarpick_rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.liarpick_players;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.liarpick_messages;
  exception when duplicate_object then null;
  end;
  -- 역할/투표/행동/비밀 테이블은 절대 구독하지 않는다 (개인 정보 노출 방지)
  begin
    alter publication supabase_realtime drop table public.liarpick_roles;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_votes;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_actions;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table public.liarpick_secrets;
  exception when undefined_object then null;
  end;
end $$;
