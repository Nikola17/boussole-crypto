// Portefeuille papier manuel : état (cash, positions) recalculé depuis ses ordres, ticket d'ordre au marché avec
// frais et écart réalistes, et « les mêmes ordres avec d'autres frais » (est-ce copiable là où j'achète ?).

import type { CoinRef, PaperOrder, PaperPortfolio, PaperTrade } from '../../types';
import { uid } from '../format';
import { applyIntent } from './fills';
import { COSTS, type Book, type CostModel, type Intent } from './types';

export const COST_PRESETS: Record<'exchange' | 'app', CostModel> = { exchange: { ...COSTS.exchange }, app: { ...COSTS.app } };
export const ORDER_LIFETIME_DAYS = 90;

/** « Mes frais mesurés » : l'écart médian de la carte Frais réels, à partir de 5 achats mesurés, borné entre 0,05 et 5 %. */
export function measuredPreset(spreadMedianPct: number | null, samples: number): CostModel | null {
  if (spreadMedianPct == null || !Number.isFinite(spreadMedianPct) || samples < 5) return null;
  return { feePct: 0, spreadPct: Math.min(5, Math.max(0.05, Math.round(spreadMedianPct * 100) / 100)) };
}

export const tradesOf = (trades: PaperTrade[], portfolioId: string): PaperTrade[] => trades.filter((t) => !t.ghost && t.portfolioId === portfolioId);

const timeOf = (t: PaperTrade) => t.time ?? t.date;

/** Cash et positions d'un portefeuille manuel, rejoués dans l'ordre du temps (coût moyen pour les ventes partielles). */
export function bookOf(portfolio: PaperPortfolio, trades: PaperTrade[]): Book {
  let cash = portfolio.startingUsd;
  const positions: Book['positions'] = {};
  for (const t of [...trades].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))) {
    const fee = t.feeUsd ?? 0;
    const p = positions[t.coinId];
    if (t.type === 'buy') {
      cash -= t.quantity * t.priceUsd + fee;
      positions[t.coinId] = { coinId: t.coinId, symbol: t.symbol, name: t.name, quantity: (p?.quantity ?? 0) + t.quantity, costUsd: (p?.costUsd ?? 0) + t.quantity * t.priceUsd + fee, openedOn: p?.openedOn ?? t.date };
    } else {
      cash += t.quantity * t.priceUsd - fee;
      if (!p) continue;
      const left = Math.round((p.quantity - t.quantity) * 1e8) / 1e8;
      if (left > 0) positions[t.coinId] = { ...p, quantity: left, costUsd: p.costUsd * (left / p.quantity) };
      else delete positions[t.coinId];
    }
  }
  return { cashUsd: cash, positions };
}

export interface TicketInput { coin: CoinRef; side: 'buy' | 'sell'; usd?: number; quantity?: number; stop?: number; target?: number }

