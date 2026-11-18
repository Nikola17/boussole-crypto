// Fiscalité française des particuliers (régime de l'article 150 VH bis du CGI).
// Plus-value d'une cession imposable = C − A × C / V
//   C : prix de cession (net de frais), V : valeur globale du portefeuille au moment de la cession,
//   A : prix total d'acquisition du portefeuille (diminué des fractions déjà imputées).
// Les échanges crypto → crypto sont neutres. Exonération si le total des cessions de l'année ≤ 305 €.
// Taux par défaut 2026 : flat tax 31,4 % (12,8 % IR + 18,6 % prélèvements sociaux).
// Estimation pédagogique : ne remplace pas un expert-comptable.

import type { Transaction } from '../types';
import { sortTx, txAmounts } from './portfolio';

export const EXEMPTION_THRESHOLD_EUR = 305;
export const DEFAULT_TAX_RATE_PCT = 31.4;

export interface TaxEvent {
  txId: string;
  date: string;
  symbol: string;
  cession: number; // C
  portfolioValue: number | null; // V
  acquisitionBefore: number; // A avant la cession
  fractionImputed: number; // A × C / V
  gain: number; // C − A × C / V
  missingValue: boolean;
}

export interface TaxYear {
  year: number;
  events: TaxEvent[];
  totalCessions: number;
  netGain: number;
  exempt: boolean;
  tax: number;
  incomplete: boolean;
}

export interface TaxReport {
  years: TaxYear[];
  acquisitionRemaining: number;
}

export function computeFrenchTax(txs: Transaction[], ratePct = DEFAULT_TAX_RATE_PCT): TaxReport {
  let A = 0;
  const byYear = new Map<number, TaxEvent[]>();
  for (const tx of sortTx(txs)) {
    const gross = txAmounts(tx, tx.quantity * tx.price).eur;
    const fee = txAmounts(tx, tx.fee || 0).eur;
    if ((tx.type === 'buy' || tx.type === 'deposit') && tx.fromFiat !== false) {
      A += gross + fee;
    } else if (tx.type === 'sell' && tx.toFiat !== false) {
      const C = Math.max(0, gross - fee);
      const V = tx.portfolioValueEur && tx.portfolioValueEur > 0 ? Math.max(tx.portfolioValueEur, C) : null;
      const fraction = V ? (A * C) / V : 0;
      const ev: TaxEvent = {
        txId: tx.id,
        date: tx.date,
        symbol: tx.symbol,
        cession: C,
        portfolioValue: V,
        acquisitionBefore: A,
        fractionImputed: fraction,
        gain: V ? C - fraction : 0,
        missingValue: !V,
      };
      if (V) A = Math.max(0, A - fraction);
      const y = Number(tx.date.slice(0, 4));
      byYear.set(y, [...(byYear.get(y) ?? []), ev]);
    }
  }
  const years: TaxYear[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, events]) => {
      const totalCessions = events.reduce((s, e) => s + e.cession, 0);
      const netGain = events.reduce((s, e) => s + e.gain, 0);
      const exempt = totalCessions <= EXEMPTION_THRESHOLD_EUR;
      return {
        year,
        events,
        totalCessions,
        netGain,
        exempt,
        tax: exempt ? 0 : Math.max(0, netGain) * (ratePct / 100),
        incomplete: events.some((e) => e.missingValue),
      };
    });
  return { years, acquisitionRemaining: A };
}

export interface SaleSimulation {
  cession: number;
  portfolioValue: number;
  acquisition: number;
  fractionImputed: number;
  gain: number;
  tax: number;
  net: number;
  exempt: boolean;
  acquisitionAfter: number;
}

/** Simule une cession imposable aujourd'hui. `alreadyCededThisYear` sert au seuil de 305 €. */
export function simulateSale(
  cession: number,
  portfolioValue: number,
  acquisition: number,
  ratePct = DEFAULT_TAX_RATE_PCT,
  alreadyCededThisYear = 0,
): SaleSimulation {
  const V = Math.max(portfolioValue, cession, 1e-9);
  const fraction = (acquisition * cession) / V;
  const gain = cession - fraction;
  const exempt = alreadyCededThisYear + cession <= EXEMPTION_THRESHOLD_EUR;
  const tax = exempt ? 0 : Math.max(0, gain) * (ratePct / 100);
  return {
    cession,
    portfolioValue: V,
    acquisition,
    fractionImputed: fraction,
    gain,
    tax,
    net: cession - tax,
    exempt,
    acquisitionAfter: Math.max(0, acquisition - fraction),
  };
}

/**
 * CSV (point-virgule, guillemets échappés) des cessions d'une année, prêt à être repris
 * dans le formulaire 2086 : une ligne par cession + une ligne TOTAL.
 */
export function taxYearCsv(y: TaxYear): string {
  const head = ['Année', 'Date', 'Actif cédé', 'Prix de cession (€)', 'Fraction du prix d’acquisition imputée (€)', 'Plus-value / moins-value (€)', 'Valeur du portefeuille à la cession (€)'];
  const rows: (string | number)[][] = y.events.map((e) => [
    y.year,
    e.date,
    e.symbol,
    e.cession.toFixed(2),
    e.fractionImputed.toFixed(2),
    e.gain.toFixed(2),
    e.portfolioValue != null ? e.portfolioValue.toFixed(2) : 'non renseignée',
  ]);
  rows.push([y.year, 'TOTAL', '', y.totalCessions.toFixed(2), '', y.netGain.toFixed(2), '']);
  const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  return [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}
