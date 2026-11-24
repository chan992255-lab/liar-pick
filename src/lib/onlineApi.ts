import { supabase } from './supabase';
import type { ChatMessage, Profile, RoomSummary, Snapshot } from './onlineTypes';

function client() {
  if (!supabase) throw new Error('온라인 기능을 사용할 수 없어요.');
  return supabase;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message || '요청을 처리하지 못했어요.');
  return data as T;
}

export const onlineApi = {
  myProfile: () => rpc<Profile>('liarpick_my_profile'),
  setNickname: (nickname: string) => rpc<Profile>('liarpick_set_nickname', { p_nickname: nickname }),
  leaderboard: () => rpc<Profile[]>('liarpick_leaderboard'),

  listRooms: (game: string | null) => rpc<RoomSummary[]>('liarpick_list_rooms', { p_game: game }),
  cleanup: () => rpc<null>('liarpick_cleanup_stale'),

  quickMatch: (game: string, config: Record<string, unknown>, secret: Record<string, unknown>) =>
    rpc<Snapshot>('liarpick_quick_match', { p_game: game, p_config: config, p_secret: secret }),

  createRoom: (
    game: string,
    title: string,
    isPublic: boolean,
    config: Record<string, unknown>,
    secret: Record<string, unknown>,
  ) =>
    rpc<Snapshot>('liarpick_create_room', {
      p_game: game,
      p_title: title,
      p_is_public: isPublic,
      p_config: config,
      p_secret: secret,
    }),

  joinRoom: (code: string) => rpc<Snapshot>('liarpick_join_room', { p_code: code }),
  leaveRoom: (roomId: string) => rpc<null>('liarpick_leave_room', { p_room: roomId }),
  setConfig: (roomId: string, config: Record<string, unknown>, secret: Record<string, unknown> | null) =>
    rpc<Snapshot>('liarpick_set_config', { p_room: roomId, p_config: config, p_secret: secret }),

  setReady: async (roomId: string, userId: string, ready: boolean) => {
    const { error } = await client()
      .from('liarpick_players')
      .update({ is_ready: ready })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  },

  startGame: (roomId: string) => rpc<Snapshot>('liarpick_start_game', { p_room: roomId }),
  castVote: (roomId: string, target: string | null) =>
    rpc<Snapshot>('liarpick_cast_vote', { p_room: roomId, p_target: target }),
  voteStats: (roomId: string) => rpc<{ voted: number; total: number }>('liarpick_vote_stats', { p_room: roomId }),
  liarPhase: (roomId: string, phase: string) => rpc<Snapshot>('liarpick_liar_phase', { p_room: roomId, p_phase: phase }),
  submitGuess: (roomId: string, guess: string) =>
    rpc<Snapshot>('liarpick_submit_guess', { p_room: roomId, p_guess: guess }),
  mafiaPhase: (roomId: string, phase: string) => rpc<Snapshot>('liarpick_mafia_phase', { p_room: roomId, p_phase: phase }),
  nightAction: (roomId: string, target: string | null) =>
    rpc<Snapshot>('liarpick_night_action', { p_room: roomId, p_target: target }),
  snapshot: (roomId: string) => rpc<Snapshot>('liarpick_room_snapshot', { p_room: roomId }),

  sendMessage: async (roomId: string, body: string) => {
    const text = body.trim().slice(0, 300);
    if (!text) return;
    const { error } = await client()
      .from('liarpick_messages')
      .insert({ room_id: roomId, body: text, kind: 'chat' });
    if (error) throw new Error(error.message);
  },
};

export async function fetchMessages(roomId: string, limit = 80): Promise<ChatMessage[]> {
  const { data, error } = await client()
    .from('liarpick_messages')
    .select('id, nickname, body, kind, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => ({
      id: row.id as number,
      nickname: (row.nickname as string) ?? '',
      body: row.body as string,
      kind: (row.kind as 'chat' | 'system') ?? 'chat',
      createdAt: row.created_at as string,
    }))
    .reverse();
}

type RealtimePayload = {
  new?: Record<string, unknown>;
  eventType?: string;
};

/** 방의 방 상태·참가자·채팅 변화를 구독한다. 반환값을 호출하면 구독 해제. */
export function subscribeRoom(
  roomId: string,
  handlers: {
    onChange: () => void;
    onMessage: (message: ChatMessage) => void;
  },
): () => void {
  const channel = client()
    .channel(`liarpick-room-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'liarpick_rooms', filter: `id=eq.${roomId}` },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'liarpick_players', filter: `room_id=eq.${roomId}` },
      () => handlers.onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'liarpick_messages', filter: `room_id=eq.${roomId}` },
      (payload: RealtimePayload) => {
        const row = payload.new;
        if (!row) return;
        handlers.onMessage({
          id: row.id as number,
          nickname: (row.nickname as string) ?? '',
          body: row.body as string,
          kind: (row.kind as 'chat' | 'system') ?? 'chat',
          createdAt: (row.created_at as string) ?? new Date().toISOString(),
        });
      },
    )
    .subscribe();

  return () => {
    void client().removeChannel(channel);
  };
}
