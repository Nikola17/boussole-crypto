import { describe, expect, it } from 'vitest';
import { journalVsBench, paperTestOrder, setupExpectancy, tradeHits } from './tradeCheck';
import { COSTS } from './types';
import type { PaperPortfolio, TradeEntry } from '../../types';
import type { ReliabilityEntry } from './reliability';

const entry = (expectancyR: number, hitPct = 34, episodes = 100): ReliabilityEntry => ({
  label: 'x', bias: 'bull', horizon: 30, days: 100, episodes, frequencyPct: 1, hitPct, hitLow: 30, hitHigh: 38, medianPct: 0, excessMedianPct: 0, worstMedianPct: 0,
  baselineHitPct: 30, baselineMedianPct: 0, control: { episodes: 50, hitPct, medianPct: 0, baselineHitPct: 30 }, verdict: 'validé', expectancyR,
});
const TABLE = { 'plan:Achat@3': entry(0.1), 'plan:Achat fort@3': entry(0.1) };

describe('trading vérifié par le banc d’essai', () => {
  it('espérance d’un setup : positive avec les frais mesurés, négative avec ceux d’une application', () => {
    const ex = setupExpectancy('setup:breakout', COSTS.exchange, 8, TABLE);
    expect(ex.expectancyR).toBeCloseTo(0.1, 6);
    expect(ex.warning).toBeNull();
    const app = setupExpectancy('setup:breakout', COSTS.app, 8, TABLE);
    // frais aller-retour supplémentaires : 2 × (1,5 − 0,15) = 2,7 % du prix, soit 0,3375 R pour un stop à 8 %
    expect(app.expectancyR).toBeCloseTo(0.1 - 0.3375, 6);
    expect(app.warning).toBe('Avec ces frais, ce setup perd en moyenne 0,24 R par trade.');
    expect(setupExpectancy('setup:macd', COSTS.app, 8, TABLE)).toEqual({ expectancyR: null, winPct: null, warning: null });
  });
  it('journal face au banc : R moyen de mes trades clos sur ce setup', () => {
    const t = (id: string, exit: number, setup = 'breakout'): TradeEntry => ({ id, coinId: 'sol', symbol: 'sol', side: 'long', status: 'closed', entryDate: '2026-01-01', entryPrice: 100, quantity: 1, stopLoss: 90, exitPrice: exit, leverage: 1, fees: 0, setup });
    const r = journalVsBench([t('a', 120), t('b', 90), t('c', 130), t('d', 200, 'autre'), { ...t('e', 0), status: 'open' }], 'setup:breakout', TABLE);
    expect(r.mine).toEqual({ n: 3, avgR: (2 - 1 + 3) / 3 });
    expect(r.bench).toBeCloseTo(0.1, 6);
    expect(r.text).toBe('toi : +1,33 R sur 3 trades ; historique : +0,10 R');
  });
  it('« Tester sur papier » : un achat et ses deux ordres attachés dans le portefeuille manuel', () => {
    const manuel: PaperPortfolio = { id: 'manuel', name: 'Papier manuel', kind: 'manual', startingUsd: 1000, costs: { preset: 'exchange', feePct: 0.1, spreadPct: 0.05 }, createdAt: '2026-01-01T00:00:00Z' } as PaperPortfolio;
    const r = paperTestOrder(manuel, [], { coinId: 'solana', symbol: 'sol', name: 'Solana' }, { entry: 100, stop: 90, tp2: 130 }, 50, 100, '2026-11-15T10:00:00.000Z');
    expect(r.error).toBeNull();
    expect(r.trade?.type).toBe('buy');
    expect(r.orders.map((o) => [o.type, o.price])).toEqual([['stop', 90], ['target', 130]]);
  });
  it('serveur : stop ou objectif d’un trade ouvert touché sur les bougies 1 heure', () => {
    const open: TradeEntry = { id: 't1', coinId: 'solana', symbol: 'sol', side: 'long', status: 'open', entryDate: '2026-11-10', entryPrice: 100, quantity: 1, stopLoss: 90, takeProfit: 130, leverage: 1, fees: 0 };
    const bars = [{ time: 1, open: 100, high: 105, low: 95, close: 100, volume: 1 }, { time: 2, open: 100, high: 101, low: 89, close: 92, volume: 1 }];
    expect(tradeHits([open], () => bars)).toEqual([{ trade: open, kind: 'stop', level: 90, key: 'trade:t1:stop' }]);
    expect(tradeHits([open], () => [{ time: 1, open: 120, high: 131, low: 119, close: 125, volume: 1 }])[0].kind).toBe('target');
    expect(tradeHits([{ ...open, status: 'closed' }], () => bars)).toEqual([]);
  });
});
