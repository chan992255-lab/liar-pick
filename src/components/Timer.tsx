import { useCallback, useEffect, useRef, useState } from 'react';
import { cn, formatTime } from '../lib/utils';
import { sfx } from '../lib/sound';
import { Button } from './ui';

export function useCountdown(initial: number, onFinish?: () => void) {
  const [remaining, setRemaining] = useState(initial);
  const [running, setRunning] = useState(false);
  const endRef = useRef(0);
  const finishedRef = useRef(false);
  const finishCb = useRef(onFinish);
  finishCb.current = onFinish;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        if (!finishedRef.current) {
          finishedRef.current = true;
          sfx.warn();
          finishCb.current?.();
        }
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && remaining > 0 && remaining <= 10) {
      sfx.tick();
    }
  }, [remaining, running]);

  const start = useCallback(() => {
    finishedRef.current = false;
    endRef.current = Date.now() + Math.max(1, remaining) * 1000;
    setRunning(true);
    sfx.tap();
  }, [remaining]);

  const pause = useCallback(() => {
    setRunning(false);
    setRemaining(Math.max(0, Math.round((endRef.current - Date.now()) / 1000)));
    sfx.tap();
  }, []);

  const toggle = useCallback(() => {
    if (running) {
      pause();
    } else if (remaining <= 0) {
      setRemaining(initial);
      finishedRef.current = false;
      endRef.current = Date.now() + initial * 1000;
      setRunning(true);
      sfx.tap();
    } else {
      start();
    }
  }, [running, pause, remaining, initial, start]);

  const add = useCallback((seconds: number) => {
    endRef.current = Math.max(endRef.current, Date.now()) + seconds * 1000;
    setRemaining((prev) => Math.max(1, prev + seconds));
    setRunning(true);
    finishedRef.current = false;
    sfx.tap();
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setRemaining(initial);
    finishedRef.current = false;
    sfx.pass();
  }, [initial]);

  return { remaining, running, start, pause, toggle, add, reset };
}

const SIZE = 156;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function TimerPanel({
  seconds,
  onFinish,
  accent = 'purple',
  label = '토론 타이머',
}: {
  seconds: number;
  onFinish?: () => void;
  accent?: 'purple' | 'rose' | 'mint';
  label?: string;
}) {
  const { remaining, running, toggle, add, reset } = useCountdown(seconds, onFinish);
  const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, seconds)));
  const urgent = remaining <= 10;
  const color = urgent ? '#FB7185' : accent === 'mint' ? '#10B981' : accent === 'rose' ? '#FB7185' : '#A855F7';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke="#242A3D" strokeWidth={STROKE} fill="none" />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset 240ms linear, stroke 200ms ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn('num text-[36px] font-extrabold leading-none', urgent && 'animate-pulse-soft text-rose')}
          >
            {formatTime(remaining)}
          </span>
          <span className="mt-1 text-[10px] font-bold tracking-[0.16em] text-sub">
            {remaining === 0 ? '시간 종료' : running ? '진행 중' : '일시정지'}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-sub">{label}</p>

      <div className="mt-3 grid w-full grid-cols-3 gap-2">
        <Button variant={running ? 'ghost' : 'primary'} size="md" onClick={toggle}>
          {running ? '일시정지' : remaining === 0 ? '다시 시작' : '시작'}
        </Button>
        <Button variant="ghost" size="md" onClick={() => add(30)}>
          +30초
        </Button>
        <Button variant="dark" size="md" onClick={reset} className="text-sub">
          초기화
        </Button>
      </div>
    </div>
  );
}
