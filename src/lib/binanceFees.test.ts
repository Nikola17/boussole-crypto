import { describe, expect, it } from 'vitest';
import { binanceCostModel, binanceMakerCostModel, binanceMakerPct, binanceTakerPct, clampVip, VIP_TAKER_PCT } from './binanceFees';
import { gridBacktest } from './lab/grid';

describe('frais Binance VIP', () => {
  it('VIP 0 taker = 0,10 %, BNB −25 % → 0,075 %', () => {
    expect(binanceTakerPct(0, false)).toBeCloseTo(0.1);
    expect(binanceTakerPct(0, true)).toBeCloseTo(0.075);
  });
  it('VIP 0 maker = 0,10 %, VIP 5 maker = 0,03 % (0,0225 % avec BNB)', () => {
    expect(binanceMakerPct(0, false)).toBeCloseTo(0.1);
    expect(binanceMakerPct(0, true)).toBeCloseTo(0.075);
    expect(binanceMakerPct(5, false)).toBeCloseTo(0.03);
    expect(binanceMakerPct(5, true)).toBeCloseTo(0.0225);
  });
  it('VIP 9 = 0,03 %', () => {
    expect(binanceTakerPct(9, false)).toBeCloseTo(0.03);
  });
  it('clamp du niveau VIP', () => {
    expect(clampVip(-3)).toBe(0);
    expect(clampVip(42)).toBe(VIP_TAKER_PCT.length - 1);
    expect(clampVip(NaN)).toBe(0);
  });
  it('le modèle de coûts garde l’écart de 0,05 % (taker) et 0 % (maker)', () => {
    expect(binanceCostModel(2, true)).toEqual({ feePct: binanceTakerPct(2, true), spreadPct: 0.05 });
    expect(binanceMakerCostModel(2, true)).toEqual({ feePct: binanceMakerPct(2, true), spreadPct: 0 });
  });
});

describe('backtest de bot grid', () => {
  it('marché haussier fort : le grid vend en montant, sous-performe le HODL mais reste positif', () => {
    const prices = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];
    const r = gridBacktest(prices, { amountUsd: 1000, lower: 90, upper: 210, grids: 12 });
    expect(r.trades).toBeGreaterThan(0);
    expect(r.pnlPct).toBeGreaterThan(0);
    expect(r.hodlPct).toBeCloseTo(100);
    expect(r.vsHodlPts).toBeLessThan(0); // vendre en montant coûte cher quand ça monte droit
    expect(r.inRange).toBe(true);
  });

  it('range (oscillations d’amplitude = un pas de grille) : le grid gagne, le HODL est à 0', () => {
    const prices = [100, 110, 100, 110, 100, 110, 100];
    const r = gridBacktest(prices, { amountUsd: 1000, lower: 90, upper: 120, grids: 3 }); // pas de 10 = amplitude de l’oscillation
    expect(r.trades).toBeGreaterThan(0);
    expect(r.hodlPct).toBeCloseTo(0);
    expect(r.pnlPct).toBeGreaterThan(0); // chaque cycle : vendu à 110, racheté à 100
    expect(r.vsHodlPts).toBeGreaterThan(0);
  });

  it('hors grille : aucun trade, valeur = mise', () => {
    const r = gridBacktest([100, 200, 300], { amountUsd: 1000, lower: 400, upper: 500, grids: 5 });
    expect(r.trades).toBe(0);
    expect(r.pnlPct).toBeCloseTo(100); // 50 % en actif qui a triplé
    expect(r.inRange).toBe(false);
  });

  it('entrées invalides → résultat neutre', () => {
    expect(gridBacktest([], { amountUsd: 1000, lower: 1, upper: 2, grids: 5 }).trades).toBe(0);
    expect(gridBacktest([100, 110], { amountUsd: 0, lower: 1, upper: 2, grids: 5 }).pnlPct).toBe(0);
  });

  it('frais et spread déduits : réduisent strictement le P&L et exposent feesUsd', () => {
    const prices = [100, 110, 100, 110, 100, 110, 100];
    const free = gridBacktest(prices, { amountUsd: 1000, lower: 90, upper: 120, grids: 3 });
    const maker = gridBacktest(prices, { amountUsd: 1000, lower: 90, upper: 120, grids: 3, feePct: 0.075, spreadPct: 0 });
    const heavy = gridBacktest(prices, { amountUsd: 1000, lower: 90, upper: 120, grids: 3, feePct: 2, spreadPct: 0.5 });
    expect(free.feesUsd).toBe(0);
    expect(maker.feesUsd).toBeGreaterThan(0);
    expect(maker.pnlPct).toBeLessThan(free.pnlPct);
    expect(heavy.feesUsd).toBeGreaterThan(maker.feesUsd);
    expect(heavy.pnlPct).toBeLessThan(maker.pnlPct);
  });
});
