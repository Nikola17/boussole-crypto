import { describe, expect, it } from 'vitest';
import { DEFAULT_ENVELOPE, envelopeStatus, pauseEnd, preBuyChecks, type PreBuyInput } from './envelope';
import type { DefiBet, DefiEnvelope } from '../types';

const env: DefiEnvelope = { ...DEFAULT_ENVELOPE, enabled: true };
const bet = (p: Partial<DefiBet> & { id: string; costUsd: number }): DefiBet => ({ date: '2026-11-01', symbol: 'AAA', name: 'Aaa', status: 'open', ...p });
const NOW = new Date(2026, 10, 8);

describe('enveloppe DeFi', () => {
  it('plafond = 3 % du portefeuille ; la place restante tient compte de ce qui est engagé', () => {
    const s = envelopeStatus([bet({ id: '1', costUsd: 50 }), bet({ id: '2', costUsd: 30, valueUsd: 40 })], 5250, env, NOW);
    expect(s.capUsd).toBeCloseTo(157.5);
    expect(s.exposureUsd).toBe(90);
    expect(s.roomUsd).toBeCloseTo(67.5);
  });

  it('perte de l\'enveloppe : seuil de pause à −50 %', () => {
    const lost = envelopeStatus([bet({ id: '1', costUsd: 100, valueUsd: 45 })], 5000, env, NOW);
    expect(lost.pnlPct).toBeCloseTo(-55);
    expect(lost.drawdownHit).toBe(true);
    const ok = envelopeStatus([bet({ id: '1', costUsd: 100, valueUsd: 60 })], 5000, env, NOW);
    expect(ok.drawdownHit).toBe(false);
  });

  it('l\'argent déjà ressorti compte dans le résultat, un pari clos ne pèse plus', () => {
    const s = envelopeStatus([bet({ id: '1', costUsd: 100, status: 'closed', realizedUsd: 150 }), bet({ id: '2', costUsd: 50, valueUsd: 20 })], 5000, env, NOW);
    expect(s.investedUsd).toBe(150);
    expect(s.nowUsd).toBe(170);
    expect(s.exposureUsd).toBe(20);
  });

  it('retirer la mise à ×2, une seule fois', () => {
    const s = envelopeStatus([bet({ id: '1', costUsd: 20, valueUsd: 45 }), bet({ id: '2', costUsd: 20, valueUsd: 45, recovered: true }), bet({ id: '3', costUsd: 20, valueUsd: 30 })], 5000, env, NOW);
    expect(s.takeProfit.map((t) => t.bet.id)).toEqual(['1']);
  });

  it('pause d\'un mois : active jusqu\'à la date, puis les paris anciens ne comptent plus', () => {
    const e = { ...env, pausedUntil: pauseEnd(NOW), windowStart: '2026-12-08' };
    expect(pauseEnd(NOW)).toBe('2026-12-08');
    expect(envelopeStatus([], 5000, e, NOW).paused).toBe(true);
    expect(envelopeStatus([], 5000, e, new Date(2026, 11, 8)).paused).toBe(false);
    const s = envelopeStatus([bet({ id: '1', costUsd: 100, valueUsd: 10, date: '2026-11-01' })], 5000, e, new Date(2026, 11, 9));
    expect(s.investedUsd).toBe(0);
    expect(s.drawdownHit).toBe(false);
  });
});

describe('contrôle avant achat', () => {
  const status = envelopeStatus([], 5250, env, NOW);
  const good: PreBuyInput = { amountUsd: 20, env, status, liquidityUsd: 400_000, volume24hUsd: 900_000, ageHours: 24 * 60, securityVerdict: 'Plutôt sain', top10Pct: 22 };

  it('toutes les règles respectées : « passe »', () => {
    const r = preBuyChecks(good);
    expect(r.verdict).toBe('passe');
    expect(r.checks.every((c) => c.ok === true)).toBe(true);
  });

  it('une règle bloquante (montant, sécurité, liquidité, âge, concentration, enveloppe) : « non »', () => {
    expect(preBuyChecks({ ...good, amountUsd: 60 }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, securityVerdict: 'Danger' }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, liquidityUsd: 500 }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, ageHours: 5 }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, top10Pct: 70 }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, env: { ...env, enabled: false } }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, status: { ...status, paused: true } }).verdict).toBe('non');
  });

  it('des informations limites donnent « prudence » ; une information manquante bloque (« non »)', () => {
    expect(preBuyChecks({ ...good, securityVerdict: 'Prudence' }).verdict).toBe('prudence');
    expect(preBuyChecks({ ...good, ageHours: 24 * 3 }).verdict).toBe('prudence');
    expect(preBuyChecks({ ...good, volume24hUsd: 100 }).verdict).toBe('prudence');
    expect(preBuyChecks({ ...good, securityVerdict: null }).verdict).toBe('non');
    expect(preBuyChecks({ ...good, liquidityUsd: null }).verdict).toBe('non');
  });

  it('plus de place dans l\'enveloppe : « non »', () => {
    const full = envelopeStatus([bet({ id: '1', costUsd: 150 })], 5250, env, NOW);
    expect(preBuyChecks({ ...good, status: full }).verdict).toBe('non');
  });
});
