export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function uid(prefix = 'p'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s·.,!?'"()~-]/g, '')
    .trim();
}

export function tally(votes: Record<string, string>): {
  counts: Record<string, number>;
  top: string[];
  total: number;
} {
  const counts: Record<string, number> = {};
  Object.values(votes).forEach((target) => {
    counts[target] = (counts[target] ?? 0) + 1;
  });
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const max = Object.values(counts).reduce((best, value) => Math.max(best, value), 0);
  const top = Object.keys(counts).filter((id) => counts[id] === max && max > 0);
  return { counts, top, total };
}

export function randomIdOf(ids: string[]): string {
  return pick(ids);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
