export type Player = { id: string; name: string };

export type GameKey = 'liar' | 'mafia';

export type Category = {
  id: string;
  label: string;
  emoji: string;
  words: string[];
};

export type VoteMode = 'secret' | 'open';

export type LiarMode = 'normal' | 'fool';

export type LiarConfig = {
  players: Player[];
  categoryId: string;
  mode: LiarMode;
  seconds: number;
  voteMode: VoteMode;
};

export type ScoreEntry = {
  name: string;
  wins: number;
  games: number;
  lastPlayedAt: string;
};

export type MafiaRole = 'mafia' | 'police' | 'doctor' | 'citizen';

export type MafiaPlayer = Player & {
  role: MafiaRole;
  alive: boolean;
};

export type MafiaConfig = {
  players: Player[];
  mafia: number;
  police: number;
  doctor: number;
  seconds: number;
};

export type LogEntry = {
  id: string;
  label: string;
  tone: 'neutral' | 'rose' | 'mint' | 'amber' | 'purple';
};

export const ROLE_META: Record<
  MafiaRole,
  { label: string; emoji: string; color: string; blurb: string }
> = {
  mafia: {
    label: '마피아',
    emoji: '🔪',
    color: 'rose',
    blurb: '밤마다 한 명을 지목해 제거합니다. 동료 마피아와 함께 이겨요.',
  },
  police: {
    label: '경찰',
    emoji: '🕵️',
    color: 'violet',
    blurb: '밤마다 한 명을 조사해 마피아인지 확인합니다.',
  },
  doctor: {
    label: '의사',
    emoji: '💉',
    color: 'mint',
    blurb: '밤마다 한 명을 보호합니다. 마피아의 지목을 막아낼 수 있어요.',
  },
  citizen: {
    label: '시민',
    emoji: '🙂',
    color: 'sub',
    blurb: '능력은 없지만 낮의 토론과 투표로 마피아를 찾아냅니다.',
  },
};
