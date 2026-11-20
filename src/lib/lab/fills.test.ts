import { describe, expect, it } from 'vitest';
import { applyIntent, pendingHit, settleBar } from './fills';
import { COSTS, type Book, type Intent } from './types';
import type { Candle } from '../indicators';

const ex = COSTS.exchange;
const bar = (o: number, h: number, l: number, c: number): Candle => ({ time: 0, open: o, high: h, low: l, close: c, volume: 1 });
const buy = (over: Partial<Intent> = {}): Intent => ({ coinId: 'btc', symbol: 'btc', name: 'B', side: 'buy', sizing: { usd: 100 }, reason: 'test', ...over });
const opts = { at: '2024-01-01T08:00:00.000Z', day: '2024-01-01', minOrderUsd: 5 };
const empty = (cash = 1000): Book => ({ cashUsd: cash, positions: {} });

describe('règles d’exécution', () => {
  it('achat de 100 USDC à 100 $ : frais et écart', () => {
    const r = applyIntent(empty(), buy(), 100, ex, opts);
    expect(r.skip).toBeNull();
    expect(r.fill?.priceUsd).toBeCloseTo(100.05, 9);
    expect(r.fill?.feeUsd).toBeCloseTo(0.1, 9);
    expect(r.fill?.quantity).toBeCloseTo(0.99850075, 8);
    expect(r.book.cashUsd).toBeCloseTo(900, 9);
    expect(r.book.positions.btc.costUsd).toBeCloseTo(100, 9);
  });

  it('achat dimensionné par le risque, plafonné', () => {
    const r = applyIntent(empty(), buy({ sizing: { riskUsd: 10, maxUsd: 1000 }, stop: 90, targetR: 2 }), 100, ex, opts);
    expect(r.fill?.quantity).toBeCloseTo(10 / (100.05 - 90), 6);
    expect(r.fill?.stop).toBe(90);
    expect(r.fill?.target).toBeCloseTo(100.05 + 2 * (100.05 - 90), 9);
    const capped = applyIntent(empty(), buy({ sizing: { riskUsd: 10, maxUsd: 50 }, stop: 90 }), 100, ex, opts);
    expect(capped.book.cashUsd).toBeCloseTo(950, 9);
  });

  it('abandons : montant trop petit, prix qui a filé, stop au-dessus du prix, cash insuffisant réduit', () => {
    expect(applyIntent(empty(), buy({ sizing: { usd: 4 } }), 100, ex, opts).skip).toBe('montant trop petit');
    expect(applyIntent(empty(), buy({ skipAbove: 99 }), 100, ex, opts).skip).toBe('le prix a trop bougé depuis la clôture');
    expect(applyIntent(empty(), buy({ sizing: { riskUsd: 10, maxUsd: 100 }, stop: 101 }), 100, ex, opts).skip).toBe('stop au-dessus du prix d’achat');
    const poor = applyIntent(empty(30), buy(), 100, ex, opts);
    expect(poor.book.cashUsd).toBeCloseTo(0, 9);
    expect(poor.fill?.feeUsd).toBeCloseTo(0.03, 9);
    const r = applyIntent(empty(), buy(), 100, ex, opts);
    expect(r.book).not.toBe(empty());
  });

  it('vente totale puis partielle', () => {
    const b = applyIntent(empty(), buy(), 100, ex, opts).book;
    const q = b.positions.btc.quantity;
    const all = applyIntent(b, { coinId: 'btc', symbol: 'btc', name: 'B', side: 'sell', fraction: 1, reason: 'fin' }, 110, ex, opts);
    const proceeds = q * 110 * (1 - 0.0005);
    expect(all.fill?.feeUsd).toBeCloseTo(proceeds * 0.001, 9);
    expect(all.book.cashUsd).toBeCloseTo(900 + proceeds * 0.999, 9);
    expect(all.book.positions.btc).toBeUndefined();
    const half = applyIntent(b, { coinId: 'btc', symbol: 'btc', name: 'B', side: 'sell', fraction: 0.5, reason: 'moitié' }, 110, ex, opts);
    expect(half.book.positions.btc.quantity).toBeCloseTo(q / 2, 7); // quantités arrondies à 8 décimales
    expect(half.book.positions.btc.costUsd).toBeCloseTo(50, 5);
    expect(applyIntent(empty(), { coinId: 'eth', symbol: 'eth', name: 'E', side: 'sell', fraction: 1, reason: 'x' }, 10, ex, opts).skip).toBe('aucune position à vendre');
  });

  it('ordres en attente : touchés dans la bougie, ou trou de cotation à l’ouverture', () => {
    expect(pendingHit('stop', 90, bar(95, 96, 88, 92))).toBe(90);
    expect(pendingHit('stop', 90, bar(85, 87, 80, 86))).toBe(85);
    expect(pendingHit('stop', 90, bar(95, 96, 91, 92))).toBeNull();
    expect(pendingHit('target', 120, bar(125, 130, 124, 128))).toBe(125);
    expect(pendingHit('target', 120, bar(110, 121, 109, 115))).toBe(120);
    expect(pendingHit('limitBuy', 95, bar(100, 101, 94, 99))).toBe(95);
    expect(pendingHit('limitBuy', 95, bar(93, 96, 92, 94))).toBe(93);
  });

  it('stop et objectif dans la même bougie : le stop gagne', () => {
    const b = applyIntent(empty(), buy({ sizing: { usd: 100 }, stop: 90, targetR: 1 }), 100, ex, opts).book;
    const r = settleBar(b, 'btc', bar(100, 130, 80, 100), ex, 'T');
    expect(r.fill?.kind).toBe('stop');
    expect(r.fill?.marketUsd).toBe(90);
    expect(r.fill?.priceUsd).toBeCloseTo(90 * 0.9995, 9);
    expect(r.book.positions.btc).toBeUndefined();
    const t = settleBar(b, 'btc', bar(100, 130, 95, 100), ex, 'T');
    expect(t.fill?.kind).toBe('target');
    expect(settleBar(b, 'btc', bar(100, 101, 99, 100), ex, 'T').fill).toBeNull();
  });

  it('position ouverte dans la bougie : pas de trou de cotation à l’ouverture', () => {
    const b = applyIntent(empty(), buy({ stop: 90 }), 100, ex, opts).book;
    const r = settleBar(b, 'btc', bar(85, 101, 84, 95), ex, 'T', { gapRule: false });
    expect(r.fill?.marketUsd).toBe(90);
  });
  it('stop jugé à la clôture : pas d’exécution en séance', () => {
    const b = applyIntent(empty(), buy({ stop: 90, stopOnClose: true }), 100, ex, opts).book;
    expect(b.positions.btc.stop).toBe(90);
    expect(b.positions.btc.stopOnClose).toBe(true);
    expect(settleBar(b, 'btc', bar(95, 96, 80, 92), ex, 'T').fill).toBeNull();
  });

  it('paliers TP partiels + passage automatique du stop à l’équilibre', () => {
    const b = applyIntent(empty(), buy({
      sizing: { usd: 100 }, stop: 90,
      tpLegs: [{ rMultiple: 1.5, fraction: 0.5, moveStopToBe: true }, { rMultiple: 3, fraction: 0.5 }],
    }), 100, ex, opts).book;
    // TP1 à ~100.05 + 1.5 * 10.05 = 115.125 : touché par la bougie 116
    const r1 = settleBar(b, 'btc', bar(105, 116, 104, 114), ex, 'T1');
    expect(r1.fills).toHaveLength(1);
    expect(r1.fills[0].kind).toBe('target');
    expect(r1.fills[0].tag).toBe('tp:1');
    // Moitié vendue, stop remonté au breakeven (>= 100.05)
    expect(r1.book.positions.btc.quantity).toBeCloseTo(b.positions.btc.quantity / 2, 6);
    expect(r1.book.positions.btc.stop!).toBeGreaterThan(100);
    expect(r1.book.positions.btc.tpLegs![0].done).toBe(true);
    // Retour sous 100 : le stop breakeven coupe la moitié restante sans perte !
    const r2 = settleBar(r1.book, 'btc', bar(104, 105, 98, 99), ex, 'T2');
    expect(r2.fills[0].kind).toBe('stop');
    expect(r2.book.positions.btc).toBeUndefined();
  });

  it('trailing stop : monte après un sommet et protège sans lookahead intra-bougie', () => {
    const b = applyIntent(empty(), buy({
      sizing: { usd: 100 }, stop: 90,
      trailing: { mode: 'pct', value: 5 },
    }), 100, ex, opts).book;
    // Bougie 1 monte à 120 : HWM passe à 120 en fin de bougie → trailing stop devient 114
    const r1 = settleBar(b, 'btc', bar(100, 120, 99, 118), ex, 'T1');
    expect(r1.fills).toHaveLength(0);
    expect(r1.book.positions.btc.highWaterMark).toBe(120);
    expect(r1.book.positions.btc.stop).toBeCloseTo(114, 6);
    // Bougie 2 casse 114 → sortie par trailing stop à 114
    const r2 = settleBar(r1.book, 'btc', bar(118, 119, 112, 113), ex, 'T2');
    expect(r2.fills[0].kind).toBe('stop');
    expect(r2.fills[0].tag).toBe('trailing-stop');
    expect(r2.fills[0].marketUsd).toBeCloseTo(114, 6);
  });

  it('ordre limite maker (asLimit) : écart nul et frais maker', () => {
    const makerCosts = { feePct: 0.1, spreadPct: 0.05, makerFeePct: 0.05 };
    const r = applyIntent(empty(), buy({ sizing: { usd: 100 } }), 100, makerCosts, { ...opts, asLimit: true });
    expect(r.fill?.kind).toBe('limit');
    expect(r.fill?.priceUsd).toBe(100);
    expect(r.fill?.feeUsd).toBeCloseTo(0.05, 9);
  });
});
