import { describe, expect, it } from 'vitest';
import { buildAssets, chainSeries, splitOnGaps, toCoinId, toSymbol, universeAt, UNIVERSE_SYMBOLS, dayOf } from './universe';
import type { Candle } from '../indicators';

const D = 86400;
const T0 = Date.UTC(2020, 0, 1) / 1000;
/** n bougies quotidiennes à partir du jour `start` (index de jour), prix constant, volume donné. */
const run = (start: number, n: number, price = 10, volume = 1000): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: T0 + (start + i) * D, open: price, high: price, low: price, close: price, volume }));

describe('univers de mesure', () => {
  it('liste de l’annexe B sans les absents de Binance', () => {
    expect(UNIVERSE_SYMBOLS).toContain('BTC');
    expect(UNIVERSE_SYMBOLS).toContain('LUNA');
    expect(UNIVERSE_SYMBOLS).not.toContain('KAS');
    expect(UNIVERSE_SYMBOLS).not.toContain('XDC');
  });

  it('coupe une série sur un trou de plus de 5 jours', () => {
    const six = splitOnGaps('LUNA', [...run(0, 10), ...run(16, 10)]);
    expect(six.map((s) => s.id)).toEqual(['LUNA#1', 'LUNA#2']);
    expect(six[1].candles).toHaveLength(10);
    const five = splitOnGaps('LUNA', [...run(0, 10), ...run(15, 10)]);
    expect(five.map((s) => s.id)).toEqual(['LUNA']);
  });

  it('chaîne deux séries si l’écart de prix à la jonction est sous 10 %', () => {
    expect(chainSeries(run(0, 5, 10), run(5, 5, 10.3))).toHaveLength(10);
    expect(chainSeries(run(0, 5, 10), run(5, 5, 11.5))).toBeNull();
  });

  it('buildAssets : chaînage MATIC→POL, refus noté, exclusions', () => {
    const raw = new Map<string, Candle[]>([
      ['MATIC', run(0, 300, 1)], ['POL', run(300, 50, 1.02)],
      ['FTM', run(0, 300, 1)], ['S', run(300, 50, 0.5)],
      ['BTC', run(0, 350, 100)],
    ]);
    const { assets, notes } = buildAssets(raw);
    const ids = assets.map((a) => a.id).sort();
    expect(ids).toEqual(['BTC', 'FTM', 'POL', 'S']);
    expect(assets.find((a) => a.id === 'POL')?.candles).toHaveLength(350);
    expect(notes.some((n) => n.includes('FTM') && n.includes('S'))).toBe(true);
  });

  it('universeAt : historique minimal, série finie, classement par volume', () => {
    const { assets } = buildAssets(new Map<string, Candle[]>([
      ['BTC', run(0, 400, 100, 5000)],
      ['ETH', run(0, 400, 10, 9000)],
      ['NEW', run(250, 150, 1, 99999)],           // 150 bougies au jour 399
      ['DEAD', run(0, 300, 1, 99999)],            // terminée au jour 299
      ['ADA', run(0, 400, 1, 100)],
    ]));
    const day = dayOf(T0 + 399 * D);
    expect(universeAt(assets, day, { top: 2 }).map((a) => a.id)).toEqual(['ETH', 'BTC']);
    expect(universeAt(assets, day, { top: 10 }).map((a) => a.id)).toEqual(['ETH', 'BTC', 'ADA']);
  });

  it('correspondance des identifiants', () => {
    expect(toSymbol('bitcoin')).toBe('BTC');
    expect(toSymbol('ethereum')).toBe('ETH');
    expect(toCoinId('BTC')).toBe('bitcoin');
    expect(toSymbol('SOL')).toBe('SOL');
  });
});
