// Rapport mensuel du portefeuille : à partir des relevés quotidiens (snapshots) et du journal.
// Fonction pure, testée ; exporté en texte (Markdown) pour archivage ou partage avec un conseil.

import type { BasketExecution, DcaExecution, PortfolioSnapshot, Transaction } from '../types';
import { txAmounts } from './portfolio';

export interface MonthReport {
  year: number;
  month: number; // 1-12
  label: string;
  firstDay: string;
  lastDay: string;
  startValueUsd: number | null;
  endValueUsd: number | null;
  changePct: number | null;
  investedUsd: number;
  withdrawnUsd: number;
  feesUsd: number;
  txCount: number;
  dcaCount: number;
}

/** Rapport d'un mois donné ; null s'il n'y a aucun relevé complet ce mois-là. */
export function monthReport(
  year: number,
  month: number,
  snapshots: PortfolioSnapshot[],
  txs: Transaction[],
  dcaExecs: DcaExecution[],
  basketExecs: BasketExecution[],
): MonthReport | null {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const snaps = snapshots.filter((s) => s.day.startsWith(prefix) && s.complete).sort((a, b) => a.day.localeCompare(b.day));
  if (!snaps.length) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const monthTxs = txs.filter((t) => t.date.startsWith(prefix));
  let investedUsd = 0;
  let withdrawnUsd = 0;
  let feesUsd = 0;
  for (const t of monthTxs) {
    if (t.type === 'buy' || t.type === 'deposit') investedUsd += txAmounts(t, t.quantity * t.price).usd;
    if (t.type === 'sell' || t.type === 'withdraw') withdrawnUsd += txAmounts(t, t.quantity * t.price).usd;
    feesUsd += txAmounts(t, t.fee || 0).usd;
  }
  const dcaCount = dcaExecs.filter((e) => !e.skipped && e.date?.startsWith(prefix)).length
    + basketExecs.filter((e) => !e.skipped && e.date?.startsWith(prefix)).length;
  const changePct = first.valueUsd > 0 && last.valueUsd > 0 ? ((last.valueUsd - first.valueUsd) / first.valueUsd) * 100 : null;
  return {
    year,
    month,
    label: `${year}-${String(month).padStart(2, '0')}`,
    firstDay: first.day,
    lastDay: last.day,
    startValueUsd: first.valueUsd,
    endValueUsd: last.valueUsd,
    changePct,
    investedUsd,
    withdrawnUsd,
    feesUsd,
    txCount: monthTxs.length,
    dcaCount,
  };
}

/** Mois disponibles (avec au moins un relevé complet), du plus récent au plus ancien. */
export function availableMonths(snapshots: PortfolioSnapshot[]): { year: number; month: number; label: string }[] {
  const set = new Set<string>();
  for (const s of snapshots) if (s.complete) set.add(s.day.slice(0, 7));
  return [...set].sort().reverse().map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { year: y, month: m, label: k };
  });
}

const eur = (usd: number, rate: number) => usd * rate;

/** Export texte (Markdown) du rapport, en devise d'affichage. */
export function monthReportText(r: MonthReport, currency: 'EUR' | 'USD', rate: number): string {
  const fx = currency === 'EUR' ? rate : 1;
  const v = (usd: number | null) => (usd == null ? '—' : `${(eur(usd, fx)).toFixed(2)} ${currency}`);
  const lines = [
    `# Rapport Boussole — ${r.label}`,
    ``,
    `- Période : ${r.firstDay} → ${r.lastDay}`,
    `- Valeur en début de mois : ${v(r.startValueUsd)}`,
    `- Valeur en fin de mois : ${v(r.endValueUsd)}`,
    `- Variation du portefeuille : ${r.changePct != null ? `${r.changePct.toFixed(1)} %` : '—'}`,
    `- Investi (achats + dépôts) : ${v(r.investedUsd)}`,
    `- Cédé (ventes + retraits) : ${v(r.withdrawnUsd)}`,
    `- Frais payés : ${v(r.feesUsd)}`,
    `- Transactions : ${r.txCount} · échéances DCA/panier exécutées : ${r.dcaCount}`,
    ``,
    `Généré par Boussole le ${new Date().toISOString().slice(0, 10)} — outil d'aide à la décision, pas un conseil.`,
  ];
  return lines.join('\n');
}
