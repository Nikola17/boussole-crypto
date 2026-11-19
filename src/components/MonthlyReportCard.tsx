// Carte « Rapport mensuel » (Plus) : synthèse d'un mois à partir des relevés quotidiens et du journal,
// exportable en Markdown pour archivage (ou à montrer à un conseil).

import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useFx } from '../hooks/useMarket';
import { useYields } from '../hooks/useYields';
import { usePortfolio } from '../hooks/usePortfolio';
import { YIELD_OPTIONS, yieldRows } from '../lib/staking';
import { availableMonths, defiOpenPnl, monthReport, monthReportText, type EarnSection } from '../lib/report';
import { fmtMoney, fmtNum } from '../lib/format';
import { saveTextFile } from '../lib/platform';
import { Button, Card, Field, Select, Stat } from './ui';

export function MonthlyReportCard() {
  const snapshots = useStore((s) => s.portfolioSnapshots);
  const txs = useStore((s) => s.transactions);
  const dcaExecs = useStore((s) => s.dcaExecutions);
  const basketExecs = useStore((s) => s.basketExecutions);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const defiBets = useStore((s) => s.defiBets);
  const pf = usePortfolio();
  const { quotes } = useYields();

  const months = useMemo(() => availableMonths(snapshots), [snapshots]);
  const [label, setLabel] = useState<string>('');
  const current = months.find((m) => m.label === label) ?? months[0];

  // Section « tout ce qui rapporte » : paris DeFi ouverts + rendement annuel estimé sur les lignes détenues.
  const earn = useMemo<EarnSection | undefined>(() => {
    const open = defiOpenPnl(defiBets);
    const positions: Record<string, number> = {};
    for (const h of pf.holdings) if (h.coinId) positions[h.coinId] = (positions[h.coinId] ?? 0) + h.valueUsd;
    const rows = yieldRows(YIELD_OPTIONS, quotes, positions, 0);
    let est: number | null = 0;
    for (const a of new Set(YIELD_OPTIONS.map((o) => o.coinId))) {
      const best = rows.filter((r) => r.option.coinId === a && r.option.risk <= 2 && r.quote?.apy != null && r.positionUsd > 0).sort((x, y) => (y.quote?.apy ?? 0) - (x.quote?.apy ?? 0))[0];
      if (best?.gainYearUsd != null) est += best.gainYearUsd;
    }
    return { defiOpenPnlUsd: open.pnlUsd, defiOpenCount: open.count, estYieldYearUsd: est };
  }, [defiBets, pf.holdings, quotes]);

  const report = useMemo(
    () => (current ? monthReport(current.year, current.month, snapshots, txs, dcaExecs, basketExecs, earn) : null),
    [current, snapshots, txs, dcaExecs, basketExecs, earn],
  );
  const rate = currency === 'EUR' ? fx : 1;
  const val = (usd: number | null) => (usd == null ? null : usd * rate);

  if (!months.length) return null;

  return (
    <Card title="Rapport mensuel" subtitle="Relevés quotidiens + journal : valeur, investissements, frais, DCA — exportable en Markdown">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Mois">
          <Select value={current?.label ?? ''} onChange={(e) => setLabel(e.target.value)}>
            {months.map((m) => <option key={m.label} value={m.label}>{m.label}</option>)}
          </Select>
        </Field>
        {report && (
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => void saveTextFile(`boussole-rapport-${report.label}.md`, monthReportText(report, currency, rate))}>
            Exporter ({report.label}.md)
          </Button>
        )}
      </div>
      {report && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Début → fin" value={val(report.startValueUsd) != null && val(report.endValueUsd) != null ? `${fmtMoney(val(report.startValueUsd)!, currency, 0)} → ${fmtMoney(val(report.endValueUsd)!, currency, 0)}` : '—'} hint={report.firstDay} />
          <Stat label="Variation" value={report.changePct != null ? `${fmtNum(report.changePct, 1)} %` : '—'} hint={report.lastDay} />
          <Stat label="Investi" value={fmtMoney(val(report.investedUsd) ?? 0, currency, 0)} hint={`cédé : ${fmtMoney(val(report.withdrawnUsd) ?? 0, currency, 0)}`} />
          <Stat label="Frais" value={fmtMoney(val(report.feesUsd) ?? 0, currency, 2)} hint={`${report.txCount} tx · ${report.dcaCount} échéances DCA`} />
        </div>
      )}
      {report?.earn && (report.earn.defiOpenCount > 0 || report.earn.estYieldYearUsd != null) && (
        <p className="mt-3 text-sm text-ink-2">
          🪙 Tout ce qui rapporte — paris DeFi ouverts : <b className="text-ink">{report.earn.defiOpenCount}</b> · P&amp;L :{' '}
          <span className={`tnum font-medium ${report.earn.defiOpenPnlUsd >= 0 ? 'text-up' : 'text-down'}`}>{fmtMoney(val(report.earn.defiOpenPnlUsd) ?? 0, currency, 2)}</span>
          {' '}· rendement annuel estimé (staking/Earn) : <b className="tnum text-ink">{report.earn.estYieldYearUsd != null ? fmtMoney(val(report.earn.estYieldYearUsd) ?? 0, currency, 0) : '—'}</b>
        </p>
      )}
    </Card>
  );
}
