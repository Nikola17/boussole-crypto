// Graphique en lignes (SVG) : traits 2 px, grille discrète, réticule + info-bulle au survol, légende si ≥ 2 séries.

import { useEffect, useMemo, useRef, useState } from 'react';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { t: number; v: number }[]; // t en secondes
  dashed?: boolean;
  area?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

export function LineChart({ series, height = 240, yFormat, xFormat }: {
  series: LineSeries[];
  height?: number;
  yFormat: (v: number) => string;
  xFormat?: (t: number) => string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(260, e[0].contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const fx = xFormat ?? ((t: number) => new Date(t * 1000).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));
  const pad = { l: 64, r: 12, t: 10, b: 24 };
  const W = width;
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const { tMin, tMax, vMin, vMax, base } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const ts = all.map((p) => p.t);
    const vs = all.map((p) => p.v);
    const lo = Math.min(0, ...vs);
    const hi = Math.max(...vs);
    return { tMin: Math.min(...ts), tMax: Math.max(...ts), vMin: lo, vMax: hi === lo ? lo + 1 : hi * 1.04, base: series[0]?.points ?? [] };
  }, [series]);

  if (!series.length || !base.length) return <div style={{ height }} />;

  const x = (t: number) => pad.l + ((t - tMin) / (tMax - tMin || 1)) * iw;
  const y = (v: number) => pad.t + ih - ((v - vMin) / (vMax - vMin || 1)) * ih;
  const yTicks = niceTicks(vMin, vMax, 4);
  const xTickCount = Math.max(2, Math.min(6, Math.floor(iw / 110)));
  const xTicks = Array.from({ length: xTickCount }, (_, i) => tMin + ((tMax - tMin) * i) / (xTickCount - 1));

  const path = (pts: { t: number; v: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  function onMove(clientX: number) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const t = tMin + ((clientX - rect.left - pad.l) / iw) * (tMax - tMin);
    let best = 0;
    let bestD = Infinity;
    base.forEach((p, i) => {
      const d = Math.abs(p.t - t);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  }

  const hp = hover != null ? base[hover] : null;
  const tipLeft = hp ? Math.min(Math.max(x(hp.t) + 12, pad.l), W - 190) : 0;

  return (
    <div>
      {series.length >= 2 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={wrap}
        className="relative w-full select-none"
        style={{ height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <svg width={W} height={H} className="block" role="img" aria-label={series.map((s) => s.label).join(', ')}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tnum">{yFormat(v)}</text>
            </g>
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={y(Math.max(vMin, 0))} y2={y(Math.max(vMin, 0))} stroke="var(--axis)" strokeWidth={1} />
          {xTicks.map((t, i) => (
            <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--text-muted)">{fx(t)}</text>
          ))}
          {series.map((s) => (
            <g key={s.key}>
              {s.area && (
                <path d={`${path(s.points)}L${x(s.points[s.points.length - 1].t)},${y(Math.max(vMin, 0))}L${x(s.points[0].t)},${y(Math.max(vMin, 0))}Z`} fill={s.color} opacity={0.1} />
              )}
              <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
            </g>
          ))}
          {hp && (
            <g>
              <line x1={x(hp.t)} x2={x(hp.t)} y1={pad.t} y2={pad.t + ih} stroke="var(--axis)" strokeWidth={1} />
              {series.map((s) => {
                const p = s.points[Math.min(hover!, s.points.length - 1)];
                return p ? <circle key={s.key} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} /> : null;
              })}
            </g>
          )}
        </svg>
        {hp && (
          <div className="pointer-events-none absolute top-2 z-10 w-44 rounded-lg border border-line bg-surface-2 p-2 text-xs shadow-[var(--shadow)]" style={{ left: tipLeft }}>
            <div className="mb-1 text-muted">{new Date(hp.t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            {series.map((s) => {
              const p = s.points[Math.min(hover!, s.points.length - 1)];
              return p ? (
                <div key={s.key} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-ink-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="tnum font-medium text-ink">{yFormat(p.v)}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
