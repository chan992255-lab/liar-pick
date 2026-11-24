import { CATEGORIES, CATEGORY_MAP, foolWordFor } from '../../lib/words';
import type { LiarConfig, LiarMode, Player, VoteMode } from '../../lib/types';
import { normalizeAnswer, pick, uid } from '../../lib/utils';

export type LiarRound = {
  liarId: string;
  word: string;
  liarWord: string;
  categoryLabel: string;
  categoryEmoji: string;
};

export function createRound(config: LiarConfig): LiarRound {
  const category = CATEGORY_MAP[config.categoryId] ?? CATEGORIES[0];
  const word = pick(category.words);
  const liar = pick(config.players);
  return {
    liarId: liar.id,
    word,
    liarWord: config.mode === 'fool' ? foolWordFor(category.id, word) : '라이어',
    categoryLabel: category.label,
    categoryEmoji: category.emoji,
  };
}

export function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `플레이어 ${i + 1}`);
}

export function resizeNames(names: string[], count: number): string[] {
  if (count <= names.length) return names.slice(0, count);
  const next = [...names];
  for (let i = names.length; i < count; i += 1) next.push(`플레이어 ${i + 1}`);
  return next;
}

export function toPlayers(names: string[]): Player[] {
  const seen = new Map<string, number>();
  return names.map((raw, index) => {
    const base = raw.trim() || `플레이어 ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const name = count === 1 ? base : `${base} ${count}`;
    return { id: uid('pl'), name: name.slice(0, 12) };
  });
}

export function isCorrectGuess(input: string, word: string): boolean {
  return normalizeAnswer(input) === normalizeAnswer(word);
}

export const MODE_META: Record<LiarMode, { label: string; emoji: string; blurb: string }> = {
  normal: {
    label: '일반 모드',
    emoji: '🎯',
    blurb: '라이어는 제시어를 아예 모릅니다. 설명을 듣고 눈치로 버텨야 해요.',
  },
  fool: {
    label: '바보 모드',
    emoji: '🤡',
    blurb: '라이어에게 비슷하지만 다른 제시어가 주어집니다. 본인도 라이어인 줄 몰라요.',
  },
};

export const VOTE_META: Record<VoteMode, { label: string; emoji: string; blurb: string }> = {
  open: {
    label: '지목 투표',
    emoji: '👉',
    blurb: '다 같이 보는 화면에서 한 명을 바로 지목합니다.',
  },
  secret: {
    label: '비밀 투표',
    emoji: '🤫',
    blurb: '폰을 돌려 가며 한 명씩 몰래 투표합니다.',
  },
};
