import { describe, expect, it } from 'vitest';
import { analyze, MIN_BARS_FOR_BUY, SIGNALS_VERSION } from './signals';
import { closedCandles, volumeRatio, type Candle } from './indicators';

/** Série synthétique : tendance linéaire + légère oscillation, volume constant. */
function series(n: number, from: number, to: number, volume = 1000): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = from + ((to - from) * i) / (n - 1) + Math.sin(i / 3) * from * 0.01;
    return { time: 1_700_000_000 + i * 86400, open: close * 0.995, high: close * 1.01, low: close * 0.99, close, volume };
  });
}

describe('volume : la bougie du jour (incomplète) n’est pas comparée à des journées entières', () => {
  it('le ratio porte sur la dernière bougie CLOSE', () => {
    const c = series(30, 100, 110, 1000);
    c[c.length - 2].volume = 3000; // dernière bougie close : ×3
    c[c.length - 1].volume = 50; // bougie du jour, à peine commencée
    expect(volumeRatio(c, 20)).toBeCloseTo(3, 5);
  });
  it('pas assez de bougies closes : NaN', () => {
    expect(volumeRatio(series(20, 1, 2), 20)).toBeNaN();
    expect(volumeRatio(series(21, 1, 2), 20)).toBeNaN();
    expect(volumeRatio(series(22, 1, 2), 20)).not.toBeNaN();
  });
});

describe('signal investisseur : pas d’achat sans 200 jours d’historique', () => {
  // Une chute de 70 % puis un plancher : contexte de peur extrême, forte décote par rapport au plus haut
  const ctx = { temperature: 8, athChangePct: -70 };
  const fall = (n: number) => [...series(n - 30, 200, 60), ...series(30, 60, 62)];

  it('avec 120 jours : le score peut être positif mais le libellé reste « Conserver », avec une explication', () => {
    const a = analyze(fall(120), ctx)!;
    expect(a).not.toBeNull();
    expect(a.bars).toBe(120);
    expect(a.investor.score).toBeGreaterThanOrEqual(15); // sinon ce test ne prouverait rien
    expect(['Accumuler', 'Accumuler fort']).not.toContain(a.investor.label);
    expect(a.investor.label).toBe('Conserver');
    expect(a.investor.tone).toBe('neutral');
    expect(a.investor.limitedBy).toContain('120 jours');
    expect(a.investor.confidence).not.toBe('haute');
  });

  it('avec 300 jours et le même contexte : le signal d’achat est possible', () => {
    const a = analyze(fall(300), ctx)!;
    expect(a.bars).toBeGreaterThanOrEqual(MIN_BARS_FOR_BUY);
    expect(a.investor.limitedBy).toBeUndefined();
    expect(['Accumuler', 'Accumuler fort']).toContain(a.investor.label);
  });

  it('un signal de vente n’est jamais bridé par l’historique court', () => {
    const rise = [...series(60, 10, 12), ...series(60, 12, 90)];
    const a = analyze(rise, { temperature: 92, athChangePct: -2 })!;
    expect(a.investor.limitedBy).toBeUndefined();
  });
});

describe('compression de volatilité : un mouvement se prépare, son sens est inconnu', () => {
  it('n’est jamais classée haussière', () => {
    // Longue phase calme après une phase agitée : les bandes de Bollinger se resserrent
    const wild = series(150, 100, 120).map((c, i) => ({ ...c, close: c.close * (1 + Math.sin(i) * 0.06), high: c.high * 1.08, low: c.low * 0.92 }));
    const calm = series(60, 120, 120.5).map((c) => ({ ...c, high: c.close * 1.001, low: c.close * 0.999, open: c.close }));
    const a = analyze([...wild, ...calm], {});
    for (const s of a?.setups ?? []) if (s.key === 'squeeze') expect(s.bias).toBe('neutral');
  });
});

describe('signaux sur bougies closes (banc d’essai)', () => {
  it('closedCandles retire la bougie du jour encore ouverte', () => {
    const day = 86400;
    const cs = [0, 1, 2].map((i) => ({ time: i * day, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(closedCandles(cs, (2 * day + 3600) * 1000)).toHaveLength(2);
    expect(closedCandles(cs, 3 * day * 1000)).toHaveLength(3);
  });
  it('volumeRatio en mode clos compare la dernière bougie aux 20 précédentes', () => {
    const cs = Array.from({ length: 22 }, (_, i) => ({ time: i, open: 1, high: 1, low: 1, close: 1, volume: i === 21 ? 300 : 100 }));
    expect(volumeRatio(cs, 20, { closedOnly: true })).toBeCloseTo(3, 9);
  });
  it('analyze en mode clos donne le même résultat quelle que soit l’heure de la journée', () => {
    const closed = series(260, 100, 180);
    const day0 = closed[closed.length - 1].time + 86400;
    const open = (close: number) => ({ time: day0, open: close, high: close * 1.2, low: close * 0.8, close, volume: 99_999 });
    const at10h = analyze(closedCandles([...closed, open(150)], (day0 + 10 * 3600) * 1000), {}, { closedOnly: true });
    const at22h = analyze(closedCandles([...closed, open(230)], (day0 + 22 * 3600) * 1000), {}, { closedOnly: true });
    expect(at10h?.investor.label).toBe(at22h?.investor.label);
    expect(at10h?.trader.label).toBe(at22h?.trader.label);
    expect(at10h?.setups).toEqual(at22h?.setups);
    expect(at10h?.price).toBe(closed[closed.length - 1].close);
  });
  it('numéros de version des règles', () => {
    expect(SIGNALS_VERSION).toBe(1);
  });
});
