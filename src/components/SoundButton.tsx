import { useState } from 'react';
import { sfx } from '../lib/sound';
import { cn } from '../lib/utils';

export function SoundButton({ className }: { className?: string }) {
  const [on, setOn] = useState(sfx.enabled);
  return (
    <button
      onClick={() => {
        sfx.setEnabled(!on);
        setOn(!on);
      }}
      aria-label={on ? '효과음 끄기' : '효과음 켜기'}
      className={cn(
        'press flex h-10 w-10 items-center justify-center rounded-full border border-line/80 bg-surf text-[15px]',
        className,
      )}
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}
