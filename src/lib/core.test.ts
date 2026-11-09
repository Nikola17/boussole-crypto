import { describe, expect, it } from 'vitest';
import { atr, bollinger, ema, lastCross, macd, maxDrawdown, rsi, sma, toWeekly, type Candle } from './indicators';
import { analyze } from './signals';
import { computeCycle, piecewise, zoneFor, altSeasonIndex } from './cycle';
import { backtestDca, fngMultiplier, isScheduledDay, mayerMultiplier, nextOccurrences, periodKey, lastOccurrence } from './dca';
import { buildPositions, bucketOf, rebalance, stressTest, concentration } from './portfolio';
import { computeFrenchTax, simulateSale } from './tax';
import { positionSize, tradeStats } from './risk';
import { archetypeFor, scoreProfile } from './profile';
import { scoreSmallCap, scorePool, isSmallCapCandidate, DEFAULT_SMALLCAP_FILTER } from './gems';
import type { Transaction, TradeEntry } from '../types';

const DAY = 86400;

function makeCandles(closes: number[], start = Date.UTC(2022, 0, 3) / 1000): Candle[] {
  return closes.map((c, i) => ({ time: start + i * DAY, open: i ? closes[i - 1] : c, high: Math.max(c, i ? closes[i - 1] : c) * 1.01, low: Math.min(c, i ? closes[i - 1] : c) * 0.99, close: c, volume: 1000 + (i % 7) * 10 }));
}

describe('indicateurs', () => {
  it('SMA calcule une moyenne glissante', () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(s[0]).toBeNaN();
    expect(s[2]).toBeCloseTo(2);
    expect(s[4]).toBeCloseTo(4);
  });

  it('EMA démarre sur la SMA puis lisse', () => {
    const e = ema([2, 4, 6, 8, 10], 3);
    expect(e[2]).toBeCloseTo(4);
    expect(e[3]).toBeCloseTo(6); // 8*0.5 + 4*0.5
    expect(e[4]).toBeCloseTo(8);
  });

  it('RSI vaut 100 sur une hausse continue et ~0 sur une baisse continue', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 200 - i);
    expect(rsi(up, 14)[29]).toBe(100);
    expect(rsi(down, 14)[29]).toBeLessThan(1);
  });

  it('RSI reste entre 0 et 100 sur une série bruitée', () => {
    const v = Array.from({ length: 300 }, (_, i) => 100 + 10 * Math.sin(i / 5) + (i % 3));
    for (const x of rsi(v, 14).filter(Number.isFinite)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
  });

  it('MACD : histogramme = ligne − signal', () => {
    const v = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3) * 4);
    const m = macd(v);
    const i = 110;
    expect(m.hist[i]).toBeCloseTo(m.macd[i] - m.signal[i]);
  });

  it('Bollinger encadre la moyenne', () => {
    const v = Array.from({ length: 60 }, (_, i) => 50 + Math.sin(i) * 5);
    const b = bollinger(v, 20, 2);
    expect(b.upper[59]).toBeGreaterThan(b.mid[59]);
    expect(b.lower[59]).toBeLessThan(b.mid[59]);
  });

  it('ATR positif', () => {
    const c = makeCandles(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(atr(c, 14)[39]).toBeGreaterThan(0);
  });

  it('détecte un croisement', () => {
    const a = [1, 1, 1, 3, 3];
    const b = [2, 2, 2, 2, 2];
    expect(lastCross(a, b, 10)).toEqual({ dir: 1, barsAgo: 1 });
  });

  it('agrège en semaines et calcule le drawdown', () => {
    const c = makeCandles(Array.from({ length: 21 }, () => 10));
    expect(toWeekly(c).length).toBe(3);
    expect(maxDrawdown([100, 120, 60, 90])).toBeCloseTo(-50);
  });
});

describe('signaux', () => {
  it('une tendance haussière régulière donne un signal investisseur positif', () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 * 1.003 ** i);
    const a = analyze(makeCandles(closes))!;
    expect(a.investor.score).toBeGreaterThan(0);
    expect(a.trader.tone).not.toBe('down');
    expect(a.plan!.stop).toBeLessThan(a.price);
    expect(a.plan!.tp1).toBeGreaterThan(a.price);
  });

  it('une tendance baissière régulière donne un signal négatif', () => {
    const closes = Array.from({ length: 400 }, (_, i) => 1000 * 0.997 ** i);
    const a = analyze(makeCandles(closes))!;
    expect(a.trader.score).toBeLessThan(0);
    expect(a.investor.factors.find((f) => f.key === 'trend200')!.vote).toBe(-2);
  });

  it('refuse les historiques trop courts', () => {
    expect(analyze(makeCandles([1, 2, 3]))).toBeNull();
  });
});

