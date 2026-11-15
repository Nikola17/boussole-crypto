import { describe, expect, it } from 'vitest';
import { RELIABILITY, reliabilityOf, reliabilityPhrase, validateReliability, type ReliabilityEntry } from './reliability';
import { SIGNALS_VERSION } from '../signals';

const entry = (over: Partial<ReliabilityEntry> = {}): ReliabilityEntry => ({
  label: 'Cassure avec volume', bias: 'bull', horizon: 30, days: 2000, episodes: 913, frequencyPct: 2.1,
  hitPct: 55.2, hitLow: 52, hitHigh: 58, medianPct: 4.1, excessMedianPct: 1.2, worstMedianPct: -9,
  baselineHitPct: 48.3, baselineMedianPct: -1, control: { episodes: 300, hitPct: 54, medianPct: 3, baselineHitPct: 47 },
  verdict: 'validé', ...over,
});

describe('table de fiabilité', () => {
  it('phrases affichées', () => {
    expect(reliabilityPhrase(entry(), 2019)).toBe('Depuis 2019 : vu 913 fois. En hausse 30 jours après dans 55 % des cas (un jour quelconque : 48 %). Verdict : validé.');
    expect(reliabilityPhrase(entry({ episodes: 12, verdict: 'trop peu de cas' }), 2019)).toBe('Pas assez de cas pour juger (12 fois depuis 2019).');
    expect(reliabilityPhrase(null, 2019)).toBe('Fiabilité non mesurée.');
    expect(reliabilityPhrase(entry({ expectancyR: 0.123 }), 2019)).toBe('Depuis 2019 : vu 913 fois. Espérance +0,12 R par trade, frais compris. Verdict : validé.');
  });
  it('validation du fichier', () => {
    expect(validateReliability({ rulesVersion: 1 })).toBeNull();
    expect(validateReliability({ generatedAt: '', dataThrough: '', rulesVersion: 1, universe: { assets: 1, from: '2019-01-01', top: 50 }, entries: { 'setup:breakout': entry() } })?.entries['setup:breakout'].episodes).toBe(913);
    expect(validateReliability({ generatedAt: '', dataThrough: '', rulesVersion: 1, universe: { assets: 1, from: '2019-01-01', top: 50 }, entries: { x: { label: 'x' } } })).toBeNull();
  });
  it('garde-fou : la table correspond à la version des signaux', () => {
    expect(RELIABILITY.rulesVersion).toBe(SIGNALS_VERSION);
    expect(reliabilityOf('clé inconnue')).toBeNull();
  });
});

describe('setups peu fiables', () => {
  it('repérés d’après la table embarquée', async () => {
    const { isUnreliable } = await import('./reliability');
    expect(isUnreliable('setup:oversold')).toBe(true); // « Survente + rebond » : sans effet à 30 jours (v2)
    expect(isUnreliable('setup:breakout')).toBe(false); // « Cassure avec volume » : validée
    expect(isUnreliable('setup:inconnu')).toBe(false);
  });
});
