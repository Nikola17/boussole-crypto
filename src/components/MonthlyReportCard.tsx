// Carte « Rapport mensuel » (Plus) : synthèse d'un mois à partir des relevés quotidiens et du journal,
// exportable en Markdown pour archivage (ou à montrer à un conseil).

import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useFx } from '../hooks/useMarket';
import { availableMonths, monthReport, monthReportText } from '../lib/report';
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

  const months = useMemo(() => availableMonths(snapshots), [snapshots]);
  const [label, setLabel] = useState<string>('');
  const current = months.find((m) => m.label === label) ?? months[0];

  const report = useMemo(
    () => (current ? monthReport(current.year, current.month, snapshots, txs, dcaExecs, basketExecs) : null),
    [current, snapshots, txs, dcaExecs, basketExecs],
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
    </Card>
  );
}
