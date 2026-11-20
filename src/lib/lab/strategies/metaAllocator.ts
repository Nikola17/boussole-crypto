// « Méta-Allocateur All-Weather (Chef d'Orchestre) » : la stratégie maître à copier en priorité.
// Adapte automatiquement son moteur interne au régime de marché détecté chaque jour :
//   - BULL_TREND     : 60 % Rotation Momentum Leaders + 40 % Cassures Donchian avec Trailing Stop
//   - RANGE_CHOP     : 55 % Retour à la moyenne (limites maker) + 45 % Arbitrage Statistique Paires
//   - BEAR_TREND     : Protection maximale — coupe les positions directionnelles (Cash USDC refuge),
//                      ne conserve que l'Arbitrage Statistique si signal extrême (max 25 % du capital)
//   - EXTREME_STRESS : Coupe-circuit défensif (allègement 50 % et aucun nouvel achat agressif).

import type { Intent, Strategy } from '../types';
import { meanReversion } from './meanReversion';
import { pairsArb } from './pairsArb';
import { rotationMomentum } from './rotationMomentum';
import { trendDonchian } from './trendDonchian';

export type MetaAllocatorParams = {
  bullMomentumShare: number;
  rangeMrShare: number;
  bearMaxExposurePct: number;
  stressTrimFraction: number;
};

function scaleIntent(intent: Intent, factor: number, tagPrefix: string): Intent {
  if (intent.side === 'sell') return { ...intent, tag: `${tagPrefix}:${intent.tag ?? 'sell'}` };
  const sz = intent.sizing;
  if (!sz) return { ...intent, tag: `${tagPrefix}:${intent.tag ?? 'buy'}` };
  const scaled = 'usd' in sz
    ? { usd: Math.round(sz.usd * factor * 100) / 100 }
    : 'targetVolPct' in sz
      ? { ...sz, targetVolPct: sz.targetVolPct * factor, maxUsd: sz.maxUsd * factor }
      : { riskUsd: sz.riskUsd * factor, maxUsd: sz.maxUsd * factor };
  return { ...intent, sizing: scaled, tag: `${tagPrefix}:${intent.tag ?? 'buy'}`, reason: `[All-Weather] ${intent.reason}` };
}

export const metaAllocator: Strategy<MetaAllocatorParams> = {
  id: 'meta-allocator',
  version: 1,
  label: 'Méta-Allocateur All-Weather',
  describe: 'Chef d’orchestre adaptatif au régime : Rotation Momentum + Donchian en marché haussier, Retour à la moyenne + Arbitrage Paires en range, passage automatique en USDC refuge en bear market et allègement en stress extrême.',
  defaults: { bullMomentumShare: 0.6, rangeMrShare: 0.55, bearMaxExposurePct: 25, stressTrimFraction: 0.5 },
  uses: ['regime'],
  replayable: true,
  universeTop: 150,
  riskOverlay: { maxHeatPct: 5, maxHighCorrPositions: 3, drawdownScaling: true },
  kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    const regime = ctx.regime?.regime ?? 'RANGE_CHOP';
    const out: Intent[] = [];
    const seen = new Set<string>();
    const pushUnique = (list: Intent[]) => {
      for (const item of list) {
        const key = `${item.side}|${item.coinId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    };

    // 1. EXTREME_STRESS : allègement défensif immédiat de 50 % des positions ouvertes, aucun nouvel achat
    if (regime === 'EXTREME_STRESS') {
      const lastTrim = ctx.portfolio.lastFillOn('meta:stress-trim');
      if (lastTrim !== ctx.execDay) {
        for (const pos of ctx.portfolio.positions) {
          out.push({
            coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell',
            fraction: p.stressTrimFraction, tag: 'meta:stress-trim',
            reason: '[All-Weather] Stress extrême détecté : allègement défensif',
          });
        }
      }
      return out;
    }

    // 2. BEAR_TREND : sortie de toutes les positions directionnelles, seul pairs-arb-stat limité à 25 % reste actif
    if (regime === 'BEAR_TREND') {
      const pairIntents = pairsArb.decide(ctx, { ...pairsArb.defaults, allocPerPairPct: Math.min(12, p.bearMaxExposurePct / 2) });
      const pairBuys = new Set(pairIntents.filter((x) => x.side === 'buy').map((x) => x.coinId));
      for (const pos of ctx.portfolio.positions) {
        if (!pairBuys.has(pos.coinId)) {
          out.push({
            coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: 'sell',
            fraction: 1, tag: 'meta:bear-cash',
            reason: '[All-Weather] Marché baissier BTC : bascule en USDC refuge',
          });
          seen.add(`sell|${pos.coinId}`);
        }
      }
      pushUnique(pairIntents.map((x) => scaleIntent(x, 0.7, 'meta-pair')));
      return out;
    }

    // 3. BULL_TREND : combine Rotation Momentum (poche principale) + Trend Donchian Trailing
    if (regime === 'BULL_TREND') {
      const mom = rotationMomentum.decide(ctx, rotationMomentum.defaults).map((x) => scaleIntent(x, p.bullMomentumShare, 'meta-mom'));
      const don = trendDonchian.decide(ctx, trendDonchian.defaults).map((x) => scaleIntent(x, 1 - p.bullMomentumShare, 'meta-don'));
      pushUnique([...mom, ...don]);
      return out;
    }

    // 4. RANGE_CHOP : combine Retour à la moyenne (limites maker) + Arbitrage Statistique Paires
    const mr = meanReversion.decide(ctx, meanReversion.defaults).map((x) => scaleIntent(x, p.rangeMrShare, 'meta-mr'));
    const pr = pairsArb.decide(ctx, pairsArb.defaults).map((x) => scaleIntent(x, 1 - p.rangeMrShare, 'meta-pair'));
    pushUnique([...mr, ...pr]);
    return out;
  },
};
