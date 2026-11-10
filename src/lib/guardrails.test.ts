import { describe, expect, it } from 'vitest';
import { evmReportFrom, finalize, solanaReportFrom, type GoPlusEvm } from '../api/security';
import { betViolations, DEFAULT_ENVELOPE, envelopeStatus, MIN_POOL_LIQUIDITY_USD, preBuyChecks, type PreBuyInput } from './envelope';

const ADDR = '0xabc0000000000000000000000000000000000001';
const fullClean: GoPlusEvm = {
  is_honeypot: '0', is_open_source: '1', buy_tax: '0', sell_tax: '0', is_mintable: '0', owner_change_balance: '0', hidden_owner: '0', cannot_sell_all: '0',
  holders: [{ percent: '0.05' }], lp_holders: [{ percent: '0.9', is_locked: 1 }], holder_count: '1200',
};
const resp = (d: GoPlusEvm | undefined, code = 1): { code: number; result: Record<string, GoPlusEvm> } => ({ code, result: d ? { [ADDR]: d } : {} });

describe('scan EVM : l’absence de données n’est jamais « Plutôt sain »', () => {
  it('un contrat complet et propre est « Plutôt sain »', () => {
    const r = evmReportFrom(resp(fullClean), ADDR);
    expect(r.verdict).toBe('Plutôt sain');
    expect(r.flags.some((f) => f.label.includes('Aucun piège'))).toBe(true);
  });

  it('une entrée GoPlus vide : « Données insuffisantes », pas de feu vert', () => {
    const r = evmReportFrom(resp({}), ADDR);
    expect(r.verdict).toBe('Données insuffisantes');
    expect(r.flags.some((f) => f.label.includes('Aucun piège'))).toBe(false);
    expect(r.flags[0].label).toContain('Analyse incomplète');
  });

  it('un code de réponse autre que 1 : données insuffisantes, même si les champs sont là', () => {
    expect(evmReportFrom(resp(fullClean, 2), ADDR).verdict).toBe('Données insuffisantes');
  });

  it('is_open_source absent : données insuffisantes (il n’est plus compté « sans risque »)', () => {
    const { is_open_source: _omit, ...rest } = fullClean;
    expect(evmReportFrom(resp(rest), ADDR).verdict).toBe('Données insuffisantes');
  });

  it('un seul avertissement suffit à retirer le feu vert (mint possible, score pourtant 88)', () => {
    const r = evmReportFrom(resp({ ...fullClean, is_mintable: '1' }), ADDR);
    expect(r.score).toBe(88);
    expect(r.verdict).toBe('Prudence');
  });

  it('un danger reste un danger, même avec des données incomplètes', () => {
    expect(evmReportFrom(resp({ is_honeypot: '1' }), ADDR).verdict).toBe('Danger');
  });

  it('liquidité verrouillée sous 30 % : danger (rug pull classique)', () => {
    const r = evmReportFrom(resp({ ...fullClean, lp_holders: [{ percent: '0.1', is_locked: 1 }, { percent: '0.9', is_locked: 0 }] }), ADDR);
    expect(r.verdict).toBe('Danger');
    expect(r.flags.find((f) => f.label.includes('Liquidité'))?.severity).toBe('danger');
  });

  it('token inconnu de GoPlus : erreur explicite, jamais un rapport vide', () => {
    expect(() => evmReportFrom(resp(undefined), ADDR)).toThrow('GoPlus ne connaît pas');
    expect(() => evmReportFrom(null, ADDR)).toThrow();
  });
});

describe('scan Solana : sources manquantes et liquidité verrouillée', () => {
  const cleanGp = { mintable: { status: '0' }, freezable: { status: '0' }, balance_mutable_authority: { status: '0' }, holders: [{ percent: '0.04' }] };
  it('aucune source : erreur, pas de rapport', () => {
    expect(() => solanaReportFrom(null, null)).toThrow('indisponible');
  });
  it('les deux sources, tout propre : « Plutôt sain »', () => {
    expect(solanaReportFrom(cleanGp, { risks: [], lpLockedPct: 95 }).verdict).toBe('Plutôt sain');
  });
  it('une seule source a répondu : au mieux « Prudence »', () => {
    expect(solanaReportFrom(cleanGp, null).verdict).toBe('Prudence');
    expect(solanaReportFrom(null, { risks: [], lpLockedPct: 95 }).verdict).toBe('Prudence');
  });
  it('RugCheck : 0 % de liquidité verrouillée est un danger, 50 % un avertissement', () => {
    expect(solanaReportFrom(cleanGp, { risks: [], lpLockedPct: 0 }).verdict).toBe('Danger');
    expect(solanaReportFrom(cleanGp, { risks: [], lpLockedPct: 50 }).verdict).toBe('Prudence');
  });
  it('autorité de mint active : danger', () => {
    expect(solanaReportFrom({ ...cleanGp, mintable: { status: '1' } }, { risks: [], lpLockedPct: 95 }).verdict).toBe('Danger');
  });
});

