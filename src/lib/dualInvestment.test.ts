import { describe, expect, it } from 'vitest';
import { dualSim, dualScenarioLabel } from './dualInvestment';
import { impermanentLossPct, lpVsHodl } from './impermanentLoss';
import { riskTierOf } from './riskTier';

describe('dual investment', () => {
  it('scénario haussier : on garde la mise + intérêts, APY = APY annoncé', () => {
    const r = dualSim({ amountUsd: 1000, priceNowUsd: 100, strikePct: -10, days: 7, apyPct: 25, priceChangePct: +5 });
    expect(r.strikeUsd).toBeCloseTo(90);
    expect(r.converted).toBe(false);
    expect(r.interestUsd).toBeCloseTo(1000 * 0.25 * (7 / 365));
    expect(r.valueAtScenarioUsd).toBeCloseTo(1000 + r.interestUsd);
    expect(r.effectiveApyPct).toBeCloseTo(25, 5);
    expect(r.pnlPct).toBeGreaterThan(0);
  });

  it('scénario baissier sous le strike : on reçoit l’actif au strike, valeur < mise', () => {
    const r = dualSim({ amountUsd: 1000, priceNowUsd: 100, strikePct: -10, days: 7, apyPct: 25, priceChangePct: -30 });
    expect(r.converted).toBe(true);
    expect(r.qtyIfConverted).toBeCloseTo((1000 + r.interestUsd) / 90);
    // l’actif vaut 70 à l’échéance → valeur = qty × 70, inférieure à la mise
    expect(r.valueAtScenarioUsd).toBeCloseTo(r.qtyIfConverted * 70);
    expect(r.pnlPct).toBeLessThan(0);
    expect(r.effectiveApyPct).toBeLessThan(0);
  });

  it('le label explique le scénario', () => {
    expect(dualScenarioLabel(3)).toContain('monte');
    expect(dualScenarioLabel(-20)).toContain('baisse de 20');
  });
});

describe('perte impermanente', () => {
  it('IL nulle quand le prix ne bouge pas', () => {
    expect(impermanentLossPct(1)).toBe(0);
  });
  it('IL ≈ −5,7 % quand le prix double (ratio 2)', () => {
    expect(impermanentLossPct(2)).toBeCloseTo(-5.7, 1);
  });
  it('IL symétrique : ratio 0,5 = ratio 2', () => {
    expect(impermanentLossPct(0.5)).toBeCloseTo(impermanentLossPct(2), 5);
  });
  it('LP vs HODL : la LP vaut moins que le HODL quand le prix bouge', () => {
    const r = lpVsHodl(1000, 2);
    expect(r.lpUsd).toBeLessThan(r.hodlUsd);
    expect(r.diffPct).toBeLessThan(0);
    const flat = lpVsHodl(1000, 1);
    expect(flat.diffPct).toBe(0);
  });
});

describe('tier de risque', () => {
  it('stablecoin audité, gros TVL, sans IL → 1', () => {
    expect(riskTierOf({ tvlUsd: 50_000_000, audited: true, stablecoin: true })).toBe(1);
  });
  it('TVL < 1 M€ → 3 ; single exposure → 3 ; IL → 3', () => {
    expect(riskTierOf({ tvlUsd: 500_000, audited: true })).toBe(3);
    expect(riskTierOf({ tvlUsd: 50_000_000, audited: true, singleExposure: true })).toBe(3);
    expect(riskTierOf({ tvlUsd: 50_000_000, audited: true, ilRisk: true })).toBe(3);
  });
  it('audité, TVL moyen, sans stable → 2', () => {
    expect(riskTierOf({ tvlUsd: 5_000_000, audited: true })).toBe(2);
  });
});
