import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { sfx } from '../lib/sound';
import { Button } from './ui';

type Accent = 'purple' | 'rose' | 'mint' | 'amber' | 'violet';

const ACCENT: Record<Accent, { ring: string; glow: string; text: string; bg: string }> = {
  purple: {
    ring: 'ring-purple/40',
    glow: 'shadow-glow',
    text: 'text-purple',
    bg: 'from-purple/25 via-surf to-surf',
  },
  violet: {
    ring: 'ring-violet/40',
    glow: 'shadow-glow',
    text: 'text-violet',
    bg: 'from-violet/25 via-surf to-surf',
  },
  rose: {
    ring: 'ring-rose/40',
    glow: 'shadow-glowRose',
    text: 'text-rose',
    bg: 'from-rose/25 via-surf to-surf',
  },
  mint: {
    ring: 'ring-mint/40',
    glow: 'shadow-glowMint',
    text: 'text-mint',
    bg: 'from-mint/25 via-surf to-surf',
  },
  amber: {
    ring: 'ring-amber/40',
    glow: 'shadow-glow',
    text: 'text-amber',
    bg: 'from-amber/25 via-surf to-surf',
  },
};

/** 폰을 넘겨받은 사람만 볼 수 있는 '가림 → 플립' 카드 */
export function HoldReveal({
  name,
  kicker,
  accent = 'purple',
  children,
  doneLabel,
  onDone,
  doneDisabled = false,
  sideNote,
  coverHint = '카드를 탭하면 열리고, 길게 누르면 잠깐만 보여요',
}: {
  name: string;
  kicker: string;
  accent?: Accent;
  children: ReactNode;
  doneLabel: string;
  onDone: () => void;
  doneDisabled?: boolean;
  sideNote?: string;
  coverHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState(false);
  const [pressed, setPressed] = useState(false);
  const downAt = useRef(0);
  const a = ACCENT[accent];
  const revealed = open || peek;

  // 화면이 넘어가며 pointerup 대상이 바뀌어도 놓치지 않도록 window에서 받아냅니다.
  useEffect(() => {
    if (!pressed) return;
    const release = () => {
      const held = Date.now() - downAt.current;
      setPressed(false);
      setPeek(false);
      if (held < 340) {
        setOpen(true);
      }
      sfx.flip();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [pressed]);

  return (
    <div className="animate-pop-in">
      <div className="mb-4 text-center">
        <p className={cn('text-[11px] font-extrabold tracking-[0.2em]', a.text)}>{kicker}</p>
        <h2 className="mt-1 text-[22px] font-extrabold leading-snug">
          {open ? `${name}님, 확인하세요` : `${name}님에게 폰을 넘겨주세요`}
        </h2>
        <p className="mt-1 text-[12px] text-sub">
          {open ? '다 봤으면 아래 버튼을 눌러 다음 사람에게 넘겨주세요' : '옆 사람이 화면을 보지 못하게 가려 주세요'}
        </p>
      </div>

      <div className="flip-scene h-[418px] w-full">
        <div className={cn('flip-inner', revealed && 'is-open')}>
          <div
            role="button"
            tabIndex={0}
            onPointerDown={() => {
              downAt.current = Date.now();
              setPressed(true);
              setPeek(true);
              sfx.unlock();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setOpen(true);
                sfx.flip();
              }
            }}
            className={cn(
              'flip-face flex cursor-pointer select-none flex-col items-center justify-center gap-4 border border-line bg-gradient-to-b px-6 text-center',
              'bg-gradient-to-br',
              a.bg,
              a.glow,
            )}
            style={{ touchAction: 'none' }}
          >
            <span className="text-6xl drop-shadow-[0_0_25px_rgba(168,85,247,0.45)]">🕵️</span>
            <div>
              <p className="text-[16px] font-extrabold">가림 화면</p>
              <p className="mt-1 max-w-[220px] text-[12px] leading-relaxed text-sub">
                다른 사람이 보면 큰일 나요.
                <br />
                혼자 확인한 뒤 넘겨주세요.
              </p>
            </div>
            <div className="mt-1 rounded-full border border-line bg-bg/60 px-4 py-2 text-[11px] font-semibold text-sub">
              {coverHint}
            </div>
            <span className="absolute bottom-5 text-[10px] text-sub/60">LiarPick · pass the phone</span>
          </div>

          <div
            className={cn(
              'flip-face flip-back flex flex-col border border-line bg-gradient-to-b from-surf to-[#121624]',
              a.ring,
              'ring-1',
            )}
          >
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
              <span className="text-[10px] font-extrabold tracking-[0.18em] text-sub">{kicker}</span>
              <span className={cn('text-[11px] font-bold', a.text)}>{name}</span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-4 text-center">
              {children}
            </div>
            {sideNote && (
              <p className="border-t border-line/60 px-5 py-2.5 text-center text-[10.5px] leading-snug text-sub/80">
                {sideNote}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Button
          variant={accent === 'rose' ? 'danger' : accent === 'mint' ? 'mint' : 'primary'}
          disabled={!open || doneDisabled}
          onClick={() => {
            sfx.pass();
            onDone();
          }}
        >
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}
