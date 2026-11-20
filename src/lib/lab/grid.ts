// Backtest d'un bot grid (grille d'achat/vente) sur une série de prix — fonction pure, testée.
// Grille classique : [lower, upper], N lignes ; chaque ligne échange un montant fixe (amount/N).
// Départ 50 % cash / 50 % actif au premier prix. À la hausse on vend une tranche à chaque ligne franchie,
// à la baisse on rachète une tranche. Hors de la grille : on ne fait plus rien.

export interface GridParams {
  amountUsd: number;
  lower: number;
  upper: number;
  grids: number;
  /** Frais par transaction en % (ex. 0,075 pour maker Binance VIP 0 avec BNB ; 0 par défaut). */
  feePct?: number;
  /** Écart de prix (spread/slippage) par côté en % (0 pour des ordres limites maker). */
  spreadPct?: number;
}

export interface GridResult {
  trades: number;
  endValueUsd: number;
  pnlUsd: number;
  pnlPct: number;
  /** Total des frais prélevés sur l'entrée initiale et les allers-retours de la grille (USD). */
  feesUsd: number;
  /** Performance du « garder » (buy & hold) sur la même période, aux mêmes frais d'entrée, en %. */
  hodlPct: number;
  /** Écart grid − HODL, en points de % (négatif = le grid a sous-performé). */
  vsHodlPts: number;
  inRange: boolean;
}

export function gridBacktest(prices: number[], p: GridParams): GridResult {
  const amount = p.amountUsd;
  if (!(amount > 0) || prices.length < 2 || !(p.upper > p.lower) || !(p.grids >= 1)) {
    return { trades: 0, endValueUsd: amount, pnlUsd: 0, pnlPct: 0, feesUsd: 0, hodlPct: 0, vsHodlPts: 0, inRange: false };
  }
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (!(first > 0) || !(last > 0)) return { trades: 0, endValueUsd: amount, pnlUsd: 0, pnlPct: 0, feesUsd: 0, hodlPct: 0, vsHodlPts: 0, inRange: false };

  const f = Math.max(0, p.feePct ?? 0) / 100;
  const s = Math.max(0, p.spreadPct ?? 0) / 100;
  const step = (p.upper - p.lower) / p.grids;
  const tranche = amount / p.grids;
  let cash = amount / 2;
  const initBuyUsd = amount - cash;
  const initFee = initBuyUsd * f;
  let asset = (initBuyUsd - initFee) / (first * (1 + s));
  let feesUsd = initFee;
  let trades = 0;

  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const price = prices[i];
    if (!(prev > 0) || !(price > 0)) continue;
    if (price > prev) {
      // lignes franchies à la hausse : vendre une tranche par ligne (la première ligne franchie est au moins `lower`)
      let line = (Math.floor((prev - p.lower) / step) + 1) * step + p.lower; // première ligne strictement au-dessus du prix précédent
      while (line <= price && line <= p.upper && line >= p.lower) {
        const execPrice = line * (1 - s);
        const spendable = Math.min(tranche, asset * execPrice);
        if (spendable >= tranche * 0.5 && execPrice > 0) {
          const fee = spendable * f;
          cash += spendable - fee;
          asset -= spendable / execPrice;
          feesUsd += fee;
          trades++;
        }
        line += step;
      }
    } else if (price < prev) {
      // lignes franchies à la baisse : acheter une tranche par ligne (la première ligne franchie est au plus `upper`)
      let line = Math.min(p.upper, (Math.ceil((prev - p.lower) / step) - 1) * step + p.lower);
      while (line >= price && line >= p.lower && line <= p.upper) {
        const execPrice = line * (1 + s);
        const usable = Math.min(tranche, cash);
        if (usable >= tranche * 0.5 && execPrice > 0) {
          const fee = usable * f;
          asset += (usable - fee) / execPrice;
          cash -= usable;
          feesUsd += fee;
          trades++;
        }
        line -= step;
      }
    }
  }

  const endValueUsd = cash + asset * last;
  const hodlEndUsd = ((amount * (1 - f)) / (first * (1 + s))) * last;
  const hodlPct = ((hodlEndUsd / amount) - 1) * 100;
  const pnlPct = ((endValueUsd / amount) - 1) * 100;
  return {
    trades,
    endValueUsd,
    pnlUsd: endValueUsd - amount,
    pnlPct,
    feesUsd,
    hodlPct,
    vsHodlPts: pnlPct - hodlPct,
    inRange: first >= p.lower && first <= p.upper && last >= p.lower && last <= p.upper,
  };
}
