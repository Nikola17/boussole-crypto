import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { type ReactNode } from 'react';
import { fmtPct } from '../../lib/format';
import { reliabilityOf, reliabilityPhrase } from '../../lib/lab/reliability';
// Badges, signaux, variations : les pastilles qui parlent (découpage du grand ui.tsx, lot 18).

export type Tone = 'up' | 'down' | 'neutral' | 'warn' | 'accent' | 'bad';

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[0.72rem] font-medium leading-5',
        tone === 'up' && 'bg-up/12 text-up',
        tone === 'down' && 'bg-down/12 text-down',
        tone === 'bad' && 'bg-critical/12 text-down',
        tone === 'neutral' && 'bg-surface-2 text-ink-2',
        tone === 'warn' && 'bg-warn/15 text-ink',
        tone === 'accent' && 'bg-accent/15 text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function SignalBadge({ label, tone, strength, score, compact, confidence, limited, reliabilityKey }: { label: string; tone: 'up' | 'down' | 'neutral'; strength?: number; score?: number; compact?: boolean; confidence?: 'haute' | 'moyenne' | 'faible'; limited?: string; reliabilityKey?: string }) {
  const phrase = reliabilityKey ? reliabilityPhrase(reliabilityOf(reliabilityKey)) : undefined;
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;
  return (
    <span title={phrase} className="inline-flex">
    <Badge tone={tone === 'up' ? 'up' : tone === 'down' ? 'down' : 'neutral'} className={clsx(strength === 2 && 'ring-1 ring-current/40')} icon={<Icon className="size-3.5" aria-hidden />}>
      {label}
      {!compact && score != null && <span className="tnum opacity-70">{score > 0 ? `+${score}` : score}</span>}
      {confidence && confidence !== 'haute' && <span className="text-[0.65rem] font-normal opacity-80" title={limited}>· confiance {confidence}</span>}
    </Badge>
    </span>
  );
}

export function Delta({ value, digits = 1, className, suffix }: { value: number | null | undefined; digits?: number; className?: string; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={clsx('text-muted', className)}>—</span>;
  const up = value > 0.0001;
  const down = value < -0.0001;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={clsx('tnum inline-flex items-center gap-0.5 whitespace-nowrap', up && 'text-up', down && 'text-down', !up && !down && 'text-ink-2', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {fmtPct(value, digits)}
      {suffix && <span className="ml-0.5 text-muted">{suffix}</span>}
    </span>
  );
}

export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const v = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className="tracking-tight text-warn" aria-label={`${v} sur ${max}`}>
      {'★'.repeat(v)}
      <span className="text-surface-3">{'★'.repeat(max - v)}</span>
    </span>
  );
}
