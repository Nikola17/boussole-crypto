// « Grid Auto Adaptatif (Quotidien) » : simule une grille d'achat/vente automatique sur BTC, ETH et SOL,
// recalibrée dynamiquement autour de la MM20 (±2,5 × ATR14). Achète une tranche quand le prix recule vers la borne
// basse, vend une tranche quand il remonte vers la borne haute — génère des achats/ventes réguliers en marché en range,
// avec coupe-circuit automatique en tendance baissière profonde ou sortie sous la borne basse.

import { atr, last, sma } from '../../indicators';
import type { Intent, Strategy } from '../types';

export type GridAutoParams = {
  coins: string[];
  bandAtrMult: number;
  levels: number;
  maxAllocPerCoinPct: number;
  stepTriggerPct: number;
};

const COIN_META: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: 'btc', name: 'Bitcoin' },
  ethereum: { symbol: 'eth', name: 'Ethereum' },
  solana: { symbol: 'sol', name: 'Solana' },
};

export const gridAuto: Strategy<GridAutoParams> = {
  id: 'grid-auto',
  version: 1,
  label: 'Grid Auto Adaptatif (BTC/ETH/SOL)',
  describe: 'Grille dynamique autour de la MM20 (±2,5 × ATR) sur BTC, ETH et SOL : achète par paliers sur les replis et vend par paliers sur les rebonds ; coupe-circuit automatique sous la grille ou en bear market.',
  defaults: { coins: ['bitcoin', 'ethereum', 'solana'], bandAtrMult: 2.5, levels: 6, maxAllocPerCoinPct: 30, stepTriggerPct: 3.5 },
  uses: ['regime'],
  replayable: true,
  universeTop: 20,
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const out: Intent[] = [];
    const pf = ctx.portfolio;
    const posByCoin = new Map(pf.positions.map((x) => [x.coinId, x]));
    let cash = pf.cashUsd;

    for (const coinId of p.coins) {
      const cs = ctx.candles(coinId);
      if (cs.length < 30) continue;
      const closes = cs.map((c) => c.close);
      const price = closes[closes.length - 1];
      const mid = last(sma(closes, 20)) ?? NaN;
      const a14 = last(atr(cs, 14)) ?? NaN;
      if (!Number.isFinite(mid) || !Number.isFinite(a14) || a14 <= 0 || !(price > 0)) continue;

      const lower = mid - p.bandAtrMult * a14;
      const upper = mid + p.bandAtrMult * a14;
      const stopFloor = lower - a14;
      const meta = COIN_META[coinId] ?? { symbol: coinId.slice(0, 4), name: coinId };
      const pos = posByCoin.get(coinId);
      const curUsd = pos ? pos.quantity * price : 0;

      // Protection krach : sortie totale si clôture sous le plancher ou bear market violent
      if (pos && (price < stopFloor || (ctx.regime?.regime === 'BEAR_TREND' && price < lower))) {
        out.push({ coinId, symbol: pos.symbol, name: pos.name, side: 'sell', fraction: 1, tag: 'grid-stop', reason: 'Sortie basse de grille : protection capital' });
        cash += curUsd;
        continue;
      }

      if (ctx.regime?.regime === 'BEAR_TREND' || ctx.regime?.regime === 'EXTREME_STRESS') continue;

      // Position relative dans la grille : 0 (bas = 100 % investi de la poche) → 1 (haut = 0 % investi)
      const ratio = Math.max(0, Math.min(1, (price - lower) / Math.max(upper - lower, 1e-9)));
      const targetAllocPct = (1 - ratio) * p.maxAllocPerCoinPct;
      const targetUsd = (pf.equityUsd * targetAllocPct) / 100;
      const stepUsd = (pf.equityUsd * (p.maxAllocPerCoinPct / Math.max(2, p.levels))) / 100;
      const diff = targetUsd - curUsd;

      if (diff >= Math.max(10, stepUsd * 0.7) && cash >= 10) {
        const buyUsd = Math.min(diff, cash);
        out.push({
          coinId, symbol: meta.symbol, name: meta.name, side: 'buy',
          orderType: 'limit', limitPrice: price * 0.998, expiresAfterHours: 24,
          sizing: { usd: buyUsd },
          tag: 'grid-buy',
          reason: `Grille ${meta.symbol.toUpperCase()} : repli au palier ${Math.round(ratio * 100)} % (cible ${Math.round(targetAllocPct)} % du capital)`,
        });
        cash -= buyUsd;
      } else if (pos && -diff >= Math.max(10, stepUsd * 0.7) && curUsd > 0) {
        const frac = Math.min(1, (-diff) / curUsd);
        out.push({
          coinId, symbol: pos.symbol, name: pos.name, side: 'sell',
          fraction: frac,
          tag: 'grid-sell',
          reason: `Grille ${pos.symbol.toUpperCase()} : rebond au palier ${Math.round(ratio * 100)} % (prise de profit tranche)`,
        });
      }
    }

    return out;
  },
};