describe('cycle', () => {
  it('interpolation par morceaux', () => {
    expect(piecewise(0.5, [[0, 0], [1, 100]])).toBe(50);
    expect(piecewise(-1, [[0, 0], [1, 100]])).toBe(0);
    expect(piecewise(9, [[0, 0], [1, 100]])).toBe(100);
  });

  it('zones de température', () => {
    expect(zoneFor(10).key).toBe('capitulation');
    expect(zoneFor(50).dcaMultiplier).toBe(1);
    expect(zoneFor(90).key).toBe('euphorie');
  });

  it('calcule une température bornée', () => {
    const closes = Array.from({ length: 1500 }, (_, i) => 10000 * (1 + 0.5 * Math.sin(i / 200)) * 1.0005 ** i);
    const r = computeCycle({ btcDaily: makeCandles(closes), fng: 30 })!;
    expect(r.temperature).toBeGreaterThanOrEqual(0);
    expect(r.temperature).toBeLessThanOrEqual(100);
    expect(r.components.length).toBeGreaterThanOrEqual(4);
  });

  it('indice de saison des altcoins', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, change30d: i < 30 ? 20 : -5 }));
    expect(altSeasonIndex(rows, 10)).toBe(75);
  });
});

describe('DCA', () => {
  it('multiplicateurs', () => {
    expect(fngMultiplier(10)).toBe(2);
    expect(fngMultiplier(50)).toBe(1);
    expect(fngMultiplier(95)).toBe(0.25);
    expect(mayerMultiplier(0.7)).toBe(2);
    expect(mayerMultiplier(2.5)).toBe(0.25);
  });

  it('calendrier hebdomadaire (lundi)', () => {
    const plan = { frequency: 'weekly' as const, startDate: '2026-11-02', dayOfWeek: 1 };
    const next = nextOccurrences(plan, new Date(2026, 10, 3), 2);
    expect(next[0].getDay()).toBe(1);
    expect(next[0].getDate()).toBe(9);
    expect(isScheduledDay(plan, new Date(2026, 10, 9))).toBe(true);
    expect(isScheduledDay(plan, new Date(2026, 10, 10))).toBe(false);
  });

  it('période mensuelle et dernière échéance', () => {
    const plan = { frequency: 'monthly' as const, startDate: '2026-01-05', dayOfMonth: 5 };
    expect(periodKey(plan, new Date(2026, 10, 20))).toBe('m-2026-11');
    expect(lastOccurrence(plan, new Date(2026, 10, 20))!.getDate()).toBe(5);
    expect(lastOccurrence(plan, new Date(2025, 0, 1))).toBeNull();
  });

  it('backtest classique : montant investi = nombre d’achats × montant', () => {
    const prices = Array.from({ length: 400 }, (_, i) => ({ time: Date.UTC(2023, 0, 1) / 1000 + i * DAY, close: 100 + i }));
    const r = backtestDca({ prices, amount: 10, frequency: 'weekly', strategy: 'classic', startTime: prices[0].time, feePct: 0 });
    expect(r.summary.invested).toBe(r.summary.buys * 10);
    expect(r.summary.buys).toBe(Math.ceil(400 / 7));
    expect(r.summary.roiPct).toBeGreaterThan(0);
  });
});

