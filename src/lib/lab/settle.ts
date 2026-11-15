// Règlement des ordres en attente d'un portefeuille papier manuel (limite, stop, objectif) sur les bougies 1 heure
// closes, dans l'ordre du temps. Identifiants déterministes (`fill:<ordre>`) : deux appareils qui règlent le même
// ordre produisent la même exécution, et la synchronisation ne crée pas de doublon.

import type { Candle } from '../indicators';
import type { PaperOrder, PaperPortfolio, PaperTrade } from '../../types';
import { applyIntent, pendingHit } from './fills';
import { bookOf, ORDER_LIFETIME_DAYS } from './paperBook';

export const NO_HOURLY_TEXT = 'Ordres limites et stops : seulement pour les cryptos cotées sur Binance, faute de bougies horaires.';

const HOUR = 3600_000;
const ceilHour = (ms: number) => Math.ceil(ms / HOUR) * HOUR;

export interface SettleInput { portfolio: PaperPortfolio; orders: PaperOrder[]; trades: PaperTrade[]; hourly: Map<string, Candle[]>; nowMs: number }

/** Exécutions nouvelles et ordres modifiés (exécutés, annulés, expirés, ou créés par un achat limite). */
export function settleOrders({ portfolio, orders, trades, hourly, nowMs }: SettleInput): { trades: PaperTrade[]; orders: PaperOrder[] } {
  const costs = { feePct: portfolio.costs.feePct, spreadPct: portfolio.costs.spreadPct };
  const open = new Map(orders.filter((o) => o.portfolioId === portfolio.id && o.status === 'open').map((o) => [o.id, { ...o }]));
  const known = new Set(trades.map((t) => t.id));
  const changed = new Map<string, PaperOrder>();
  const newTrades: PaperTrade[] = [];
  const allTrades = () => [...trades, ...newTrades];

  // Bougies closes de toutes les cryptos concernées, dans l'ordre du temps.
  const coins = new Set([...open.values()].map((o) => o.coinId));
  const bars = [...hourly.entries()].filter(([c]) => coins.has(c))
    .flatMap(([coinId, cs]) => cs.filter((c) => c.time * 1000 + HOUR <= nowMs).map((c) => ({ coinId, c })))
    .sort((a, b) => a.c.time - b.c.time || a.coinId.localeCompare(b.coinId));

  const close = (o: PaperOrder, status: PaperOrder['status'], at?: string) => {
    open.delete(o.id);
    changed.set(o.id, { ...o, status, ...(at ? { filledAt: at } : {}) });
  };

  for (const { coinId, c } of bars) {
    const startMs = c.time * 1000;
    const at = new Date(startMs).toISOString();
    for (const o of [...open.values()].filter((x) => x.coinId === coinId).sort((a, b) => (a.type === 'stop' ? -1 : b.type === 'stop' ? 1 : 0) || a.id.localeCompare(b.id))) {
      if (!open.has(o.id) || startMs < ceilHour(Date.parse(o.createdAt))) continue;
      if (startMs >= Date.parse(o.expiresAt)) { close(o, 'expired'); continue; }
      const kind = o.side === 'buy' ? 'limitBuy' : o.type === 'stop' ? 'stop' : 'target';
      const hit = pendingHit(kind, o.price, c);
      if (hit == null) continue;
      const id = `fill:${o.id}`;
      if (known.has(id)) { close(o, 'filled', at); continue; }
      const book = bookOf(portfolio, allTrades());
      let r;
      if (o.side === 'buy') {
        r = applyIntent(book, { coinId, symbol: o.symbol, name: o.name, side: 'buy', sizing: { usd: o.usd ?? (o.quantity ?? 0) * o.price }, reason: 'Ordre limite' }, hit, costs, { at, day: at.slice(0, 10), minOrderUsd: 1 });
      } else {
        const held = book.positions[coinId]?.quantity ?? 0;
        if (!(held > 0)) { close(o, 'cancelled'); continue; }
        r = applyIntent(book, { coinId, symbol: o.symbol, name: o.name, side: 'sell', fraction: o.quantity != null ? Math.min(1, o.quantity / held) : 1, reason: o.type === 'stop' ? 'Stop touché' : 'Objectif atteint' }, hit, costs, { at, day: at.slice(0, 10), minOrderUsd: 0 });
      }
      if (!r.fill) { close(o, 'cancelled'); continue; }
      newTrades.push({
        id, coinId, symbol: o.symbol, name: o.name, date: at.slice(0, 10), time: at, type: o.side, quantity: r.fill.quantity,
        priceUsd: r.fill.priceUsd, feeUsd: r.fill.feeUsd, portfolioId: portfolio.id, orderType: o.type, orderId: o.id, marketUsd: hit, reason: r.fill.reason,
      });
      known.add(id);
      close(o, 'filled', at);
      if (o.ocoGroup) for (const x of [...open.values()]) if (x.ocoGroup === o.ocoGroup) close(x, 'cancelled');
      if (o.side === 'buy' && (o.attachStop != null || o.attachTarget != null)) {
        const createdAt = new Date(startMs + HOUR).toISOString();
        const expiresAt = new Date(startMs + HOUR + ORDER_LIFETIME_DAYS * 86400_000).toISOString();
        const base = { portfolioId: portfolio.id, coinId, symbol: o.symbol, name: o.name, side: 'sell' as const, ocoGroup: id, createdAt, expiresAt, status: 'open' as const };
        const attached: PaperOrder[] = [];
        if (o.attachStop != null) attached.push({ ...base, id: `${o.id}:stop`, type: 'stop', price: o.attachStop });
        if (o.attachTarget != null) attached.push({ ...base, id: `${o.id}:target`, type: 'target', price: o.attachTarget });
        for (const a of attached) { open.set(a.id, a); changed.set(a.id, a); }
      }
    }
  }
  // Ordres arrivés à échéance sans bougie à relire.
  for (const o of [...open.values()]) if (Date.parse(o.expiresAt) <= nowMs) close(o, 'expired');
  return { trades: newTrades, orders: [...changed.values()] };
}
