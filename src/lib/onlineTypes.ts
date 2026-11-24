import { CATEGORIES, CATEGORY_MAP, foolWordFor } from './words';
import type { Category, LiarMode, VoteMode } from './types';

export type OnlineGame = 'liar' | 'mafia';

export type Profile = {
  userId: string;
  nickname: string;
  games: number;
  wins: number;
  score: number;
};

export type RoleInfo = {
  role: string;
  word: string | null;
  meta: Record<string, unknown>;
};

export type RoomPlayer = {
  userId: string;
  nickname: string;
  seat: number;
  isReady: boolean;
  isAlive: boolean;
  isHost: boolean;
  joinedAt: number;
};

export type RoomState = {
  phase?: string;
  round?: number;
  day?: number;
  categoryLabel?: string;
  categoryEmoji?: string;
  mode?: LiarMode;
  voteMode?: VoteMode;
  discussSeconds?: number;
  nightSeconds?: number;
  voteSeconds?: number;
  playerCount?: number;
  counts?: { userId: string; nickname: string; votes: number }[];
  totalVotes?: number;
  accused?: { userId: string; nickname: string } | null;
  accusedIsLiar?: boolean;
  liarNickname?: string;
  liarId?: string;
  word?: string;
  winner?: string;
  guessCorrect?: boolean;
  guess?: string | null;
  dawn?: { victimId: string | null; victimNickname: string | null; saved: boolean } | null;
  executed?: { userId: string; nickname: string; role: string } | null;
  tie?: boolean;
  mafiaNames?: string[];
  mafia?: number;
  police?: number;
  doctor?: number;
};

export type RoomInfo = {
  id: string;
  code: string;
  game: OnlineGame;
  title: string;
  hostId: string;
  isPublic: boolean;
  status: 'waiting' | 'playing' | 'finished';
  phase: string;
  round: number;
  config: Record<string, unknown>;
  state: RoomState;
  phaseEndsAt: number | null;
  createdAt: number;
};

export type Snapshot = {
  serverNow: number;
  meId: string;
  room: RoomInfo;
  players: RoomPlayer[];
  me: RoleInfo | null;
  myVote: string | null;
  myAction: string | null;
  votesIn: number;
  actionsIn: number;
  aliveCount: number;
};

export type ChatMessage = {
  id: number;
  nickname: string;
  body: string;
  kind: 'chat' | 'system';
  createdAt: string;
};

export type RoomSummary = {
  id: string;
  code: string;
  game: OnlineGame;
  title: string;
  players: number;
  hostNickname: string | null;
  mode: string;
  createdAt: number;
};

export type LiarConfig = {
  categoryId: string;
  categoryLabel: string;
  categoryEmoji: string;
  mode: LiarMode;
  seconds: number;
  voteMode: VoteMode;
};

export type MafiaConfig = {
  mafia: number;
  police: number;
  doctor: number;
  nightSeconds: number;
  discussSeconds: number;
  voteSeconds: number;
};

export const DEFAULT_LIAR_CONFIG: LiarConfig = {
  categoryId: CATEGORIES[0].id,
  categoryLabel: CATEGORIES[0].label,
  categoryEmoji: CATEGORIES[0].emoji,
  mode: 'normal',
  seconds: 180,
  voteMode: 'secret',
};

export const DEFAULT_MAFIA_CONFIG: MafiaConfig = {
  mafia: 1,
  police: 1,
  doctor: 1,
  nightSeconds: 45,
  discussSeconds: 180,
  voteSeconds: 60,
};

export function recommendedMafia(count: number): { mafia: number; police: number; doctor: number } {
  if (count >= 9) return { mafia: 3, police: 1, doctor: 1 };
  if (count >= 6) return { mafia: 2, police: 1, doctor: 1 };
  return { mafia: 1, police: 1, doctor: 0 };
}

function categoryOf(id: string): Category {
  return CATEGORY_MAP[id] ?? CATEGORIES[0];
}

/** 라이어 방 설정: 공개 설정값 + 서버에만 보관되는 제시어 쌍 */
export function liarRoomPayload(config: LiarConfig): {
  publicConfig: Record<string, unknown>;
  secret: Record<string, unknown>;
} {
  const category = categoryOf(config.categoryId);
  const pairs = category.words.slice(0, 80).map((word) => ({
    w: word,
    f: config.mode === 'fool' ? foolWordFor(category.id, word) : word,
  }));
  return {
    publicConfig: {
      categoryId: category.id,
      categoryLabel: category.label,
      categoryEmoji: category.emoji,
      mode: config.mode,
      seconds: config.seconds,
      voteMode: config.voteMode,
    },
    secret: { pairs },
  };
}

export function mafiaRoomPayload(config: MafiaConfig): {
  publicConfig: Record<string, unknown>;
  secret: Record<string, unknown>;
} {
  return {
    publicConfig: {
      mafia: config.mafia,
      police: config.police,
      doctor: config.doctor,
      nightSeconds: config.nightSeconds,
      discussSeconds: config.discussSeconds,
      voteSeconds: config.voteSeconds,
    },
    secret: {},
  };
}

export const GAME_META: Record<OnlineGame, { label: string; emoji: string; gradient: string; minPlayers: number }> = {
  liar: {
    label: '라이어 게임',
    emoji: '🕵️',
    gradient: 'from-violet/90 via-[#5B3BD6] to-[#2A1A5E]',
    minPlayers: 3,
  },
  mafia: {
    label: '마피아 게임',
    emoji: '🔫',
    gradient: 'from-rose/90 via-[#B32A4B] to-[#3A1220]',
    minPlayers: 4,
  },
};

export const LIAR_ROLE_LABEL: Record<string, { label: string; emoji: string }> = {
  liar: { label: '라이어', emoji: '🕵️‍♂️' },
  citizen: { label: '시민', emoji: '🙂' },
};

export const MAFIA_ROLE_LABEL: Record<string, { label: string; emoji: string }> = {
  mafia: { label: '마피아', emoji: '🔪' },
  police: { label: '경찰', emoji: '🕵️' },
  doctor: { label: '의사', emoji: '💉' },
  citizen: { label: '시민', emoji: '🙂' },
};
