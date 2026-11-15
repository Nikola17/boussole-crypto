// Candidats du lot 3 : chaque extracteur, un cas vrai et un cas faux construits à la main.
import { describe, expect, it } from 'vitest';
import { CANDIDATES, candidateExtractor } from './candidates';
import { analyze } from '../signals';
import { makeAsset } from './universe';
import type { Candle } from '../indicators';
import type { ObsCtx } from './events';

const D = 86400;
const T0 = Date.UTC(2022, 0, 1) / 1000;
const mk = (closes: number[], over: (i: number, c: Candle) => Partial<Candle> = () => ({})): Candle[] =>
  closes.map((close, i) => { const c = { time: T0 + i * D, open: close, high: close * 1.005, low: close * 0.995, close, volume: 1000, takerBuyQuote: 500 }; return { ...c, ...over(i, c) }; });
const up = (n: number, from = 100, step = 0.3) => Array.from({ length: n }, (_, i) => from + i * step + Math.sin(i / 2) * 0.5);
const down = (n: number, from = 300, step = 0.4) => Array.from({ length: n }, (_, i) => from - i * step + Math.sin(i / 2) * 0.5);
function ctx(cs: Candle[], over: Partial<ObsCtx> = {}): ObsCtx {
  const asset = makeAsset(over.asset?.id ?? 'SOL', cs);
  return { asset, i: cs.length - 1, window: cs.slice(-400), analysis: analyze(cs.slice(-400), {}, { closedOnly: true })!, temperature: 50, btcAboveSma200: true, btc: cs, ...over };
}
const keys = (o: ObsCtx) => candidateExtractor(o);
const has = (o: ObsCtx, prefix: string) => keys(o).some((k) => k.startsWith(prefix));

describe('candidats du lot 3', () => {
  it('chaque candidat a une intention et des horizons', () => {
    expect(CANDIDATES.length).toBeGreaterThanOrEqual(20);
    for (const c of CANDIDATES) { expect(c.horizons.length).toBeGreaterThan(0); expect(c.key.startsWith('cand:') || c.key.startsWith('plan:F')).toBe(true); }
    expect(new Set(CANDIDATES.map((c) => c.key)).size).toBe(CANDIDATES.length);
  });
  it('F1 régime et F2 tendance propre', () => {
    const rising = mk(up(300));
    expect(has(ctx(rising), 'cand:F1:btc200')).toBe(true);
    expect(has(ctx(rising, { btcAboveSma200: false }), 'cand:F1:btc200')).toBe(false);
    expect(has(ctx(rising), 'cand:F2:')).toBe(true);
    expect(has(ctx(mk(down(300))), 'cand:F2:')).toBe(false);
  });
  it('F3 cassure : 20 jours et volume, pas sur 55 jours si le plus haut est plus ancien', () => {
    const closes = [...Array.from({ length: 250 }, () => 100), ...Array.from({ length: 30 }, (_, i) => (i < 5 ? 130 : 100)), 110];
    const cs = mk(closes, (i, c) => (i === closes.length - 1 ? { volume: 3000, high: c.close } : {}));
    const k = keys(ctx(cs));
    expect(k).toContain('cand:F3:h20v15');
    expect(k).toContain('cand:F3:h20v20');
    expect(k).not.toContain('cand:F3:h55v15');
    expect(keys(ctx(mk(closes)))).not.toContain('cand:F3:h20v15');
  });
  it('F4 pression acheteuse, sans donnée : muet', () => {
    expect(has(ctx(mk(up(250), () => ({ takerBuyQuote: 600 }))), 'cand:F4:p52')).toBe(true);
    expect(has(ctx(mk(up(250), () => ({ takerBuyQuote: 450 }))), 'cand:F4:')).toBe(false);
    expect(has(ctx(mk(up(250), () => ({ takerBuyQuote: undefined }))), 'cand:F4:')).toBe(false);
  });
  it('F5 force relative face à Bitcoin', () => {
    const coin = mk(up(250, 100, 0.8));
    const btc = mk(up(250, 100, 0.1));
    expect(has(ctx(coin, { btc }), 'cand:F5:')).toBe(true);
    expect(has(ctx(btc, { btc: coin }), 'cand:F5:')).toBe(false);
  });
  it('F6 survente avec rebond, F7 valorisation profonde, F10 excès', () => {
    const crash = [...up(220), ...Array.from({ length: 15 }, (_, i) => 160 - i * 6), 80]; // première bougie verte après la chute
    expect(has(ctx(mk(crash)), 'cand:F6:base')).toBe(true);
    expect(has(ctx(mk(up(250))), 'cand:F6:')).toBe(false);
    const deep = [...Array.from({ length: 220 }, () => 100), ...Array.from({ length: 60 }, () => 55)];
    expect(has(ctx(mk(deep)), 'cand:F7:mayer08')).toBe(true);
    expect(has(ctx(mk(up(300))), 'cand:F7:mayer08')).toBe(false);
    const parabola = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i / 80));
    expect(has(ctx(mk(parabola)), 'cand:F10:')).toBe(true);
    expect(has(ctx(mk(Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 4) * 5))), 'cand:F10:')).toBe(false); // marché sans tendance : ni RSI hebdo > 80 ni Mayer > 2
  });
  it('F8 zone de température pour les altcoins seulement, F12 deux horizons', () => {
    expect(keys(ctx(mk(up(300)), { temperature: 15 }))).toContain('cand:F8:alt:capitulation');
    expect(keys(ctx(mk(up(300)), { temperature: 15, asset: makeAsset('BTC', mk(up(300))) }))).not.toContain('cand:F8:alt:capitulation');
    const strong = mk(up(300, 100, 0.5));
    const a = ctx(strong);
    expect(has(a, 'cand:F12:')).toBe(a.analysis.trader.tone === 'up');
    expect(has(ctx(mk(down(300))), 'cand:F12:')).toBe(false);
  });
  it('F9 compression puis cassure ; F13 et F14 : plans sur signal haussier seulement', () => {
    const flat = [...up(200), ...Array.from({ length: 80 }, (_, i) => 160 + Math.sin(i) * 0.05), 175];
    const cs = mk(flat, (i, c) => (i === flat.length - 1 ? { high: c.close } : { high: c.close * 1.0003, low: c.close * 0.9997 }));
    expect(has(ctx(cs), 'cand:F9:up')).toBe(true);
    expect(has(ctx(mk(up(300))), 'cand:F9:')).toBe(false);
    const bull = ctx(mk(up(300, 100, 0.5)));
    expect(keys(bull).some((k) => k.startsWith('plan:F13'))).toBe(bull.analysis.trader.tone === 'up');
    expect(keys(ctx(mk(down(300)))).some((k) => k.startsWith('plan:F1'))).toBe(false);
  });
});
