import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { fmtNum } from '../../lib/format';
// Chiffres et jauges : statistiques, sparkline, icône de crypto, température, segments (découpage du grand ui.tsx, lot 18).

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
              title={`${s.label} : ${format(s.value)} (${fmtNum(pct, 1)} %)`}
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
