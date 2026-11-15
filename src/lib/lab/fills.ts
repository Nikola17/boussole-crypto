// Règles d'exécution du Labo, identiques au banc d'essai, dans le papier manuel et dans l'autopilote.
// Achat : le montant inclut les frais ; prix obtenu = marché × (1 + écart). Vente : prix obtenu = marché × (1 − écart),
// frais sur le produit. Ordres en attente lus bougie par bougie : trou de cotation à l'ouverture, stop prioritaire.

import type { Candle } from '../indicators';
import type { Book, CostModel, Fill, Intent, Position } from './types';

const q8 = (x: number) => Math.round(x * 1e8) / 1e8;

export interface ApplyOptions { at: string; day: string; minOrderUsd: number }

/** Exécute un ordre au prix du marché `marketUsd` ; renvoie le nouveau portefeuille (l'ancien n'est pas modifié). */
export function applyIntent(book: Book, intent: Intent, marketUsd: number, costs: CostModel, opts: ApplyOptions): { book: Book; fill: Fill | null; skip: string | null } {
  const none = (skip: string) => ({ book, fill: null, skip });
  if (!(marketUsd > 0) || !Number.isFinite(marketUsd)) return none('prix inconnu');
  if (intent.skipAbove != null && marketUsd > intent.skipAbove) return none('le prix a trop bougé depuis la clôture');
  if (intent.skipBelow != null && marketUsd < intent.skipBelow) return none('le prix a trop bougé depuis la clôture');
  const s = costs.spreadPct / 100;
  const f = costs.feePct / 100;
  const base = { coinId: intent.coinId, symbol: intent.symbol, name: intent.name, marketUsd, at: opts.at, reason: intent.reason, ...(intent.tag ? { tag: intent.tag } : {}) };

  if (intent.side === 'buy') {
    const price = marketUsd * (1 + s);
    let amount: number;
    const sz = intent.sizing ?? { usd: 0 };
    if ('usd' in sz) amount = sz.usd;
    else {
      if (intent.stop == null || price <= intent.stop) return none('stop au-dessus du prix d’achat');
      // Quantité reçue = risque ÷ (prix obtenu − stop) ; le montant inclut les frais prélevés dessus.
      amount = Math.min(((sz.riskUsd / (price - intent.stop)) * price) / (1 - f), sz.maxUsd);
    }
    amount = Math.min(amount, book.cashUsd);
    if (!(amount >= opts.minOrderUsd)) return none('montant trop petit');
    const fee = amount * f;
    const quantity = q8((amount - fee) / price);
    if (!(quantity > 0)) return none('montant trop petit');
    const prev = book.positions[intent.coinId];
    const target = intent.stop != null && intent.targetR != null ? price + intent.targetR * (price - intent.stop) : undefined;
    const pos: Position = {
      coinId: intent.coinId, symbol: intent.symbol, name: intent.name,
      quantity: q8((prev?.quantity ?? 0) + quantity),
      costUsd: (prev?.costUsd ?? 0) + amount,
      openedOn: prev?.openedOn ?? opts.day,
      ...(intent.stop != null ? { stop: intent.stop } : prev?.stop != null ? { stop: prev.stop } : {}),
      ...(target != null ? { target } : prev?.target != null ? { target: prev.target } : {}),
    };
    const fill: Fill = { ...base, side: 'buy', kind: 'market', quantity, priceUsd: price, feeUsd: fee, ...(intent.stop != null ? { stop: intent.stop } : {}), ...(target != null ? { target } : {}) };
    return { book: { cashUsd: book.cashUsd - amount, positions: { ...book.positions, [intent.coinId]: pos } }, fill, skip: null };
  }

  const pos = book.positions[intent.coinId];
  if (!pos || !(pos.quantity > 0)) return none('aucune position à vendre');
  const fraction = Math.min(1, Math.max(0, intent.fraction ?? 1));
  if (!(fraction > 0)) return none('aucune quantité à vendre');
  return sellOut(book, pos, fraction, marketUsd, costs, { ...base, kind: 'market' });
}

function sellOut(book: Book, pos: Position, fraction: number, marketUsd: number, costs: CostModel, base: Omit<Fill, 'side' | 'quantity' | 'priceUsd' | 'feeUsd'>): { book: Book; fill: Fill; skip: null } {
  const quantity = fraction >= 1 ? pos.quantity : q8(pos.quantity * fraction);
  const price = marketUsd * (1 - costs.spreadPct / 100);
  const proceeds = quantity * price;
  const fee = proceeds * (costs.feePct / 100);
  const positions = { ...book.positions };
  const left = q8(pos.quantity - quantity);
  if (left > 0) positions[pos.coinId] = { ...pos, quantity: left, costUsd: pos.costUsd * (left / pos.quantity) };
  else delete positions[pos.coinId];
  const fill: Fill = { ...base, side: 'sell', quantity, priceUsd: price, feeUsd: fee };
  return { book: { cashUsd: book.cashUsd + proceeds - fee, positions }, fill, skip: null };
}

/**
 * Prix du marché auquel un ordre en attente s'exécute dans cette bougie, ou null.
 * Stop de vente : ouverture si elle est déjà sous le niveau (trou de cotation), sinon le niveau si le plus bas le touche.
 * Objectif (vente limite) et achat limite : symétriques.
 */
export function pendingHit(kind: 'stop' | 'target' | 'limitBuy', level: number, bar: Candle, opts: { gapRule?: boolean } = {}): number | null {
  const gap = opts.gapRule !== false;
  if (kind === 'stop') return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
  if (kind === 'target') return gap && bar.open >= level ? bar.open : bar.high >= level ? level : null;
  return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
}

/** Stop et objectif d'une position contre une bougie : le stop gagne quand les deux sont touchés. */
export function settleBar(book: Book, coinId: string, bar: Candle, costs: CostModel, at: string, opts: { gapRule?: boolean } = {}): { book: Book; fill: Fill | null } {
  const pos = book.positions[coinId];
  if (!pos) return { book, fill: null };
  const base = { coinId, symbol: pos.symbol, name: pos.name, at };
  const stopAt = pos.stop != null ? pendingHit('stop', pos.stop, bar, opts) : null;
  if (stopAt != null) {
    const r = sellOut(book, pos, 1, stopAt, costs, { ...base, marketUsd: stopAt, kind: 'stop', reason: 'stop touché', tag: 'stop' });
    return { book: r.book, fill: r.fill };
  }
  const targetAt = pos.target != null ? pendingHit('target', pos.target, bar, opts) : null;
  if (targetAt != null) {
    const r = sellOut(book, pos, 1, targetAt, costs, { ...base, marketUsd: targetAt, kind: 'target', reason: 'objectif atteint', tag: 'target' });
    return { book: r.book, fill: r.fill };
  }
  return { book, fill: null };
}

/** Solde une position au prix donné (paire retirée de la cotation : dernière clôture connue). */
export function delist(book: Book, coinId: string, lastClose: number, costs: CostModel, at: string): { book: Book; fill: Fill | null } {
  const pos = book.positions[coinId];
  if (!pos) return { book, fill: null };
  const r = sellOut(book, pos, 1, lastClose, costs, { coinId, symbol: pos.symbol, name: pos.name, at, marketUsd: lastClose, kind: 'delist', reason: 'paire retirée de la cotation : soldée à la dernière clôture', tag: 'delist' });
  return { book: r.book, fill: r.fill };
}
