import type { GameKey, ScoreEntry } from './types';

const KEY = 'liarpick:v1';

type Store = {
  scores: ScoreEntry[];
  updatedAt: string;
};

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<Store>;
    if (!Array.isArray(parsed.scores)) return [];
    return parsed.scores.filter(
      (entry): entry is ScoreEntry =>
        !!entry && typeof entry.name === 'string' && typeof entry.wins === 'number',
    );
  } catch {
    return [];
  }
}

function save(scores: ScoreEntry[]) {
  try {
    const store: Store = { scores, updatedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 저장 실패는 무시 */
  }
}

/** 한 판의 결과를 누적 점수판에 기록합니다. 참가자는 모두 games +1, 승리자는 wins +1. */
export function recordRound(_game: GameKey, players: string[], winners: string[]): ScoreEntry[] {
  const scores = loadScores();
  const now = new Date().toISOString();
  const winnerSet = new Set(winners);
  const byName = new Map(scores.map((entry) => [entry.name, entry]));

  players.forEach((name) => {
    const entry = byName.get(name) ?? { name, wins: 0, games: 0, lastPlayedAt: now };
    entry.games += 1;
    if (winnerSet.has(name)) entry.wins += 1;
    entry.lastPlayedAt = now;
    byName.set(name, entry);
  });

  const next = Array.from(byName.values()).sort(
    (a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name),
  );
  save(next);
  return next;
}

export function resetScores(): ScoreEntry[] {
  save([]);
  return [];
}
