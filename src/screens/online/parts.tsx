import type { RoomPlayer } from '../../lib/onlineTypes';
import { cn, formatTime } from '../../lib/utils';
import { sfx } from '../../lib/sound';

export function PhaseTimer({ seconds, tone = 'purple' }: { seconds: number | null; tone?: 'purple' | 'rose' }) {
  if (seconds == null) return null;
  const urgent = seconds <= 10;
  return (
    <div className="flex items-center justify-center">
      <div
        className={cn(
          'num rounded-2xl border px-5 py-2 text-[26px] font-black tracking-wider',
          urgent
            ? 'animate-pulse border-rose/60 bg-rose/10 text-rose'
            : tone === 'rose'
              ? 'border-rose/30 bg-rose/5 text-ink'
              : 'border-purple/30 bg-purple/5 text-ink',
        )}
      >
        {formatTime(seconds)}
      </div>
    </div>
  );
}

export function TargetGrid({
  players,
  selfId,
  selectedId,
  onSelect,
  allowSelf = false,
  tone = 'rose',
}: {
  players: RoomPlayer[];
  selfId?: string;
  selectedId?: string | null;
  onSelect: (userId: string) => void;
  allowSelf?: boolean;
  tone?: 'rose' | 'purple' | 'mint';
}) {
  const active = players.filter((player) => (allowSelf ? true : player.userId !== selfId));
  return (
    <div className="grid grid-cols-2 gap-2">
      {active.map((player) => {
        const selected = player.userId === selectedId;
        return (
          <button
            key={player.userId}
            disabled={!player.isAlive}
            onClick={() => {
              sfx.tap();
              onSelect(player.userId);
            }}
            className={cn(
              'press flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-[13px] font-bold disabled:opacity-30',
              selected
                ? tone === 'mint'
                  ? 'border-mint/70 bg-mint/15 text-mint'
                  : tone === 'purple'
                    ? 'border-purple/70 bg-purple/15 text-purple'
                    : 'border-rose/70 bg-rose/15 text-rose'
                : 'border-line/70 bg-surf/70',
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg/60 text-[11.5px] font-extrabold">
              {player.nickname.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate', !player.isAlive && 'line-through opacity-60')}>
                {player.nickname}
              </span>
              {player.userId === selfId && <span className="text-[10px] font-bold text-sub">나</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PlayerStrip({ players, selfId }: { players: RoomPlayer[]; selfId?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {players.map((player) => (
        <span
          key={player.userId}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-bold',
            player.isAlive ? 'border-line/70 bg-surf/70 text-ink/90' : 'border-line/40 bg-bg/40 text-sub/50 line-through',
            player.userId === selfId && 'border-purple/60 text-purple',
          )}
        >
          {player.nickname}
        </span>
      ))}
    </div>
  );
}

export function WaitingForHost({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-line/60 bg-surf/50 px-4 py-4 text-center">
      <p className="text-[12.5px] leading-relaxed text-sub">{label}</p>
    </div>
  );
}
