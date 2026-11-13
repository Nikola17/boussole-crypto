// Portefeuille papier : des ordres fictifs aux prix réels du marché, en USDC, pour tester une stratégie
// sans risquer un euro. Fonctions pures (testées) : l'interface choisit la crypto, la quantité et le prix.

import type { PaperTrade } from '../types';

export interface PaperPosition {
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  /** Coût total des achats encore ouverts (USDC). */
  costUsd: number;
  priceUsd: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface PaperStatus {
  /** USDC non investis disponibles. */
  cashUsd: number;
  investedCostUsd: number;
  valueUsd: number;
  totalUsd: number;
  pnlUsd: number;
  pnlPct: number;
  totalInvestedUsd: number;
  positions: PaperPosition[];
  /** Valeurs sans prix inconnu (jamais 0 affiché pour une ligne non chiffrée). */
  unpriced: number;
}

/**
 * Positions ouvertes du papier : quantités et coûts recalculés depuis les ordres.
 * Ventes : réduisent la quantité et le coût au prorata du prix de vente (pas de plus-value là-dessus,
 * elle est portée par la valorisation des positions restantes et le cash).
 */
export function paperPositions(trades: PaperTrade[], prices: ReadonlyMap<string, number>): { positions: Omit<PaperPosition, 'priceUsd' | 'valueUsd' | 'pnlUsd' | 'pnlPct'>[]; unpriced: number } {
  const agg = new Map<string, { coinId: string; symbol: string; name: string; quantity: number; costUsd: number }>();
  for (const t of trades) {
    const a = agg.get(t.coinId) ?? { coinId: t.coinId, symbol: t.symbol, name: t.name, quantity: 0, costUsd: 0 };
    const fee = t.feeUsd ?? 0;
    if (t.type === 'buy') {
      a.quantity += t.quantity;
      a.costUsd += t.quantity * t.priceUsd + fee;
    } else {
      // Vente : on sort au prorata du coût moyen, le reste part en cash.
      const avgCost = a.quantity > 0 ? a.costUsd / a.quantity : 0;
      const qty = Math.min(t.quantity, a.quantity);
      a.quantity -= qty;
      a.costUsd = Math.max(0, a.costUsd - qty * avgCost);
    }
    if (a.quantity <= 1e-12) { a.quantity = 0; a.costUsd = Math.max(0, a.costUsd); }
    agg.set(t.coinId, a);
  }
  const positions = [...agg.values()].filter((a) => a.quantity > 0);
  const unpriced = positions.filter((p) => prices.get(p.coinId) == null).length;
  return {
    positions: positions.map(({ coinId, symbol, name, quantity, costUsd }) => ({ coinId, symbol, name, quantity, costUsd })),
    unpriced,
  };
}

/** Bilan du portefeuille papier : cash, positions valorisées aux prix réels du moment, P&L. */
export function paperStatus(startingUsd: number, trades: PaperTrade[], prices: ReadonlyMap<string, number>): PaperStatus {
  let cash = startingUsd;
  for (const t of trades) {
    const fee = t.feeUsd ?? 0;
    if (t.type === 'buy') cash -= t.quantity * t.priceUsd + fee;
    else cash += t.quantity * t.priceUsd - fee;
  }
  const base = paperPositions(trades, prices);
  const positions: PaperPosition[] = base.positions.map((p) => {
    const price = prices.get(p.coinId);
    const value = price != null ? p.quantity * price : null;
    return { ...p, priceUsd: price ?? null, valueUsd: value, pnlUsd: value != null ? value - p.costUsd : null, pnlPct: value != null && p.costUsd > 0 ? ((value / p.costUsd) - 1) * 100 : null };
  });
  positions.sort((a, b) => (b.valueUsd ?? b.costUsd) - (a.valueUsd ?? a.costUsd));
  const investedCostUsd = positions.reduce((s, p) => s + p.costUsd, 0);
  const valueUsd = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const totalUsd = cash + valueUsd;
  const totalInvestedUsd = trades.filter((t) => t.type === 'buy').reduce((s, t) => s + t.quantity * t.priceUsd + (t.feeUsd ?? 0), 0);
  return {
    cashUsd: cash,
    investedCostUsd,
    valueUsd,
    totalUsd,
    pnlUsd: totalUsd - startingUsd,
    pnlPct: startingUsd > 0 ? ((totalUsd / startingUsd) - 1) * 100 : 0,
    totalInvestedUsd,
    positions,
    unpriced: base.unpriced,
  };
}

export interface PaperCheck { ok: boolean; why?: string }

/** Un ordre d'achat n'achète que du cash disponible ; une vente ne vend que des quantités détenues. */
export function checkPaperOrder(side: 'buy' | 'sell', quantity: number, priceUsd: number, status: PaperStatus, ownedQty = 0): PaperCheck {
  if (!(quantity > 0) || !Number.isFinite(quantity)) return { ok: false, why: 'Quantité invalide.' };
  if (!(priceUsd > 0) || !Number.isFinite(priceUsd)) return { ok: false, why: 'Prix inconnu pour cette crypto.' };
  if (side === 'buy') {
    const cost = quantity * priceUsd;
    if (cost > status.cashUsd + 1e-8) return { ok: false, why: `Il ne te reste que ${Math.max(0, status.cashUsd).toFixed(2)} USDC de cash papier.` };
    return { ok: true };
  }
  if (quantity > ownedQty + 1e-8) return { ok: false, why: 'Tu ne détiens pas autant de cette crypto sur le papier.' };
  return { ok: true };
}

/**
 * Comparaison avec le socle : le même plan appliqué à Bitcoin seul (achats du même montant, aux prix BTC des
 * mêmes dates). Répond à « ce papier t'a rapporté X % ; le même montant en Bitcoin t'aurait fait Y % ».
 * `btcPricesByDay` (AAAA-MM-JJ → prix USD) vient de l'historique BTC déjà chargé par l'application.
 * Une seule date sans prix : la comparaison n'affirme rien (null), jamais un chiffre inventé.
 */
export function btcBenchmark(trades: PaperTrade[], btcPricesByDay: ReadonlyMap<string, number>, btcPriceNow: number | null): { investedUsd: number; nowUsd: number; pct: number } | null {
  const buys = trades.filter((t) => t.type === 'buy');
  if (!buys.length || btcPriceNow == null) return null;
  let btcQty = 0;
  let investedUsd = 0;
  for (const b of buys) {
    const p = btcPricesByDay.get(b.date);
    if (p == null || !(p > 0)) return null;
    const amount = Math.max(0, b.quantity * b.priceUsd - (b.feeUsd ?? 0));
    btcQty += amount / p;
    investedUsd += amount;
  }
  if (!(investedUsd > 0)) return null;
  const nowUsd = btcQty * btcPriceNow;
  return { investedUsd, nowUsd, pct: ((nowUsd / investedUsd) - 1) * 100 };
}
