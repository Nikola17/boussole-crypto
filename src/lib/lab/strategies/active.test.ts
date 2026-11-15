// Stratégies « Trader » et « DCA Boussole » : décisions sur bougies closes, garde-fous.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../signals';
import { trader } from './trader';
import { dcaBoussole } from './dcaBoussole';
import type { Candle } from '../../indicators';
import type { Position, StrategyContext, UniverseEntry } from '../types';

const D = 86400;
const T0 = Date.UTC(2025, 0, 1) / 1000;
/** Tendance haussière régulière, puis une cassure des plus hauts 20 jours avec un volume triple. */
function breakout(n = 300): Candle[] {
  const cs = Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 0.4 + Math.sin(i / 3) * 1.5;
    return { time: T0 + i * D, open: close * 0.997, high: close * 1.01, low: close * 0.99, close, volume: 1000 };
  });
  const last = cs[n - 1];
  cs[n - 1] = { ...last, close: last.close * 1.08, high: last.close * 1.09, volume: 3000 };
  return cs;
}
/** Chute régulière qui enfonce ses plus bas avec du volume. */
function crash(n = 300): Candle[] {
  const cs = Array.from({ length: n }, (_, i) => {
    const close = 300 - i * 0.6 + Math.sin(i / 3) * 1.5;
    return { time: T0 + i * D, open: close * 1.003, high: close * 1.01, low: close * 0.99, close, volume: 1000 };
  });
  const last = cs[n - 1];
  cs[n - 1] = { ...last, close: last.close * 0.9, low: last.close * 0.89, volume: 3000 };
  return cs;
}
const series: Record<string, Candle[]> = { sol: breakout(), down: crash(), bitcoin: breakout() };
const entry = (coinId: string, rank: number): UniverseEntry => ({ coinId, symbol: coinId, name: coinId, rank, available: null });
const pos = (coinId: string, openedOn: string): Position => ({ coinId, symbol: coinId, name: coinId, quantity: 1, costUsd: 100, openedOn });

function ctx(over: { equity?: number; peak?: number; min?: number; btcUp?: boolean | null; positions?: Position[]; lastStop?: string | null; execDay?: string; cash?: number } = {}): StrategyContext {
  const execDay = over.execDay ?? '2025-10-28';
  return {
    decidedOn: '2025-10-27', execDay, scheduled: (d) => d.includes(((new Date(`${execDay}T00:00:00Z`).getUTCDay() + 6) % 7) + 1),
    universe: [entry('sol', 5), entry('down', 9)], candles: (id) => series[id] ?? [], temperature: 50, btcAboveSma200: over.btcUp === undefined ? true : over.btcUp,
    portfolio: { cashUsd: over.cash ?? 1000, equityUsd: over.equity ?? 1000, peakEquityUsd: over.peak ?? 1000, minSincePeakUsd: over.min ?? over.equity ?? 1000, positions: over.positions ?? [], lastFillOn: (tag, coinId) => (tag === 'stop' && coinId === 'sol' ? over.lastStop ?? null : null) },
  };
}
const P = { ...trader.defaults, setups: ['breakout'] };

