// Carte « Risque » : concentration, corrélation au BTC, répartition par plateforme (risque de contrepartie)
// et scénarios de krach. Tout est calculé localement à partir du portefeuille valorisé.

import { ShieldAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useMarkets } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { aggregateByCoin } from '../lib/holdings';
import { riskMetrics, type RiskLine } from '../lib/portfolioRisk';
import { CUSTODY_LABEL, custodyOfAccount, type CustodyKind } from '../lib/platforms';
import { fmtMoney, fmtNum } from '../lib/format';
import { Badge, Card, Stat } from './ui';

export function RiskCard() {
  const currency = useStore((s) => s.settings.currency);
  const pf = usePortfolio();
  const markets = useMarkets();

  const metrics = useMemo(() => {
    const marketMap = new Map((markets.data ?? []).map((m) => [m.id, m]));
    const coins = aggregateByCoin(pf.holdings);
    const lines: RiskLine[] = coins.map((c) => ({
      symbol: c.symbol,
      bucket: c.bucket,
      value: c.value,
      coinId: c.coinId,
      series: c.coinId ? marketMap.get(c.coinId)?.sparkline_in_7d?.price : undefined,
      source: c.sources[0] ?? 'Journal',
    }));
    // Regroupe les sources par compte/wallet réel (les lignes agrégées par crypto perdent le détail).
    const accountByName = new Map(pf.accounts.map((a) => [a.name, a]));
    const bySource = new Map<string, { value: number; custody: CustodyKind | null }>();
    const byCustody = new Map<CustodyKind, number>();
    for (const h of pf.holdings) {
      const label = h.accountName ?? h.walletLabel ?? 'Journal';
      const acc = h.accountName ? accountByName.get(h.accountName) : undefined;
      const custody: CustodyKind | null = acc
        ? custodyOfAccount(acc)
        : h.source === 'wallet'
          ? 'self-hot'
          : null;
      const prev = bySource.get(label);
      bySource.set(label, { value: (prev?.value ?? 0) + h.value, custody: prev?.custody ?? custody });
      if (custody) byCustody.set(custody, (byCustody.get(custody) ?? 0) + h.value);
    }
    const btc = marketMap.get('bitcoin');
    const m = riskMetrics({
      total: pf.totals.value,
      alloc: pf.alloc,
      lines,
      btcSeries: btc?.sparkline_in_7d?.price,
    });
    return {
      ...m,
      bySource: [...bySource.entries()]
        .map(([label, { value, custody }]) => ({ label, value, custody, pct: pf.totals.value > 0 ? (value / pf.totals.value) * 100 : 0 }))
        .sort((a, b) => b.value - a.value),
      byCustody: [...byCustody.entries()]
        .map(([kind, value]) => ({ kind, value, pct: pf.totals.value > 0 ? (value / pf.totals.value) * 100 : 0 }))
        .sort((a, b) => b.value - a.value),
    };
  }, [pf.holdings, pf.accounts, pf.totals.value, pf.alloc, markets.data]);

  if (!pf.totals.value) return null;

  const hhiLabel = metrics.hhi >= 50 ? 'très concentré' : metrics.hhi >= 30 ? 'concentré' : 'diversifié';
  const custodyTone = (k: CustodyKind) => (k === 'self-hardware' ? 'up' : k === 'custodial' ? 'warn' : 'neutral');

  return (
    <Card title={<span className="inline-flex items-center gap-2"><ShieldAlert className="size-4 text-accent" />Risque du portefeuille</span>} subtitle="Calcul local, aucune donnée envoyée">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Concentration (HHI)" value={`${metrics.hhi}`} hint={hhiLabel} />
        <Stat label="Plus grosse ligne" value={`${fmtNum(metrics.top1Pct, 1)} %`} hint={`Top 3 : ${fmtNum(metrics.top3Pct, 1)} %`} />
        <Stat label="Corrélation BTC (7 j)" value={metrics.btcCorr != null ? fmtNum(metrics.btcCorr, 2) : '—'} hint={metrics.btcCorr != null ? (metrics.btcCorr > 0.85 ? 'tout bouge pareil' : 'un peu de diversification') : 'données insuffisantes'} />
        <Stat label="Pire scénario" value={`${fmtNum(metrics.scenarios[1]?.changePct ?? 0, 0)} %`} hint={fmtMoney(metrics.scenarios[1]?.value ?? 0, currency, 0)} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-ink-2">Où est détenu ton portefeuille (risque de contrepartie) :</p>
        {metrics.byCustody.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {metrics.byCustody.map((c) => (
              <Badge key={c.kind} tone={custodyTone(c.kind)}>
                {CUSTODY_LABEL[c.kind]} : {fmtNum(c.pct, 0)} %
              </Badge>
            ))}
          </div>
        )}
        <ul className="mt-2 space-y-1.5">
          {metrics.bySource.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate text-ink" title={s.custody ? `${s.label} · ${CUSTODY_LABEL[s.custody]}` : s.label}>{s.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, s.pct)}%` }} />
              </span>
              <span className="tnum w-24 text-right text-xs text-muted">{fmtNum(s.pct, 1)} % · {fmtMoney(s.value, currency, 0)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.scenarios.map((s) => (
          <div key={s.label} className="rounded-lg bg-surface-2 p-3">
            <div className="text-xs text-ink-2">{s.label}</div>
            <div className="tnum mt-0.5 text-sm font-semibold text-critical">{fmtNum(s.changePct, 1)} % → {fmtMoney(s.value, currency, 0)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
