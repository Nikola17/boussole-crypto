import { describe, expect, it } from 'vitest';
import { STRATEGIES, rulesFingerprint } from './index';
import type { Position, StrategyContext } from '../types';

/** Contexte minimal : jour d'exécution 2026-11-17 (mardi), température et dernier allègement réglables. */
function ctx(over: { temperature?: number | null; execDay?: string; lastTrim?: string | null; positions?: Position[]; cash?: number } = {}): StrategyContext {
  const execDay = over.execDay ?? '2026-11-17';
  const dow = ((new Date(`${execDay}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return {
    decidedOn: '2026-11-16', execDay, scheduled: (d) => d.includes(dow), universe: [], candles: () => [],
    temperature: over.temperature === undefined ? 50 : over.temperature, btcAboveSma200: null,
    portfolio: { cashUsd: over.cash ?? 1000, equityUsd: 1000, peakEquityUsd: 1000, minSincePeakUsd: 1000, positions: over.positions ?? [], lastFillOn: (tag) => (tag === 'trim' ? over.lastTrim ?? null : null) },
  };
}
const pos = (coinId: string): Position => ({ coinId, symbol: coinId.slice(0, 3), name: coinId, quantity: 2, costUsd: 100, openedOn: '2026-01-01' });

describe('stratégies de la version 1', () => {
  const dca = STRATEGIES['dca-btc'];
  const inv = STRATEGIES.investisseur;
  it('apports : 25 les mardis et vendredis, 0 sinon', () => {
    expect(dca.deposit(ctx(), dca.defaults)).toBe(25);
    expect(dca.deposit(ctx({ execDay: '2026-11-20' }), dca.defaults)).toBe(25);
    expect(dca.deposit(ctx({ execDay: '2026-11-18' }), dca.defaults)).toBe(0);
  });
  it('DCA Bitcoin simple : un achat de Bitcoin pour le montant', () => {
    const o = dca.decide(ctx(), dca.defaults);
    expect(o).toEqual([expect.objectContaining({ coinId: 'bitcoin', side: 'buy', sizing: { usd: 25 }, reason: 'Échéance : Bitcoin, sans modulation' })]);
    expect(dca.decide(ctx({ execDay: '2026-11-18' }), dca.defaults)).toEqual([]);
  });
  it('Investisseur : échéance modulée par la température, 75 / 25', () => {
    const o = inv.decide(ctx({ temperature: 15 }), inv.defaults);
    expect(o.map((x) => [x.coinId, x.sizing])).toEqual([['bitcoin', { usd: 37.5 }], ['ethereum', { usd: 12.5 }]]);
    expect(o[0].reason).toBe('Température 15/100 : échéance ×2');
    const unknown = inv.decide(ctx({ temperature: null }), inv.defaults);
    expect(unknown[0].sizing).toEqual({ usd: 18.75 });
    expect(unknown[0].reason).toBe('Température indisponible : échéance ×1');
    expect(inv.decide(ctx({ temperature: 15, cash: 20 }), inv.defaults).map((x) => x.sizing)).toEqual([{ usd: 15 }, { usd: 5 }]);
  });
  it('Investisseur : table de multiplicateurs réglable (variantes du banc d’essai)', () => {
    expect(inv.decide(ctx({ temperature: 15 }), { ...inv.defaults, multTable: 'pentue' })[0].reason).toBe('Température 15/100 : échéance ×3');
    expect(inv.decide(ctx({ temperature: 90 }), { ...inv.defaults, multTable: 'pentue' }).filter((x) => x.side === 'buy').every((x) => (x.sizing as { usd: number }).usd === 0)).toBe(true);
  });
  it('DCA Boussole au banc d’essai : règle « capitalisation » pondérée par le volume, « btc » sur Bitcoin seul', () => {
    const boussole = STRATEGIES['dca-boussole'];
    const candles = (vol: number) => Array.from({ length: 40 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 10, high: 10.1, low: 9.9, close: 10, volume: vol }));
    const vols: Record<string, number> = { bitcoin: 600, ethereum: 300, solana: 100 };
    const c = { ...ctx(), universe: Object.keys(vols).map((id, i) => ({ coinId: id, symbol: id.slice(0, 3), name: id, rank: i + 1, available: true })), candles: (id: string) => candles(vols[id] ?? 0) };
    const cap = boussole.decide(c, { ...boussole.defaults, amountUsd: 100, baseMode: 'cap', minOrderUsd: 1 });
    expect(Object.fromEntries(cap.map((x) => [x.coinId, (x.sizing as { usd: number }).usd]))).toEqual({ bitcoin: 60, ethereum: 30, solana: 10 });
    const btc = boussole.decide(c, { ...boussole.defaults, amountUsd: 100, baseMode: 'btc' });
    expect(btc.map((x) => x.coinId)).toEqual(['bitcoin']);
  });
  it('Investisseur : une tranche de 7,5 % en euphorie, 30 jours entre deux', () => {
    const positions = [pos('bitcoin'), pos('ethereum')];
    const trims = inv.decide(ctx({ temperature: 83, execDay: '2026-11-18', lastTrim: '2026-10-18', positions }), inv.defaults);
    expect(trims).toEqual([
      expect.objectContaining({ coinId: 'bitcoin', side: 'sell', fraction: 0.075, tag: 'trim', reason: 'Euphorie (83/100) : une tranche de 7,5 %' }),
      expect.objectContaining({ coinId: 'ethereum', side: 'sell', fraction: 0.075, tag: 'trim' }),
    ]);
    expect(inv.decide(ctx({ temperature: 83, execDay: '2026-11-18', lastTrim: '2026-11-08', positions }), inv.defaults)).toEqual([]);
  });
  it('empreinte des règles', () => {
    expect(rulesFingerprint(inv)).toBe('investisseur@1+cycle1');
    expect(rulesFingerprint(dca)).toBe('dca-btc@1');
  });
});
