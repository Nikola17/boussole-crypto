import { describe, expect, it } from 'vitest';
import { simulate, type SimConfig } from './sim';
import { makeAsset, dayOf } from './universe';
import { COSTS, type Strategy } from './types';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2024, 0, 1) / 1000;
const day = (i: number) => dayOf(T0 + i * D);
/** 60 bougies : ouverture 100 + i, clôture 100 + i + 0,5. */
const btcCandles: Candle[] = Array.from({ length: 60 }, (_, i) => ({ time: T0 + i * D, open: 100 + i, high: 101.5 + i, low: 99 + i, close: 100.5 + i, volume: 1 }));

type P = { buyDay: string; sellDay: string; usd: number; stop: number };
const test: Strategy<P> = {
  id: 'test', version: 1, label: 'Test', describe: '', defaults: { buyDay: day(10), sellDay: day(40), usd: 100, stop: 50 }, uses: [], replayable: true, kind: 'trades',
  deposit: () => 0,
  decide: (ctx, p) => {
    if (ctx.execDay === p.buyDay) return [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'buy', sizing: { usd: p.usd }, stop: p.stop, reason: 'achat' }];
    if (ctx.execDay === p.sellDay) return [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', side: 'sell', fraction: 1, reason: 'vente' }];
    return [];
  },
};
const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({ startCashUsd: 1000, costs: COSTS.exchange, fill: 'nextOpen', from: day(1), to: day(59), minOrderUsd: 5, ...over });
const data = (candles = btcCandles) => ({ assets: [makeAsset('BTC', candles)], temperature: new Map<string, number>(), btcId: 'BTC' });

describe('simulateur', () => {
  it('achat le jour 10, vente le jour 40, à l’ouverture', () => {
    const r = simulate(test, test.defaults, data(), cfg());
    expect(r.fills).toHaveLength(2);
    const q = (100 - 0.1) / (110 * 1.0005);
    expect(r.fills[0].quantity).toBeCloseTo(q, 7);
    const proceeds = q * 140 * 0.9995;
    const last = r.series[r.series.length - 1];
    expect(last.valueUsd).toBeCloseTo(900 + proceeds * 0.999, 4);
    expect(last.cashUsd).toBeCloseTo(last.valueUsd, 9);
    expect(r.series[0].day).toBe(day(1));
  });
  it('à la clôture : prix de clôture du jour d’exécution', () => {
    const r = simulate(test, test.defaults, data(), cfg({ fill: 'nextClose' }));
    expect(r.fills[0].marketUsd).toBe(110.5);
    expect(r.fills[1].marketUsd).toBe(140.5);
  });
  it('trou de cotation sous le stop : exécution à l’ouverture', () => {
    const gap = btcCandles.map((c, i) => (i === 20 ? { ...c, open: 70, low: 69, high: 75, close: 72 } : c));
    const r = simulate(test, { ...test.defaults, stop: 80 }, data(gap), cfg());
    expect(r.fills[1].kind).toBe('stop');
    expect(r.fills[1].marketUsd).toBe(70);
    expect(r.fills).toHaveLength(2); // la vente du jour 40 ne trouve plus de position
    expect(r.skipped.some((s) => s.why === 'aucune position à vendre')).toBe(true);
  });
  it('cash insuffisant et montant minimal', () => {
    const r = simulate(test, { ...test.defaults, usd: 5000 }, data(), cfg({ startCashUsd: 50 }));
    expect(r.fills[0].quantity * r.fills[0].priceUsd + r.fills[0].feeUsd).toBeCloseTo(50, 6);
    const tiny = simulate(test, { ...test.defaults, usd: 3 }, data(), cfg());
    expect(tiny.fills).toHaveLength(0);
    expect(tiny.skipped[0].why).toBe('montant trop petit');
  });
  it('paire retirée : soldée à la dernière clôture', () => {
    const r = simulate(test, test.defaults, { ...data(btcCandles.slice(0, 31)), assets: [makeAsset('BTC', btcCandles.slice(0, 31)), makeAsset('ETH', btcCandles)] }, cfg());
    const delisted = r.fills.find((f) => f.kind === 'delist');
    expect(delisted?.marketUsd).toBe(130.5);
  });
  it('déterministe', () => {
    expect(simulate(test, test.defaults, data(), cfg())).toEqual(simulate(test, test.defaults, data(), cfg()));
  });
  it('univers simulé : aligné sur le top 500 par défaut et surchargeable par la stratégie ou la config', () => {
    const longCandles = (v: number): Candle[] => Array.from({ length: 210 }, (_, i) => ({ time: T0 + i * D, open: 100, high: 101, low: 99, close: 100, volume: v }));
    const assets = Array.from({ length: 25 }, (_, i) => makeAsset(i === 0 ? 'BTC' : `C${i}`, longCandles(1000 - i)));
    const seen: number[] = [];
    const probe: Strategy<Record<string, never>> = {
      id: 'probe', version: 1, label: 'Probe', describe: '', defaults: {}, uses: [], replayable: true, kind: 'trades',
      deposit: () => 0,
      decide: (ctx) => { seen.push(ctx.universe.length); return []; },
    };
    const simCfg = cfg({ from: day(201), to: day(202) });
    simulate(probe, {}, { assets, temperature: new Map(), btcId: 'BTC' }, simCfg);
    expect(seen[0]).toBe(25); // plus bridé à 20
    seen.length = 0;
    simulate({ ...probe, universeTop: 10 }, {}, { assets, temperature: new Map(), btcId: 'BTC' }, simCfg);
    expect(seen[0]).toBe(10);
    seen.length = 0;
    simulate(probe, {}, { assets, temperature: new Map(), btcId: 'BTC' }, { ...simCfg, universeTop: 7 });
    expect(seen[0]).toBe(7);
  });
});
