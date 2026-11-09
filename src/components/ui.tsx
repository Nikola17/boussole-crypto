// Composants d'interface réutilisables.

import { clsx } from 'clsx';
import {
  ArrowDownRight, ArrowUpRight, Check, ChevronDown, CircleAlert, Info, Loader2, Minus, X,
} from 'lucide-react';
import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { fmtPct } from '../lib/format';

// ------------------------------------------------------------------ Structure

export function Card({ title, subtitle, actions, children, className, padded = true, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; padded?: boolean; id?: string;
}) {
  return (
    <section id={id} className={clsx('rounded-xl border border-line bg-surface', padded && 'p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className={clsx('mb-3 flex items-start justify-between gap-3', !padded && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold leading-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid gap-4', className)}>{children}</div>;
}

// ------------------------------------------------------------------ Boutons

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface-2 text-ink hover:bg-surface-3',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'text-critical hover:bg-critical/10',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Badges & signaux

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

export function SignalBadge({ label, tone, strength, score, compact }: { label: string; tone: 'up' | 'down' | 'neutral'; strength?: number; score?: number; compact?: boolean }) {
  const Icon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;
  return (
    <Badge tone={tone === 'up' ? 'up' : tone === 'down' ? 'down' : 'neutral'} className={clsx(strength === 2 && 'ring-1 ring-current/40')} icon={<Icon className="size-3.5" aria-hidden />}>
      {label}
      {!compact && score != null && <span className="tnum opacity-70">{score > 0 ? `+${score}` : score}</span>}
    </Badge>
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

// ------------------------------------------------------------------ Chiffres

export function Stat({ label, value, delta, hint, trend, className }: { label: ReactNode; value: ReactNode; delta?: ReactNode; hint?: ReactNode; trend?: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0 rounded-xl border border-line bg-surface p-3.5 sm:p-4', className)}>
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-ink sm:text-xl">{value}</div>
      {(delta || hint) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          {delta}
          {hint && <span className="text-muted">{hint}</span>}
        </div>
      )}
      {trend && <div className="mt-2">{trend}</div>}
    </div>
  );
}

export function Sparkline({ values, width = 96, height = 28, tone }: { values: number[]; width?: number; height?: number; tone?: 'up' | 'down' | 'neutral' }) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);
  const pts = clean.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  const t = tone ?? (clean[clean.length - 1] >= clean[0] ? 'up' : 'down');
  const color = t === 'up' ? 'var(--up)' : t === 'down' ? 'var(--down)' : 'var(--text-muted)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function CoinIcon({ src, symbol, size = 24 }: { src?: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-ink-2"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-hidden
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" loading="lazy" onError={() => setErr(true)} />;
}

// ------------------------------------------------------------------ Jauges

/** Jauge « température » divergente : froid (opportunité) ↔ chaud (danger), avec libellés de zones. */
export function TemperatureMeter({ value }: { value: number }) {
  const zones = [
    { label: 'Peur extrême', color: 'var(--div-cold-2)' },
    { label: 'Accumulation', color: 'var(--div-cold-1)' },
    { label: 'Neutre', color: 'var(--div-mid)' },
    { label: 'Chaud', color: 'var(--div-hot-1)' },
    { label: 'Euphorie', color: 'var(--div-hot-2)' },
  ];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label="Température du marché">
      <div className="relative">
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
          {zones.map((z) => (
            <div key={z.label} className="h-full flex-1" style={{ background: z.color }} />
          ))}
        </div>
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-ink"
          style={{ left: `${v}%`, borderColor: 'var(--surface-1)' }}
        />
      </div>
      <div className="mt-1.5 hidden grid-cols-5 text-[0.65rem] text-muted sm:grid">
        {zones.map((z, i) => (
          <span key={z.label} className={clsx(i === 0 && 'text-left', i === 4 && 'text-right', i > 0 && i < 4 && 'text-center')}>{z.label}</span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] text-muted sm:hidden">
        <span>Peur</span>
        <span>Neutre</span>
        <span>Euphorie</span>
      </div>
    </div>
  );
}

/** Barre de score 0-100 (accent) avec piste du même ton. */
export function ScoreBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-accent/20', className)} aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} />
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Barre segmentée haute (répartition d'un tout), avec légende. */
export function SegmentedBar({ segments, format }: { segments: Segment[]; format: (v: number) => string }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) return <p className="text-sm text-muted">Aucune donnée à répartir.</p>;
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px]" role="img" aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)} %`).join(', ')}>
        {segments.filter((s) => s.value > 0).map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <div
              key={s.key}
              className="flex h-full min-w-[3px] items-center overflow-hidden rounded px-1.5 text-[0.7rem] font-semibold text-white first:rounded-l-md last:rounded-r-md"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${s.label} : ${format(s.value)} (${pct.toFixed(1).replace('.', ',')} %)`}
            >
              {pct >= 9 ? `${Math.round(pct)} %` : ''}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Formulaires

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block min-w-0', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.7rem] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputCls, className)} {...rest} />;
}

export function NumberInput({ value, onChange, className, step = 'any', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | ''; onChange: (v: number | '') => void }) {
  const [text, setText] = useState(value === '' ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === '' ? '' : String(value));
    }
  }, [value]);
  return (
    <input
      inputMode="decimal"
      className={clsx(inputCls, 'tnum', className)}
      value={text}
      step={step}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.').replace(/\s/g, '');
        setText(e.target.value);
        if (raw === '') { last.current = ''; onChange(''); return; }
        const n = Number(raw);
        if (Number.isFinite(n)) { last.current = n; onChange(n); }
      }}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select className={clsx(inputCls, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputCls, 'h-auto min-h-20 py-2', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={clsx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Retours

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'success' ? Check : tone === 'info' ? Info : CircleAlert;
  return (
    <div
      className={clsx(
        'flex gap-3 rounded-xl border p-3.5 text-sm',
        tone === 'info' && 'border-accent/30 bg-accent/8',
        tone === 'warn' && 'border-warn/40 bg-warn/10',
        tone === 'danger' && 'border-critical/40 bg-critical/10',
        tone === 'success' && 'border-good/40 bg-good/10',
      )}
    >
      <Icon className={clsx('mt-0.5 size-4 shrink-0', tone === 'info' && 'text-accent', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-critical', tone === 'success' && 'text-good')} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={clsx('text-ink-2', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Banner tone="warn" title="Données indisponibles" action={onRetry ? <Button size="sm" onClick={onRetry}>Réessayer</Button> : undefined}>
      {msg}
    </Banner>
  );
}

/** Petite bulle d'explication (clic ou survol). */
export function InfoTip({ children, label = 'Explication' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface-2 p-3 text-left text-xs font-normal leading-relaxed text-ink-2 shadow-[var(--shadow)]">
          {children}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ Fenêtre modale

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={clsx('safe-bottom flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-[var(--shadow)] sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h3 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h3>
          <IconButton label="Fermer" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ Tableau simple

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('-mx-4 overflow-x-auto sm:mx-0', className)}>
      <table className="tnum w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} className={clsx('whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4 sm:first:pl-3 sm:last:pr-3', i > 0 && 'text-right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, left }: { children: ReactNode; className?: string; left?: boolean }) {
  return <td className={clsx('whitespace-nowrap border-b border-line px-3 py-2.5 first:pl-4 last:pr-4 sm:first:pl-3 sm:last:pr-3', !left && 'text-right', className)}>{children}</td>;
}