/** Ordre au marché : l'exécution (PaperTrade) et, pour un achat, ses ordres stop et objectif liés. */
export function marketOrder(portfolio: PaperPortfolio, trades: PaperTrade[], input: TicketInput, marketUsd: number, nowIso: string): { trade: PaperTrade | null; orders: PaperOrder[]; error: string | null } {
  const fail = (error: string) => ({ trade: null, orders: [], error });
  if (!(marketUsd > 0)) return fail('Prix inconnu pour cette crypto.');
  const costs = { feePct: portfolio.costs.feePct, spreadPct: portfolio.costs.spreadPct };
  const book = bookOf(portfolio, trades);
  const { coinId, symbol, name } = input.coin;
  let intent: Intent;
  if (input.side === 'buy') {
    const usd = input.usd ?? (input.quantity != null ? (input.quantity * marketUsd * (1 + costs.spreadPct / 100)) / (1 - costs.feePct / 100) : 0);
    if (!(usd > 0)) return fail('Montant ou quantité invalide.');
    if (usd > book.cashUsd + 1e-8) return fail(`Il ne te reste que ${Math.max(0, book.cashUsd).toFixed(2)} USDC de cash papier.`);
    if (input.stop != null && input.stop >= marketUsd) return fail('Le stop doit être sous le prix du marché.');
    if (input.target != null && input.target <= marketUsd) return fail('L’objectif doit être au-dessus du prix du marché.');
    intent = { coinId, symbol, name, side: 'buy', sizing: { usd }, reason: 'Ordre manuel' };
  } else {
    const held = book.positions[coinId]?.quantity ?? 0;
    const q = input.quantity ?? held;
    if (!(q > 0)) return fail('Quantité invalide.');
    if (q > held + 1e-8) return fail('Tu ne détiens pas autant de cette crypto sur ce portefeuille.');
    intent = { coinId, symbol, name, side: 'sell', fraction: Math.min(1, q / held), reason: 'Ordre manuel' };
  }
  const r = applyIntent(book, intent, marketUsd, costs, { at: nowIso, day: nowIso.slice(0, 10), minOrderUsd: 1 });
  if (!r.fill) return fail(r.skip === 'montant trop petit' ? 'Montant trop petit (1 USDC au minimum).' : `Ordre impossible : ${r.skip ?? 'raison inconnue'}.`);
  const trade: PaperTrade = {
    id: uid(), coinId, symbol, name, date: nowIso.slice(0, 10), time: nowIso, type: input.side, quantity: r.fill.quantity,
    priceUsd: r.fill.priceUsd, feeUsd: r.fill.feeUsd, portfolioId: portfolio.id, orderType: 'market', marketUsd, reason: 'Ordre manuel',
  };
  const orders: PaperOrder[] = [];
  if (input.side === 'buy' && (input.stop != null || input.target != null)) {
    const group = trade.id;
    const expiresAt = new Date(Date.parse(nowIso) + ORDER_LIFETIME_DAYS * 86400_000).toISOString();
    const base = { portfolioId: portfolio.id, coinId, symbol, name, side: 'sell' as const, ocoGroup: group, createdAt: nowIso, expiresAt, status: 'open' as const };
    if (input.stop != null) orders.push({ ...base, id: uid(), type: 'stop', price: input.stop });
    if (input.target != null) orders.push({ ...base, id: uid(), type: 'target', price: input.target });
  }
  return { trade, orders, error: null };
}

/**
 * Valeur finale des mêmes ordres avec d'autres frais : un achat dépense le même montant (quantité × marché),
 * une vente cède la même part de la position. Les positions restantes sont valorisées à `lastPrices` (sinon au dernier prix vu).
 */
export function repriceWithCosts(fills: { coinId: string; side: 'buy' | 'sell'; quantity: number; marketUsd: number }[], startingUsd: number, costs: CostModel, lastPrices: Map<string, number>): number {
  const s = costs.spreadPct / 100;
  const f = costs.feePct / 100;
  let cash = startingUsd;
  const held = new Map<string, { orig: number; now: number; last: number }>();
  for (const x of fills) {
    const h = held.get(x.coinId) ?? { orig: 0, now: 0, last: x.marketUsd };
    h.last = x.marketUsd;
    if (x.side === 'buy') {
      const amount = x.quantity * x.marketUsd;
      cash -= amount;
      h.orig += x.quantity;
      h.now += (amount * (1 - f)) / (x.marketUsd * (1 + s));
    } else if (h.orig > 0) {
      const fraction = Math.min(1, x.quantity / h.orig);
      const sold = h.now * fraction;
      cash += sold * x.marketUsd * (1 - s) * (1 - f);
      h.now -= sold;
      h.orig -= Math.min(h.orig, x.quantity);
    }
    held.set(x.coinId, h);
  }
  let value = cash;
  for (const [coinId, h] of held) value += h.now * (lastPrices.get(coinId) ?? h.last);
  return value;
}
