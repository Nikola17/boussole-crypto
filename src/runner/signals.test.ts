import { describe, expect, it } from 'vitest';
import { advanceSignals, computeSignals, signalKeysOf, signalMessage, TRACKED_LABEL } from './signals';

describe('alertes de signal', () => {
  it('suit seulement les états de risque et les setups validés', () => {
    expect(signalKeysOf({ investor: 'Alléger', setups: ['breakout', 'macd'] })).toEqual(['inv:Alléger', 'setup:breakout']);
    expect(signalKeysOf({ investor: 'Accumuler', setups: [] })).toEqual([]);
    expect(Object.keys(TRACKED_LABEL)).toContain('inv:Prendre des profits');
  });
  it('une seule alerte par épisode, une nouvelle après une interruption', () => {
    const coins = { solana: { symbol: 'sol', keys: ['setup:breakout'] } };
    const d1 = advanceSignals({ active: {}, starts: {} }, coins, '2026-11-10');
    expect(d1.events.map((e) => e.key)).toEqual(['sig:solana:setup:breakout:2026-11-10']);
    const d2 = advanceSignals(d1.state, coins, '2026-11-11');
    expect(d2.events).toEqual([]);
    const d3 = advanceSignals(d2.state, { solana: { symbol: 'sol', keys: [] } }, '2026-11-12');
    expect(d3.events).toEqual([]); // la fin d'un setup n'est pas une alerte
    const d4 = advanceSignals(d3.state, coins, '2026-11-13');
    expect(d4.events.map((e) => e.key)).toEqual(['sig:solana:setup:breakout:2026-11-13']);
  });
  it('calcule les clés du jour sur les bougies closes, avec le top 20 en plus des cryptos suivies', async () => {
    // Série en hausse régulière puis euphorie : RSI hebdomadaire très haut → « Alléger » (règle « excès »).
    const candles = Array.from({ length: 400 }, (_, i) => {
      const close = 100 * Math.pow(1.01, i);
      return { time: Date.UTC(2025, 0, 1) / 1000 + i * 86400, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000 };
    });
    const asked: string[] = [];
    const out = await computeSignals([{ coinId: 'solana', symbol: 'sol' }], {
      daily: async (id) => { asked.push(id); return id === 'vide' ? [] : candles; },
      temperatureAt: () => 50,
      universe: async () => [{ coinId: 'bitcoin', symbol: 'btc' }, { coinId: 'vide', symbol: 'vid' }],
    }, 20);
    expect(asked.sort()).toEqual(['bitcoin', 'solana', 'vide']);
    expect(out.solana.keys).toContain('inv:Alléger');
    expect(out.bitcoin.symbol).toBe('btc');
    expect(out.vide).toBeUndefined(); // pas d'historique : pas d'état, donc pas d'alerte
  });
  it('sortie d’un état de risque annoncée, avec la phrase de fiabilité', () => {
    const s1 = advanceSignals({ active: {}, starts: {} }, { bitcoin: { symbol: 'btc', keys: ['inv:Alléger'] } }, '2026-11-10');
    const s2 = advanceSignals(s1.state, { bitcoin: { symbol: 'btc', keys: [] } }, '2026-11-20');
    expect(s2.events).toHaveLength(1);
    expect(s2.events[0].kind).toBe('exit');
    const text = signalMessage(s1.events[0], 'Depuis 2019 : vu 2155 fois. Verdict : validé.');
    expect(text).toContain('BTC');
    expect(text).toContain('Alléger');
    expect(text).toContain('Depuis 2019 : vu 2155 fois.');
  });
});
