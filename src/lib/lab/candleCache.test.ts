import { describe, expect, it, vi } from 'vitest';
import { createDailyCache, createHourlyCache, mergeCandles } from './candleCache';
import type { Candle } from '../indicators';

const D = 86400;
const H = 3600;
const c = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 10 });

describe('cache incrémental de bougies', () => {
  it('mergeCandles trie, dédoublonne et privilégie la bougie fraîche', () => {
    const out = mergeCandles([c(2 * D, 20), c(1 * D, 10)], [c(2 * D, 21), c(3 * D, 30)]);
    expect(out.map((x) => [x.time, x.close])).toEqual([[1 * D, 10], [2 * D, 21], [3 * D, 30]]);
  });

  it('daily : charge tout une fois, réutilise dans le TTL, puis ne charge que la queue après expiration', async () => {
    const T0 = Date.UTC(2025, 0, 1) / 1000;
    let clock = (T0 + 3 * D + 3600) * 1000; // jour 3 en cours (bougie T0+3D non close)
    const calls: number[] = [];
    const fetchSince = vi.fn(async (_sym: string, startMs: number) => {
      calls.push(startMs);
      if (calls.length === 1) return [c(T0, 100), c(T0 + D, 101), c(T0 + 2 * D, 102), c(T0 + 3 * D, 103)];
      return [c(T0 + 3 * D, 104), c(T0 + 4 * D, 105)];
    });
    const cache = createDailyCache(fetchSince, { startMs: T0 * 1000, refreshMs: 6 * H * 1000, now: () => clock });

    const r1 = await cache.get('BTCUSDT');
    expect(r1.map((x) => x.close)).toEqual([100, 101, 102]); // bougie du jour 3 pas encore close
    expect(calls).toEqual([T0 * 1000]);

    // Dans le TTL : zéro appel réseau
    clock += 2 * H * 1000;
    const r2 = await cache.get('BTCUSDT');
    expect(r2.map((x) => x.close)).toEqual([100, 101, 102]);
    expect(fetchSince).toHaveBeenCalledTimes(1);

    // Après expiration + 1 jour : ne demande qu'à partir de la dernière bougie connue (T0 + 3D)
    clock = (T0 + 4 * D + 3600) * 1000;
    const r3 = await cache.get('BTCUSDT');
    expect(fetchSince).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe((T0 + 3 * D) * 1000);
    expect(r3.map((x) => x.close)).toEqual([100, 101, 102, 104]);
  });

  it('daily : une erreur réseau au rafraîchissement conserve les données déjà en cache', async () => {
    const T0 = Date.UTC(2025, 0, 1) / 1000;
    let clock = (T0 + 2 * D) * 1000;
    let fail = false;
    const cache = createDailyCache(async () => {
      if (fail) throw new Error('timeout');
      return [c(T0, 100), c(T0 + D, 101)];
    }, { startMs: T0 * 1000, refreshMs: H * 1000, now: () => clock });

    expect((await cache.get('ETHUSDT')).length).toBe(2);
    fail = true;
    clock += 2 * H * 1000;
    expect((await cache.get('ETHUSDT')).map((x) => x.close)).toEqual([100, 101]);
  });

  it('hourly : ne demande que les heures manquantes (queue et tête) et borne maxBars', async () => {
    const T0 = Date.UTC(2025, 0, 1) / 1000;
    let clock = (T0 + 10 * H) * 1000;
    const ranges: [number, number][] = [];
    const fetchRange = vi.fn(async (_sym: string, fromMs: number, toMs: number) => {
      ranges.push([fromMs, toMs]);
      const out: Candle[] = [];
      for (let t = Math.floor(fromMs / 1000); t * 1000 < toMs; t += H) out.push(c(t, t - T0));
      return out;
    });
    const cache = createHourlyCache(fetchRange, { maxBars: 6, now: () => clock });

    const a = await cache.get('SOLUSDT', (T0 + 4 * H) * 1000, (T0 + 7 * H) * 1000);
    expect(a.map((x) => x.time)).toEqual([T0 + 4 * H, T0 + 5 * H, T0 + 6 * H]);
    expect(ranges).toHaveLength(1);

    // Même plage : zéro appel
    const b = await cache.get('SOLUSDT', (T0 + 5 * H) * 1000, (T0 + 7 * H) * 1000);
    expect(b.map((x) => x.time)).toEqual([T0 + 5 * H, T0 + 6 * H]);
    expect(ranges).toHaveLength(1);

    // Avance de 2 heures : ne demande que [7H, 9H]
    const d = await cache.get('SOLUSDT', (T0 + 4 * H) * 1000, (T0 + 9 * H) * 1000);
    expect(d).toHaveLength(5);
    expect(ranges[1]).toEqual([(T0 + 7 * H) * 1000, (T0 + 9 * H) * 1000]);

    // Demande plus ancienne : ne demande que la tête [1H, 4H] et respecte maxBars = 6
    const e = await cache.get('SOLUSDT', (T0 + 1 * H) * 1000, (T0 + 9 * H) * 1000);
    expect(ranges[2]).toEqual([(T0 + 1 * H) * 1000, (T0 + 4 * H) * 1000]);
    expect(e.length).toBeLessThanOrEqual(6);
  });
});
