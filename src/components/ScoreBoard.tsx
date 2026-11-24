import type { ScoreEntry } from '../lib/types';
import { cn } from '../lib/utils';

const MEDAL = ['🥇', '🥈', '🥉'];

export function ScoreRows({
  scores,
  highlight,
  limit,
  emptyText = '아직 기록이 없어요. 한 판만 해 보면 여기에 점수가 쌓입니다.',
}: {
  scores: ScoreEntry[];
  highlight?: string[];
  limit?: number;
  emptyText?: string;
}) {
  const rows = limit ? scores.slice(0, limit) : scores;
  if (!rows.length) {
    return <p className="panel px-4 py-6 text-center text-[12.5px] leading-relaxed text-sub">{emptyText}</p>;
  }
  return (
    <div className="panel divide-y divide-line/60 overflow-hidden">
      {rows.map((entry, index) => {
        const win = highlight?.includes(entry.name);
        return (
          <div
            key={entry.name}
            className={cn(
              'flex items-center gap-3 px-4 py-3',
              win && 'bg-purple/10',
            )}
          >
            <span className="w-6 text-center text-[13px] font-extrabold text-sub">
              {MEDAL[index] ?? index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{entry.name}</span>
            {win && (
              <span className="rounded-full bg-purple/20 px-2 py-0.5 text-[10px] font-extrabold text-purple">
                승리
              </span>
            )}
            <span className="num text-[13px] font-extrabold text-mint">{entry.wins}승</span>
            <span className="num w-10 text-right text-[11px] text-sub">{entry.games}판</span>
          </div>
        );
      })}
    </div>
  );
}
