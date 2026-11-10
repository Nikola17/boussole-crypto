// Cohérence du journal : ventes sans stock (solde d'ouverture manquant) et doublons entre tes saisies et un import.

import type { Transaction } from '../types';
import { sortTx } from './portfolio';

export interface MissingStock {
  coinId: string;
  symbol: string;
  name: string;
  image?: string;
  /** Quantité qu'il aurait fallu détenir avant la première opération pour que toutes les ventes soient couvertes. */
  missing: number;
  /** Nombre de ventes ou retraits qui dépassent le stock. */
  count: number;
}

/**
 * Ventes ou retraits qui dépassent ce que le journal dit détenir. `buildPositions` les plafonne en silence ;
 * ici on les signale, avec la quantité d'ouverture qui manque (ce que tu avais déjà avant le premier mouvement du journal).
 */
export function missingStock(txs: Transaction[]): MissingStock[] {
  const by = new Map<string, { sym: string; name: string; image?: string; bal: number; min: number; count: number }>();
  for (const tx of sortTx(txs)) {
    let c = by.get(tx.coinId);
    if (!c) { c = { sym: tx.symbol, name: tx.name, image: tx.image, bal: 0, min: 0, count: 0 }; by.set(tx.coinId, c); }
    if (tx.type === 'buy' || tx.type === 'deposit' || tx.type === 'reward') c.bal += tx.quantity;
    else if (tx.type === 'sell' || tx.type === 'withdraw') {
      c.bal -= tx.quantity;
      if (c.bal < c.min - 1e-12) { c.count++; c.min = c.bal; }
    }
  }
  return [...by.entries()]
    .filter(([, c]) => c.min < -1e-9)
    .map(([coinId, c]) => ({ coinId, symbol: c.sym, name: c.name, image: c.image, missing: -c.min, count: c.count }))
    .sort((a, b) => b.count - a.count);
}

/** Jour précédant la toute première opération (date du solde d'ouverture). */
export function dayBeforeFirst(txs: Transaction[]): string {
  const first = txs.map((t) => t.date).sort()[0];
  if (!first) return new Date().toISOString().slice(0, 10);
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface ManualMatch { incomingId: string; existingId: string }

const dayNumber = (s: string) => Math.floor(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/**
 * Rapproche chaque ligne importée d'une opération que tu avais notée à la main (« J'ai passé ces ordres », DCA, saisie) :
 * même crypto, même type, même compte (ou saisie sans compte), date à ±1 jour, quantité à ±1 %. Une saisie ne sert qu'une fois.
 */
export function matchManualEntries(existing: Transaction[], incoming: Transaction[], opts: { days?: number; tol?: number } = {}): ManualMatch[] {
  const days = opts.days ?? 1;
  const tol = opts.tol ?? 0.01;
  const manual = existing.filter((t) => t.source !== 'import' && (t.type === 'buy' || t.type === 'sell'));
  const used = new Set<string>();
  const out: ManualMatch[] = [];
  for (const inc of [...incoming].sort((a, b) => a.date.localeCompare(b.date))) {
    if (inc.type !== 'buy' && inc.type !== 'sell') continue;
    let best: { tx: Transaction; score: number } | null = null;
    for (const m of manual) {
      if (used.has(m.id) || m.type !== inc.type || m.coinId !== inc.coinId) continue;
      if (m.accountId && inc.accountId && m.accountId !== inc.accountId) continue;
      const dd = Math.abs(dayNumber(m.date) - dayNumber(inc.date));
      if (dd > days) continue;
      const rel = Math.abs(m.quantity - inc.quantity) / Math.max(m.quantity, inc.quantity, 1e-12);
      if (rel > tol) continue;
      const score = dd + rel * 10;
      if (!best || score < best.score) best = { tx: m, score };
    }
    if (best) { used.add(best.tx.id); out.push({ incomingId: inc.id, existingId: best.tx.id }); }
  }
  return out;
}
