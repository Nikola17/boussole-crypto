// Arène des Autopilotes : comparaison multi-courbes normalisées (base 100), Heatmap P&L quotidien
// et tableau quantitatif institutionnel (Sharpe, Sortino, Calmar, Ulcer, Exposure, Monte Carlo P95 DD, Alpha Decay).

import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useAutopilotView } from './Autopilots';
import {
  calmarRatio, closedTrades, dailyReturns, exposurePct, maxDrawdownPct, sharpeRatio, sortinoRatio, twr, ulcerIndex, type DayPoint,
} from '../../lib/lab/metrics';
import { logsToFills } from '../../lib/lab/autoView';
import { runMonteCarlo } from '../../lib/lab/montecarlo';
import { detectAlphaDecay } from '../../lib/lab/alphaDecay';
import { fmtNum } from '../../lib/format';
import { Badge, Card, Empty, Segmented } from '../../components/ui';
import type { PaperPortfolio } from '../../types';

const COLORS = ['#eab308', '#38bdf8', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#f43f5e'];
const fmt2 = (x: number | null) => (x != null && Number.isFinite(x) ? fmtNum(x, 2) : '—');
const pct1 = (x: number | null) => (x != null && Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${fmtNum(x, 1)} %` : '—');

function normalized(series: DayPoint[], days: number | null): { day: string; idx: number }[] {
  const slice = days != null && series.length > days ? series.slice(-days - 1) : series;
  if (slice.length < 2) return [];
  const out: { day: string; idx: number }[] = [{ day: slice[0].day, idx: 100 }];
  let v = 100;
  for (let i = 1; i < slice.length; i++) {
    const base = slice[i - 1].valueUsd + slice[i].flowUsd;
    if (base > 0) v *= slice[i].valueUsd / base;
    out.push({ day: slice[i].day, idx: v });
  }
  return out;
}

function ArenaRow({ p, color }: { p: PaperPortfolio; color: string }) {
  const v = useAutopilotView(p);
  const fills = useMemo(() => logsToFills(v.logs), [v.logs]);
  const closed = useMemo(() => closedTrades(fills), [fills]);
  const mc = useMemo(() => runMonteCarlo(closed, { draws: 1000, seed: p.id }), [closed, p.id]);
  const decay = useMemo(() => detectAlphaDecay(fills), [fills]);
  const perf = v.series.length > 1 ? twr(v.series) * 100 : null;
  const sharpe = sharpeRatio(v.series);
  const sortino = sortinoRatio(v.series);
  const calmar = calmarRatio(v.series);
  const ulcer = ulcerIndex(v.series);
  const exp = exposurePct(v.series);
  const mdd = v.series.length > 1 ? maxDrawdownPct(v.series) : null;

  const decayTone = decay.status === 'sain' ? 'up' : decay.status === 'degrade' ? 'down' : decay.status === 'vigilance' ? 'warn' : 'neutral';

  return (
    <li className="grid grid-cols-2 gap-x-2 gap-y-1 py-2.5 text-xs sm:text-sm md:grid-cols-[minmax(0,1.8fr)_repeat(7,minmax(0,1fr))_auto] md:items-center">
      <span className="col-span-2 flex items-center gap-2 font-medium text-ink md:col-span-1">
        <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{p.name}</span>
      </span>
      <span className={`tnum ${(perf ?? 0) >= 0 ? 'text-good' : 'text-critical'}`}>{pct1(perf)}</span>
      <span className="tnum text-ink-2">{fmt2(sharpe)}</span>
      <span className="tnum text-ink-2">{fmt2(sortino)}</span>
      <span className="tnum text-ink-2">{fmt2(calmar)}</span>
      <span className="tnum text-ink-2">{mdd != null ? `${fmtNum(mdd, 1)} %` : '—'}{ulcer != null ? ` (UI ${fmtNum(ulcer, 1)})` : ''}</span>
      <span className="tnum text-ink-2">{exp != null ? `${Math.round(exp)} %` : '—'}</span>
      <span className="tnum text-ink-2">{mc ? `${fmtNum(mc.mddP95Pct, 1)} %` : '—'}</span>
      <span><Badge tone={decayTone}>{decay.status}</Badge></span>
    </li>
  );
}

/** Collecteur individuel d'une courbe pour l'Arène (hook stable par autopilote). */
function CurveCollector({ p, days, onData }: { p: PaperPortfolio; days: number | null; onData: (id: string, pts: { day: string; idx: number }[], rets: { day: string; r: number }[]) => void }) {
  const v = useAutopilotView(p);
  useMemo(() => {
    const pts = normalized(v.series, days);
    const rs = dailyReturns(v.series);
    const dayRets = rs.map((r, i) => ({ day: v.series[i + 1]?.day ?? '', r })).filter((x) => x.day);
    onData(p.id, pts, dayRets);
  }, [p.id, v.series, days, onData]);
  return null;
}

export function ArenaTab() {
  const portfolios = useStore((s) => s.paperPortfolios);
  const autos = useMemo(() => portfolios.filter((p) => p.kind === 'auto' && !p.archived), [portfolios]);
  const [period, setPeriod] = useState<'30' | '90' | '180' | 'all'>('90');
  const [curves, setCurves] = useState<Record<string, { day: string; idx: number }[]>>({});
  const [heatByAuto, setHeatByAuto] = useState<Record<string, { day: string; r: number }[]>>({});
  const days = period === 'all' ? null : Number(period);

  const handleData = useMemo(() => (id: string, pts: { day: string; idx: number }[], rets: { day: string; r: number }[]) => {
    setCurves((prev) => (prev[id]?.length === pts.length && prev[id]?.[pts.length - 1]?.idx === pts[pts.length - 1]?.idx ? prev : { ...prev, [id]: pts }));
    setHeatByAuto((prev) => (prev[id]?.length === rets.length ? prev : { ...prev, [id]: rets }));
  }, []);

  // Heatmap agrégée des 60 derniers jours (rendement quotidien moyen de tous les autopilotes actifs)
  const heatmap = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const arr of Object.values(heatByAuto)) {
      for (const { day, r } of arr) {
        const list = byDay.get(day) ?? [];
        list.push(r);
        byDay.set(day, list);
      }
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60)
      .map(([day, rs]) => ({ day, pct: (rs.reduce((s, x) => s + x, 0) / rs.length) * 100 }));
  }, [heatByAuto]);

  // Coordonnées SVG multi-courbes
  const chart = useMemo(() => {
    const allDays = [...new Set(Object.values(curves).flatMap((c) => c.map((p) => p.day)))].sort();
    const allVals = Object.values(curves).flatMap((c) => c.map((p) => p.idx));
    if (allDays.length < 2 || !allVals.length) return null;
    const min = Math.min(95, ...allVals);
    const max = Math.max(105, ...allVals);
    const span = Math.max(1, max - min);
    const dayIdx = new Map(allDays.map((d, i) => [d, i]));
    const W = 640, H = 210, pad = 16;
    const toX = (d: string) => pad + ((dayIdx.get(d) ?? 0) / (allDays.length - 1)) * (W - 2 * pad);
    const toY = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
    const lines = autos.map((p, k) => {
      const pts = curves[p.id] ?? [];
      const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.day).toFixed(1)},${toY(pt.idx).toFixed(1)}`).join(' ');
      return { id: p.id, name: p.name, color: COLORS[k % COLORS.length], d, last: pts[pts.length - 1]?.idx ?? null };
    }).filter((x) => x.d);
    return { W, H, y100: toY(100), min, max, lines };
  }, [autos, curves]);

  if (autos.length === 0) {
    return (
      <Card title="Arène des autopilotes">
        <Empty title="Aucun autopilote actif">Démarre plusieurs stratégies (All-Weather, Retour à la moyenne, Swing 4H, Rotation Momentum…) pour comparer leurs courbes et leurs ratios ici.</Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {autos.map((p) => <CurveCollector key={p.id} p={p} days={days} onData={handleData} />)}

      <Card
        title="Arène multi-courbes (base 100)"
        subtitle="Toutes tes stratégies actives comparées sur la même échelle, net de frais"
        actions={<Segmented value={period} onChange={setPeriod} options={[
          { value: '30', label: '30 j' }, { value: '90', label: '90 j' }, { value: '180', label: '180 j' }, { value: 'all', label: 'Tout' },
        ]} />}
      >
        {chart ? (
          <div className="space-y-2">
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="h-52 w-full">
              <line x1="16" x2={chart.W - 16} y1={chart.y100} y2={chart.y100} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="4 4" />
              {chart.lines.map((l) => (
                <path key={l.id} d={l.d} fill="none" stroke={l.color} strokeWidth="2" />
              ))}
            </svg>
            <div className="flex flex-wrap gap-3 text-xs text-ink-2">
              {chart.lines.map((l) => (
                <span key={l.id} className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name} {l.last != null && <strong className="tnum text-ink">{pct1(l.last - 100)}</strong>}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Les courbes apparaîtront dès que les autopilotes auront au moins 2 jours en direct.</p>
        )}
      </Card>

      <Card title="Heatmap P&L quotidien (60 derniers jours)" subtitle="Rendement journalier moyen des autopilotes actifs — vert = journée gagnante, rouge = journée perdante">
        {heatmap.length === 0 ? (
          <p className="text-sm text-muted">Pas encore d’historique quotidien en direct.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {heatmap.map((h) => {
              const bg = h.pct > 1.5 ? 'bg-good text-canvas' : h.pct > 0 ? 'bg-good/40 text-ink' : h.pct < -1.5 ? 'bg-critical text-canvas' : h.pct < 0 ? 'bg-critical/40 text-ink' : 'bg-surface-2 text-muted';
              return (
                <div key={h.day} title={`${h.day} : ${pct1(h.pct)}`} className={`flex size-7 items-center justify-center rounded text-[10px] font-medium tnum ${bg}`}>
                  {h.day.slice(8)}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Tableau quantitatif institutionnel" subtitle="Sharpe, Sortino, Calmar, Ulcer Index, exposition marché, drawdown extrême Monte Carlo (P95) et dérive d’edge (Alpha Decay)">
        <div className="hidden border-b border-line pb-1 text-xs text-muted md:grid md:grid-cols-[minmax(0,1.8fr)_repeat(7,minmax(0,1fr))_auto] md:gap-x-2">
          <span>Stratégie</span><span>Direct</span><span>Sharpe</span><span>Sortino</span><span>Calmar</span><span>Max DD (UI)</span><span>Expo.</span><span>MC P95 DD</span><span>Edge</span>
        </div>
        <ul className="divide-y divide-line">
          {autos.map((p, k) => <ArenaRow key={p.id} p={p} color={COLORS[k % COLORS.length]} />)}
        </ul>
      </Card>
    </div>
  );
}
