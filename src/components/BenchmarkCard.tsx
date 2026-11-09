// « Et si tout avait été placé en Bitcoin ? » : ton portefeuille et ta poche découverte face à Bitcoin seul.

import { Scale } from 'lucide-react';
import { useBenchmark } from '../hooks/useBenchmark';
import type { Comparison } from '../lib/benchmark';
import { fmtMoney, fmtPct } from '../lib/format';
import { Card, Delta } from './ui';

function Row({ title, c, rate, currency }: { title: string; c: Comparison; rate: number; currency: 'EUR' | 'USD' }) {
  const better = c.diffUsd >= 0;
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-muted">Mis</dt><dd className="tnum font-semibold text-ink">{fmtMoney(c.investedUsd * rate, currency, 0)}</dd></div>
        <div><dt className="text-xs text-muted">Aujourd’hui</dt><dd className="tnum font-semibold text-ink">{fmtMoney(c.actualUsd * rate, currency, 0)}</dd></div>
        <div><dt className="text-xs text-muted">Tout en Bitcoin</dt><dd className="tnum font-semibold text-ink">{fmtMoney(c.btcUsd * rate, currency, 0)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-ink-2">
        {better ? 'Tu fais mieux que Bitcoin seul' : 'Bitcoin seul aurait fait mieux'} : <b className="text-ink">{fmtMoney(Math.abs(c.diffUsd) * rate, currency, 0)}</b> d’écart (<Delta value={c.diffPct} className="inline-flex text-xs" />, {fmtPct(c.actualUsd > 0 ? (c.actualUsd / Math.max(c.investedUsd, 1) - 1) * 100 : 0, 0)} de gain pour toi contre {fmtPct(c.btcUsd > 0 && c.investedUsd > 0 ? (c.btcUsd / c.investedUsd - 1) * 100 : 0, 0)} pour Bitcoin).
      </p>
    </div>
  );
}

export function BenchmarkCard() {
  const { all, disc, rate, currency } = useBenchmark();

  if (!all && !disc) return null;
  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Scale className="size-4 text-accent" />Et si tout avait été en Bitcoin ?</span>}
      subtitle="Les mêmes montants, aux mêmes dates, rejoués en achats de Bitcoin (sans frais ni impôt)"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {all && <Row title="Tout ton portefeuille" c={all} rate={rate} currency={currency} />}
        {disc && <Row title="Ta poche découverte (hors Bitcoin, Ethereum, stablecoins)" c={disc} rate={rate} currency={currency} />}
      </div>
      <p className="mt-2 text-xs text-muted">Comparaison simplifiée, sur les opérations de ton journal. Le passé ne présage pas de l’avenir : sur une courte période, l’écart ne dit presque rien.</p>
    </Card>
  );
}