function tx(p: Partial<Transaction>): Transaction {
  return { id: Math.random().toString(), coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', date: '2026-01-01', type: 'buy', quantity: 1, price: 100, currency: 'EUR', fee: 0, fxEurPerUsd: 0.9, ...p };
}

describe('portefeuille', () => {
  it('coût moyen pondéré et plus-value réalisée', () => {
    const pos = buildPositions([
      tx({ date: '2026-01-01', quantity: 1, price: 100 }),
      tx({ date: '2026-02-01', quantity: 1, price: 200 }),
      tx({ date: '2026-03-01', type: 'sell', quantity: 1, price: 300 }),
    ]).get('bitcoin')!;
    expect(pos.quantity).toBe(1);
    expect(pos.costEur).toBeCloseTo(150);
    expect(pos.realizedEur).toBeCloseTo(150);
  });

  it('poches de risque', () => {
    expect(bucketOf('bitcoin', 'btc', 1)).toBe('btc');
    expect(bucketOf('tether', 'usdt', 3)).toBe('stable');
    expect(bucketOf('solana', 'sol', 6)).toBe('large');
    expect(bucketOf('xyz', 'xyz', 500)).toBe('small');
  });

  it('rééquilibrage et stress test', () => {
    const alloc = { btc: 50, eth: 50, large: 0, mid: 0, small: 0, stable: 0 };
    const lines = rebalance(alloc, { btc: 50, eth: 30, large: 0, mid: 0, small: 0, stable: 20 });
    expect(lines.find((l) => l.bucket === 'eth')!.diffValue).toBeCloseTo(-20);
    expect(stressTest({ btc: 100, eth: 0, large: 0, mid: 0, small: 0, stable: 100 }, -50).changePct).toBeCloseTo(-25);
    expect(concentration([100])).toBe(100);
  });
});

describe('fiscalité française (150 VH bis)', () => {
  it('exemple de référence : 1 000 € investis, vente de 500 € quand le portefeuille vaut 2 000 €', () => {
    const r = simulateSale(500, 2000, 1000, 31.4, 0);
    expect(r.fractionImputed).toBeCloseTo(250);
    expect(r.gain).toBeCloseTo(250);
    expect(r.tax).toBeCloseTo(78.5);
    expect(r.acquisitionAfter).toBeCloseTo(750);
  });

  it('exonération sous 305 € de cessions annuelles', () => {
    expect(simulateSale(300, 2000, 1000, 31.4, 0).exempt).toBe(true);
    expect(simulateSale(300, 2000, 1000, 31.4, 10).exempt).toBe(false);
  });

  it('les échanges crypto→crypto ne sont pas imposables', () => {
    const report = computeFrenchTax([
      tx({ date: '2026-01-01', quantity: 1, price: 1000 }),
      tx({ date: '2026-02-01', type: 'sell', quantity: 0.5, price: 1500, toFiat: false }),
    ]);
    expect(report.years.length).toBe(0);
    expect(report.acquisitionRemaining).toBe(1000);
  });

  it('calcule l’année et réduit le prix d’acquisition', () => {
    const report = computeFrenchTax([
      tx({ date: '2026-01-01', quantity: 1, price: 1000 }),
      tx({ date: '2026-06-01', type: 'sell', quantity: 0.25, price: 2000, toFiat: true, portfolioValueEur: 2000 }),
    ], 30);
    const y = report.years[0];
    expect(y.totalCessions).toBe(500);
    expect(y.netGain).toBeCloseTo(250);
    expect(y.tax).toBeCloseTo(75);
    expect(report.acquisitionRemaining).toBeCloseTo(750);
  });
});

describe('gestion du risque', () => {
  it('taille de position pour 1 % de risque', () => {
    const r = positionSize({ capital: 10000, riskPct: 1, entry: 100, stop: 95, takeProfit: 115 })!;
    expect(r.riskAmount).toBe(100);
    expect(r.quantity).toBeCloseTo(20);
    expect(r.rr).toBeCloseTo(3);
  });

  it('refuse un stop incohérent', () => {
    expect(positionSize({ capital: 1000, riskPct: 1, entry: 100, stop: 105 })).toBeNull();
  });

  it('prix de liquidation et alerte levier', () => {
    const r = positionSize({ capital: 1000, riskPct: 1, entry: 100, stop: 80, leverage: 10 })!;
    expect(r.liquidationPrice).toBeCloseTo(90.5);
    expect(r.warnings.some((w) => w.includes('liquidation'))).toBe(true);
  });

  it('statistiques du journal', () => {
    const base: TradeEntry = { id: '1', coinId: 'btc', symbol: 'btc', side: 'long', status: 'closed', entryDate: '2026-01-01', entryPrice: 100, quantity: 1, stopLoss: 90, leverage: 1, fees: 0, exitPrice: 120, exitDate: '2026-01-05' };
    const s = tradeStats([base, { ...base, id: '2', exitPrice: 90, exitDate: '2026-01-06' }]);
    expect(s.winRate).toBe(50);
    expect(s.totalPnl).toBe(10);
    expect(s.profitFactor).toBeCloseTo(2);
    expect(s.avgR).toBeCloseTo(0.5);
  });
});

describe('profil et pépites', () => {
  it('archétype selon le score', () => {
    expect(archetypeFor(scoreProfile({ horizon: 1, riskTolerance: 1, experience: 1, maxLoss: 1, goal: 1 }))).toBe('Prudent');
    expect(archetypeFor(scoreProfile({ horizon: 3, riskTolerance: 5, experience: 3, maxLoss: 4, goal: 3 }))).toBe('Audacieux');
  });

  it('score petite capi borné et filtre des stablecoins', () => {
    const c = { id: 'x', symbol: 'xyz', name: 'Xyz', marketCap: 50e6, fdv: 55e6, volume24h: 10e6, change7d: 12, change30d: 40, athChangePct: -70, rank: 400 };
    const s = scoreSmallCap(c);
    expect(s.score).toBeGreaterThan(50);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(isSmallCapCandidate({ ...c, symbol: 'usdc', id: 'usd-coin', name: 'USDC' }, DEFAULT_SMALLCAP_FILTER)).toBe(false);
  });

  it('score de pool on-chain et risque', () => {
    const s = scorePool({ ageHours: 72, liquidityUsd: 300e3, volume24h: 600e3, fdvUsd: 3e6, change1h: 2, change24h: 40, buys24h: 900, sells24h: 600, buyers24h: 500, sellers24h: 300 });
    expect(s.score).toBeGreaterThan(50);
    expect(s.risk).toBeLessThan(50);
  });
});
