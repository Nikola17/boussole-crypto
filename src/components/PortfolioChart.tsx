// Wallet : la valeur du portefeuille dans le temps, les versements cumulés et « tout en Bitcoin ».
// Reconstituée d'après le journal jusqu'au premier relevé quotidien, puis fidèle aux relevés.

import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { usePaperCloses } from '../hooks/usePaperData';
import { journalEquity, periodStats } from '../lib/history/equity';
import { mergeEquity } from '../lib/history/snapshots';
import { fiatFlows } from '../lib/benchmark';
import { fmtNum, isoDay } from '../lib/format';
import { LineChart } from './LineChart';
import { Card, Segmented, Stat } from './ui';

type Range = '1m' | '3m' | '1a' | 'tout';
const DAYS: Record<Range, number> = { '1m': 30, '3m': 91, '1a': 365, tout: 100_000 };
const t = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;
const pct = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${fmtNum(x)} %` : '—');

export function PortfolioChart() {
  const txs = useStore((s) => s.transactions);
  const snapshots = useStore((s) => s.portfolioSnapshots);
  const currency = useStore((s) => s.settings.currency);
  const [range, setRange] = useState<Range>('1a');
  const coins = useMemo(() => [{ coinId: 'bitcoin', symbol: 'btc' }, ...[...new Map(txs.map((x) => [x.coinId, { coinId: x.coinId, symbol: x.symbol }])).values()]], [txs]);
  const closes = usePaperCloses(coins);
  const first = useMemo(() => txs.reduce((m, x) => (x.date < m ? x.date : m), '9999'), [txs]);
  const data = useMemo(() => {
    if (!closes.data || first === '9999') return null;
    const today = isoDay();
    const { series: rebuilt, missing } = journalEquity(txs, closes.data, first, today);
    const { series, firstSnapshotDay } = mergeEquity(rebuilt, snapshots);
    const btc = closes.data.get('bitcoin');
    const flows = new Map<string, number>();
    for (const f of fiatFlows(txs)) flows.set(f.date, (flows.get(f.date) ?? 0) + f.usd);
    let qty = 0;
    let invested = 0;
    let lastBtc = 0;
    const ref = series.map((p) => {
      const px = btc?.get(p.day) ?? lastBtc;
      lastBtc = px;
      const usd = flows.get(p.day) ?? 0;
      invested += usd;
      if (px > 0) qty += usd / px;
      return { day: p.day, btc: qty * px, invested };
    });
    return { series, ref, missing, firstSnapshotDay };
  }, [closes.data, first, txs, snapshots]);
  if (first === '9999') return null;
  const cut = data ? Math.max(0, data.series.length - 1 - DAYS[range]) : 0;
  const series = data?.series.slice(cut) ?? [];
  const ref = data?.ref.slice(cut) ?? [];
  const st = series.length > 1 ? periodStats(series) : null;
  return (
    <Card title="Valeur du portefeuille" subtitle={data?.firstSnapshotDay ? `Reconstituée d’après le journal jusqu’au ${new Date(data.firstSnapshotDay).toLocaleDateString('fr-FR')}, puis relevés quotidiens` : 'Reconstituée d’après le journal (les relevés quotidiens commencent aujourd’hui)'}
      actions={<Segmented value={range} onChange={setRange} options={[{ value: '1m', label: '1 mois' }, { value: '3m', label: '3 mois' }, { value: '1a', label: '1 an' }, { value: 'tout', label: 'Tout' }]} />}>
      {!data ? <p className="text-sm text-muted">Chargement de l’historique des prix…</p> : (
        <>
          {series.length > 1 ? (
            <LineChart height={220} yFormat={(v) => `${fmtNum(v, 0)} $`} series={[
              { key: 'v', label: 'Valeur', color: 'var(--series-1)', area: true, points: series.map((p) => ({ t: t(p.day), v: p.valueUsd })) },
              { key: 'i', label: 'Versements cumulés', color: 'var(--series-3)', dashed: true, points: ref.map((p) => ({ t: t(p.day), v: p.invested })) },
              { key: 'b', label: 'Tout en Bitcoin', color: 'var(--series-2)', dashed: true, points: ref.map((p) => ({ t: t(p.day), v: p.btc })) },
            ]} />
          ) : <p className="text-sm text-muted">La courbe apparaîtra après deux jours d’historique.</p>}
          {st && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Performance (hors versements)" value={pct(st.twrPct)} hint="pondérée par le temps" />
              <Stat label="Rendement annuel de ton argent" value={pct(st.xirrPct)} hint="pondéré par les versements" />
              <Stat label="Baisse maximale" value={pct(st.maxDrawdownPct)} />
              <Stat label="Meilleur · pire mois" value={`${pct(st.bestMonth?.pct)} · ${pct(st.worstMonth?.pct)}`} />
            </div>
          )}
          {data.missing.length > 0 && <p className="mt-2 text-xs text-muted">Prix inconnu (dernier prix connu utilisé) : {data.missing.join(', ')}.</p>}
          <p className="mt-1 text-xs text-muted">Valeurs en dollars{currency === 'EUR' ? ' (les montants du reste de la page sont en euros)' : ''}. Les soldes lus sur la blockchain sans transaction au journal n’apparaissent que dans les relevés quotidiens.</p>
        </>
      )}
    </Card>
  );
}
