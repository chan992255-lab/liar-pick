import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { sfx } from '../lib/sound';

type Variant = 'primary' | 'ghost' | 'danger' | 'mint' | 'dark' | 'amber';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-violet to-purple text-white shadow-glow border border-white/10',
  danger: 'bg-gradient-to-br from-rose to-[#E11D48] text-white shadow-glowRose border border-white/10',
  mint: 'bg-gradient-to-br from-mint to-[#059669] text-white shadow-glowMint border border-white/10',
  amber: 'bg-gradient-to-br from-amber to-[#F59E0B] text-[#1a1206] border border-white/20',
  ghost: 'bg-raised/80 text-ink border border-line',
  dark: 'bg-bg/60 text-sub border border-line/70',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  silent?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'lg',
  full = true,
  silent = false,
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      onClick={(event) => {
        if (!silent) sfx.tap();
        onClick?.(event);
      }}
      className={cn(
        'press inline-flex items-center justify-center gap-2 rounded-2xl font-bold disabled:pointer-events-none disabled:opacity-35',
        size === 'lg' && 'h-[58px] px-6 text-[17px]',
        size === 'md' && 'h-[48px] px-5 text-[15px]',
        size === 'sm' && 'h-[38px] px-3.5 text-[13px]',
        full && 'w-full',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="safe-t sticky top-0 z-20 bg-gradient-to-b from-bg via-bg/95 to-bg/0 px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button
              onClick={() => {
                sfx.pass();
                onBack();
              }}
              aria-label="뒤로"
              className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80 bg-surf text-sub"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] font-extrabold leading-tight">{title}</p>
            {subtitle && <p className="truncate text-[11px] font-medium text-sub">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  hint,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line/70 bg-raised/60 px-4 py-3">
      <div>
        <p className="text-[14px] font-bold">{label}</p>
        {hint && <p className="text-[11px] text-sub">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          aria-label={`${label} 줄이기`}
          disabled={value <= min}
          onClick={() => {
            sfx.tap();
            onChange(Math.max(min, value - 1));
          }}
          className="press flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surf text-lg font-bold text-ink disabled:opacity-30"
        >
          −
        </button>
        <span className="num w-8 text-center text-[19px] font-extrabold">{value}</span>
        <button
          aria-label={`${label} 늘리기`}
          disabled={value >= max}
          onClick={() => {
            sfx.tap();
            onChange(Math.min(max, value + 1));
          }}
          className="press flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surf text-lg font-bold text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-5 flex items-end justify-between">
      <h3 className="text-[13px] font-extrabold tracking-wide text-sub">{children}</h3>
      {hint && <span className="text-[11px] text-sub/70">{hint}</span>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  accent = 'purple',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  accent?: 'purple' | 'mint' | 'rose';
}) {
  const on =
    accent === 'mint' ? 'bg-mint' : accent === 'rose' ? 'bg-rose' : 'bg-purple';
  return (
    <button
      onClick={() => {
        sfx.tap();
        onChange(!checked);
      }}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
        checked ? 'border-purple/50 bg-purple/10' : 'border-line/70 bg-raised/50',
      )}
    >
      <div>
        <p className="text-[14px] font-bold">{label}</p>
        {description && <p className="mt-0.5 text-[11px] leading-snug text-sub">{description}</p>}
      </div>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? on : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-6' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-0 backdrop-blur-sm">
      <div className="w-full max-w-[430px] animate-rise-in rounded-t-4xl border-t border-line bg-surf px-5 pb-8 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[16px] font-extrabold">{title}</p>
          <button
            onClick={onClose}
            className="press flex h-8 w-8 items-center justify-center rounded-full bg-raised text-sub"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ name, tone = 'purple' }: { name: string; tone?: 'purple' | 'rose' | 'mint' | 'amber' }) {
  const palette: Record<string, string> = {
    purple: 'from-violet/70 to-purple/40 text-white',
    rose: 'from-rose/70 to-rose/30 text-white',
    mint: 'from-mint/70 to-mint/30 text-white',
    amber: 'from-amber/80 to-amber/40 text-[#241703]',
  };
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[13px] font-extrabold',
        palette[tone],
      )}
    >
      {name.trim().slice(0, 1) || '?'}
    </span>
  );
}
