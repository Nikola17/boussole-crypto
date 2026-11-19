// Simulations « et si » : rejouer tes décisions passées avec les prix d'aujourd'hui.
// Vente : ce que tu as reçu vs ce que la crypto vaudrait si tu avais gardé → le coût de la vente.
// Achat : ce que tu as payé vs ce que ça vaut aujourd'hui → le gain de la décision.
// Pur et testable : aucun accès réseau.

import type { Transaction } from '../types';

export interface WhatIfRow {
  txId: string;
  date: string;
  type: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  /** Prix unitaire au moment de la transaction, dans la devise de la tx. */
  priceAtTx: number;
  /** Montant de la décision dans la devise de la tx (proceeds pour une vente, coût+frais pour un achat). */
  amountAtTx: number;
  /** Valeur aujourd'hui dans la même devise (null si prix inconnu). */
  valueNow: number | null;
  /** valueNow − amountAtTx : > 0 = la décision a coûté (vente) ou gagné (achat) ce montant. */
  delta: number | null;
}

export interface WhatIfSummary {
  rows: WhatIfRow[];
  /** Somme des deltas des VENTES : ce que tes ventes t'ont "coûté" par rapport à garder. */
  costOfSelling: number | null;
  /** Somme des deltas des ACHATS : ce que tes achats t'ont rapporté. */
  gainOfBuying: number | null;
  best: WhatIfRow | null;
  worst: WhatIfRow | null;
}

/**
 * @param priceNowUsd prix actuel en USD par coinId (null si inconnu)
 * @param fx taux EUR pour 1 USD
 */
export function whatIfTransactions(
  txs: Transaction[],
  priceNowUsd: (coinId: string) => number | null,
  fx: number,
): WhatIfSummary {
  const rows: WhatIfRow[] = [];
  for (const tx of txs) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue;
    if (!(tx.quantity > 0) || !(tx.price > 0)) continue;
    const inEur = tx.currency === 'EUR';
    const priceNow = priceNowUsd(tx.coinId);
    const valueNow = priceNow == null ? null : priceNow * (inEur ? fx : 1) * tx.quantity;
    const amountAtTx = tx.type === 'sell' ? tx.quantity * tx.price : tx.quantity * tx.price + (tx.fee ?? 0);
    const delta = valueNow == null ? null : valueNow - amountAtTx;
    rows.push({
      txId: tx.id, date: tx.date, type: tx.type, symbol: tx.symbol, quantity: tx.quantity,
      priceAtTx: tx.price, amountAtTx, valueNow, delta,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const sells = rows.filter((r) => r.type === 'sell' && r.delta != null);
  const buys = rows.filter((r) => r.type === 'buy' && r.delta != null);
  const sum = (list: WhatIfRow[]) => (list.length ? list.reduce((s, r) => s + (r.delta ?? 0), 0) : null);
  const byAbs = [...rows.filter((r) => r.delta != null)].sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
  return {
    rows,
    costOfSelling: sum(sells),
    gainOfBuying: sum(buys),
    best: byAbs[0] ?? null,
    worst: byAbs.length > 1 ? byAbs[byAbs.length - 1] : null,
  };
}
