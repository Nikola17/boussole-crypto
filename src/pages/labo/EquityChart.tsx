// Courbe de valeur d'un portefeuille papier, avec la même mise en Bitcoin en référence.

import { LineChart, type LineSeries } from '../../components/LineChart';
import { fmtNum } from '../../lib/format';
import type { DayPoint } from '../../lib/lab/metrics';

const t = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;

export function EquityChart({ series, reference, liveSince, height = 220 }: { series: DayPoint[]; reference?: DayPoint[] | null; liveSince?: string; height?: number }) {
  if (series.length < 2) return <p className="text-sm text-muted">La courbe apparaîtra après deux jours.</p>;
  const lines: LineSeries[] = [];
  const sim = liveSince ? series.filter((p) => p.day <= liveSince) : [];
  const live = liveSince ? series.filter((p) => p.day >= liveSince) : series;
  if (sim.length > 1) lines.push({ key: 'sim', label: 'Simulé (historique)', color: 'var(--series-1)', dashed: true, points: sim.map((p) => ({ t: t(p.day), v: p.valueUsd })) });
  lines.push({ key: 'live', label: liveSince ? 'En direct' : 'Valeur', color: 'var(--series-1)', area: !liveSince, points: live.map((p) => ({ t: t(p.day), v: p.valueUsd })) });
  if (reference && reference.length > 1) lines.push({ key: 'btc', label: 'Même mise en Bitcoin', color: 'var(--series-2)', dashed: true, points: reference.map((p) => ({ t: t(p.day), v: p.valueUsd })) });
  return <LineChart height={height} yFormat={(v) => `${fmtNum(v, 0)} $`} series={lines} />;
}
