// « Et si tout avait été placé en Bitcoin ? » : les mêmes montants, aux mêmes dates, rejoués en achats de Bitcoin.
// Comparaison simplifiée : elle ne tient compte ni des frais ni de l'impôt.

import type { Transaction } from '../types';
import { isStable, txAmounts } from './portfolio';

export interface Flow {
  date: string; // AAAA-MM-JJ
  /** Positif : argent mis dans le portefeuille ; négatif : argent retiré. */
  usd: number;
}

const notional = (tx: Transaction) => txAmounts(tx, tx.quantity * tx.price).usd;
const fees = (tx: Transaction) => txAmounts(tx, tx.fee || 0).usd;

/** Argent réellement mis ou retiré : achats payés en monnaie classique, ventes converties en monnaie classique. */
export function fiatFlows(txs: Transaction[]): Flow[] {
  const out: Flow[] = [];
  for (const tx of txs) {
    if (tx.type === 'buy' && tx.fromFiat !== false) out.push({ date: tx.date, usd: notional(tx) + fees(tx) });
    else if (tx.type === 'sell' && tx.toFiat !== false) out.push({ date: tx.date, usd: -(notional(tx) - fees(tx)) });
  }
  return out;
}

/** Montants engagés dans les lignes « découverte » (hors Bitcoin, Ethereum et stablecoins), quel que soit le moyen de paiement. */
export function discoveryFlows(txs: Transaction[], coreIds: Set<string>): Flow[] {
  const out: Flow[] = [];
  for (const tx of txs) {
    if (coreIds.has(tx.coinId) || isStable(tx.symbol, tx.coinId)) continue;
    if (tx.type === 'buy') out.push({ date: tx.date, usd: notional(tx) + fees(tx) });
    else if (tx.type === 'sell') out.push({ date: tx.date, usd: -(notional(tx) - fees(tx)) });
  }
  return out;
}

/** Cours de clôture journalier (USD) par jour UTC. */
export function priceByDay(candles: { time: number; close: number }[]): Map<string, number> {
  return new Map(candles.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]));
}

export interface Benchmark {
  investedUsd: number;
  btcQty: number;
  valueUsd: number;
  /** Mouvements ignorés faute de cours Bitcoin à cette date. */
  skipped: number;
}

export function btcBenchmark(flows: Flow[], prices: Map<string, number>, nowPrice: number): Benchmark {
  let qty = 0;
  let invested = 0;
  let skipped = 0;
  for (const f of [...flows].sort((a, b) => a.date.localeCompare(b.date))) {
    let p = prices.get(f.date);
    // Jour sans bougie (très récent ou trou de données) : on prend le dernier cours des 7 jours précédents.
    for (let back = 1; p == null && back <= 7; back++) {
      const d = new Date(`${f.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - back);
      p = prices.get(d.toISOString().slice(0, 10));
    }
    if (p == null || !(p > 0)) { skipped++; continue; }
    qty += f.usd / p;
    invested += f.usd;
  }
  return { investedUsd: invested, btcQty: qty, valueUsd: Math.max(0, qty) * nowPrice, skipped };
}

export interface Comparison {
  investedUsd: number;
  actualUsd: number;
  btcUsd: number;
  diffUsd: number;
  /** Écart relatif à la valeur « tout en Bitcoin ». */
  diffPct: number;
}

export function compare(actualUsd: number, b: Benchmark): Comparison {
  return { investedUsd: b.investedUsd, actualUsd, btcUsd: b.valueUsd, diffUsd: actualUsd - b.valueUsd, diffPct: b.valueUsd > 0 ? (actualUsd / b.valueUsd - 1) * 100 : 0 };
}
