import { cn } from '../lib/utils';

export function PlayerNameEditor({
  names,
  onChange,
}: {
  names: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {names.map((name, index) => (
        <div
          key={index}
          className="flex items-center gap-2.5 rounded-2xl border border-line/70 bg-raised/50 px-3 py-2"
        >
          <span className="num w-5 text-center text-[12px] font-extrabold text-sub">{index + 1}</span>
          <input
            value={name}
            maxLength={10}
            onChange={(event) => {
              const next = [...names];
              next[index] = event.target.value;
              onChange(next);
            }}
            placeholder={`플레이어 ${index + 1}`}
            className={cn('min-w-0 flex-1 bg-transparent text-[15px] font-semibold placeholder:text-sub/50')}
          />
          <span className="text-[10px] text-sub/60">{name.trim().length}/10</span>
        </div>
      ))}
    </div>
  );
}

export function PlayerChipGrid({
  players,
  selectedId,
  disabledId,
  onSelect,
  tone = 'purple',
}: {
  players: { id: string; name: string }[];
  selectedId?: string | null;
  disabledId?: string;
  onSelect: (id: string) => void;
  tone?: 'purple' | 'rose';
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((player) => {
        const disabled = player.id === disabledId;
        const selected = player.id === selectedId;
        return (
          <button
            key={player.id}
            disabled={disabled}
            onClick={() => onSelect(player.id)}
            className={cn(
              'press flex h-[52px] items-center justify-center rounded-2xl border text-[15px] font-bold',
              disabled && 'opacity-25',
              selected
                ? tone === 'rose'
                  ? 'border-rose bg-rose/20 text-white'
                  : 'border-purple bg-purple/20 text-white'
                : 'border-line bg-raised/60 text-ink/85',
            )}
          >
            {player.name}
          </button>
        );
      })}
    </div>
  );
}