describe('finalize : les règles du verdict', () => {
  it('insuffisant ne passe jamais devant un danger, ni devant un avertissement ordinaire', () => {
    expect(finalize([{ label: 'x', severity: 'danger' }], null, null, [], { insufficient: true }).verdict).toBe('Danger');
    expect(finalize([], null, null, [], { insufficient: true }).verdict).toBe('Données insuffisantes');
    expect(finalize([], null, null, []).verdict).toBe('Plutôt sain');
    expect(finalize([{ label: 'w', severity: 'warn' }], null, null, []).verdict).toBe('Prudence');
  });
});

describe('contrôle avant achat DeFi : une donnée manquante bloque', () => {
  const env = { ...DEFAULT_ENVELOPE, enabled: true };
  const status = envelopeStatus([], 10_000, env);
  const base: PreBuyInput = { amountUsd: 20, env, status, liquidityUsd: 200_000, volume24hUsd: 500_000, ageHours: 24 * 30, securityVerdict: 'Plutôt sain', top10Pct: 15 };

  it('tout est connu et conforme : « passe »', () => {
    expect(preBuyChecks(base).verdict).toBe('passe');
  });
  it.each([
    ['scan indisponible', { securityVerdict: null }],
    ['scan à données insuffisantes', { securityVerdict: 'Données insuffisantes' as const }],
    ['liquidité inconnue', { liquidityUsd: null }],
    ['âge inconnu', { ageHours: null }],
    ['concentration inconnue', { top10Pct: null }],
  ])('%s : achat bloqué (« non »)', (_name, patch) => {
    expect(preBuyChecks({ ...base, ...patch }).verdict).toBe('non');
  });
  it('un pool de 1 250 $ ne passe plus pour un achat de 25 $ (plancher absolu)', () => {
    const r = preBuyChecks({ ...base, amountUsd: 25, liquidityUsd: 1_250 });
    expect(r.verdict).toBe('non');
    expect(r.checks.find((c) => c.label.includes('Liquidité minimale'))?.ok).toBe(false);
    expect(preBuyChecks({ ...base, liquidityUsd: MIN_POOL_LIQUIDITY_USD }).verdict).toBe('passe');
  });
  it('un volume inconnu reste seulement une prudence (règle non bloquante)', () => {
    expect(preBuyChecks({ ...base, volume24hUsd: null }).verdict).toBe('prudence');
  });
});

describe('« Ajouter » ne contourne plus l’enveloppe', () => {
  const env = { ...DEFAULT_ENVELOPE, enabled: true, maxPerBuyUsd: 25 };
  it('mise dans les règles : aucune violation', () => {
    expect(betViolations(env, envelopeStatus([], 10_000, env), 20)).toEqual([]);
  });
  it('mise trop grosse, enveloppe pleine, désactivée ou en pause : les raisons sont listées', () => {
    const v = betViolations(env, envelopeStatus([], 10_000, env), 40);
    expect(v.join(' ')).toContain('maximum par achat');
    const full = envelopeStatus([{ id: 'b', date: '2026-11-01', symbol: 'X', name: 'X', costUsd: 300, status: 'open' }], 10_000, env); // plafond 3 % = 300 $
    expect(betViolations(env, full, 20).join(' ')).toContain('place restante');
    expect(betViolations({ ...env, enabled: false }, envelopeStatus([], 10_000, { ...env, enabled: false }), 20)).toContain('l’enveloppe est désactivée');
    const paused = { ...env, pausedUntil: '2999-01-01' };
    expect(betViolations(paused, envelopeStatus([], 10_000, paused), 20).join(' ')).toContain('en pause');
  });
});