describe('stratégie Trader', () => {
  it('les séries de test produisent bien les signaux attendus', () => {
    const a = analyze(series.sol, { temperature: 50 }, { closedOnly: true })!;
    expect(a.trader.tone).toBe('up');
    expect(a.setups.map((s) => s.key)).toContain('breakout');
    expect(analyze(series.down, { temperature: 50 }, { closedOnly: true })!.trader.tone).not.toBe('up');
  });
  it('entre seulement sur un setup listé avec un signal haussier, taille plafonnée', () => {
    const o = trader.decide(ctx(), P);
    expect(o).toHaveLength(1);
    const a = analyze(series.sol, { temperature: 50 }, { closedOnly: true })!;
    const c = series.sol[series.sol.length - 1].close;
    expect(o[0]).toMatchObject({ coinId: 'sol', side: 'buy', stop: a.plan!.stop, targetR: 3, stopOnClose: true, sizing: { riskUsd: 10, maxUsd: 200 }, tag: 'setup:breakout' });
    expect(o[0].skipAbove).toBeCloseTo(c * 1.03, 9);
    expect(o[0].skipBelow).toBe(a.plan!.stop);
    expect(o[0].reason).toContain('Cassure avec volume');
    expect(trader.decide(ctx(), { ...P, setups: [] })).toEqual([]);
    expect(trader.decide(ctx({ cash: 50 }), P)[0].sizing).toEqual({ riskUsd: 10, maxUsd: 50 });
  });
  it('filtre de régime facultatif, désactivé par défaut (F1 non validé au contrôle)', () => {
    expect(trader.defaults.regime).toBe(false);
    expect(trader.decide(ctx({ btcUp: false }), P)).toHaveLength(1);
    expect(trader.decide(ctx({ btcUp: false }), { ...P, regime: true })).toEqual([]);
  });
  it('stop jugé à la clôture : sortie quand la dernière clôture passe sous le stop', () => {
    const lastClose = series.down[series.down.length - 1].close;
    const o = trader.decide(ctx({ positions: [{ ...pos('down', '2025-10-20'), stop: lastClose * 1.05, stopOnClose: true }] }), P);
    expect(o.find((x) => x.coinId === 'down')).toMatchObject({ side: 'sell', fraction: 1, tag: 'stop' });
    expect(trader.decide(ctx({ positions: [{ ...pos('down', '2025-10-20'), stop: lastClose * 0.9, stopOnClose: true }] }), P).find((x) => x.coinId === 'down')).toBeUndefined();
  });
  it('délai de 5 jours après une sortie au stop', () => {
    expect(trader.decide(ctx({ lastStop: '2025-10-25' }), P)).toEqual([]);
    expect(trader.decide(ctx({ lastStop: '2025-10-22' }), P)).toHaveLength(1);
  });
  it('sortie à la durée maximale (le stop et l’objectif font le reste ; aucun signal de vente n’est validé)', () => {
    const o = trader.decide(ctx({ positions: [pos('sol', '2025-09-28'), pos('down', '2025-10-20')] }), P);
    expect(o.find((x) => x.coinId === 'sol')).toMatchObject({ side: 'sell', fraction: 1, tag: 'time-exit', reason: 'Durée maximale atteinte (30 jours)' });
    expect(o.find((x) => x.coinId === 'down' && x.side === 'sell')).toBeUndefined();
  });
  it('pause à −20 % depuis le sommet, reprise à −10 %', () => {
    expect(trader.decide(ctx({ equity: 790, min: 790 }), P)).toEqual([]);
    expect(trader.decide(ctx({ equity: 880, min: 790 }), P)).toEqual([]);
    expect(trader.decide(ctx({ equity: 950, min: 790 }), P)).toHaveLength(1);
    expect(trader.decide(ctx({ equity: 850, min: 850 }), P)).toHaveLength(1);
  });
  it('places limitées au nombre maximal de positions', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((x) => pos(x, '2025-10-20'));
    expect(trader.decide(ctx({ positions: five }), P).filter((x) => x.side === 'buy')).toEqual([]);
  });
});

describe('stratégie DCA Boussole', () => {
  it('au banc d’essai (sans données en direct) : base seule, échéance entière', () => {
    const o = dcaBoussole.decide(ctx(), dcaBoussole.defaults);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every((x) => x.side === 'buy' && x.tag === 'dca')).toBe(true);
    expect(Math.round(o.reduce((s, x) => s + ('usd' in (x.sizing ?? {}) ? (x.sizing as { usd: number }).usd : 0), 0) * 100) / 100).toBe(25);
    expect(dcaBoussole.decide(ctx({ execDay: '2025-10-29' }), dcaBoussole.defaults)).toEqual([]);
  });
});
