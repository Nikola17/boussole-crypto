import { describe, expect, it } from 'vitest';
import { evaluateCriteria, type CriteriaInput } from './criteria';

const base: CriteriaInput = {
  symbol: 'SUI', rank: 40, marketCapUsd: 3.5e9, volume24hUsd: 280e6, fdvUsd: 8.4e9,
  changes: { d1: -1.2, d7: 3, d30: -9, d200: -13, y1: -59 },
  depth2pctUsd: 514_000, depthWhere: 'Crypto.com', majorListings: ['Binance', 'Coinbase', 'Crypto.com'],
  protocol: null, top10HoldersPct: null, nativeCoin: true, dev: { commits4w: 120, stars: 900 },
};
const get = (i: CriteriaInput, key: string) => evaluateCriteria(i).find((c) => c.key === key)!;

describe('fiche 12 critères', () => {
  it('produit toujours 12 critères numérotés, chacun avec une source', () => {
    const r = evaluateCriteria(base);
    expect(r).toHaveLength(12);
    expect(r.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(r.every((c) => c.label && c.detail && c.source)).toBe(true);
  });

  it('chiffres de SUI : rang, ratio volume/capi, profondeur, FDV', () => {
    expect(get(base, 'cap').status).toBe('ok');
    expect(get(base, 'volcap').value).toBe('8 %');
    expect(get(base, 'volcap').status).toBe('ok');
    expect(get(base, 'depth').status).toBe('ok');
    expect(get(base, 'fdv').value).toBe('×2,4');
    expect(get(base, 'fdv').status).toBe('warn');
    expect(get(base, 'unlocks').value).toContain('58 %');
  });

  it('+60 % en 7 jours : rouge (FOMO)', () => {
    const c = get({ ...base, changes: { ...base.changes, d7: 60 } }, 'changes');
    expect(c.status).toBe('bad');
    expect(c.detail).toContain('FOMO');
  });

  it('micro-capitalisation, volume faible et carnet mince : rouge', () => {
    const risky = { ...base, rank: 800, marketCapUsd: 20e6, volume24hUsd: 100e3, depth2pctUsd: 3_000, majorListings: [] };
    expect(get(risky, 'cap').status).toBe('bad');
    expect(get(risky, 'volcap').status).toBe('bad');
    expect(get(risky, 'depth').status).toBe('bad');
    expect(get(risky, 'listings').status).toBe('bad');
    expect(get(risky, 'risks').status).toBe('bad');
  });

  it('une donnée absente reste « non vérifié » au lieu d\'être inventée', () => {
    const none: CriteriaInput = { ...base, rank: null, marketCapUsd: null, volume24hUsd: null, fdvUsd: null, depth2pctUsd: null, majorListings: null, dev: null, changes: { d1: null, d7: null, d30: null, d200: null, y1: null } };
    for (const k of ['changes', 'cap', 'volcap', 'depth', 'fdv', 'unlocks', 'dev', 'listings', 'social']) expect(get(none, k).status).toBe('unknown');
    expect(get(none, 'depth').value).toBe('—');
  });

  it('protocole et concentration quand les données existent', () => {
    const withData = { ...base, nativeCoin: false, top10HoldersPct: 62, protocol: { tvlUsd: 2e9, fees30dUsd: 5e6, revenue30dUsd: 1e6 } };
    expect(get(withData, 'holders').status).toBe('bad');
    expect(get(withData, 'revenue').status).toBe('ok');
    expect(get({ ...withData, protocol: { tvlUsd: 1e6, fees30dUsd: 0, revenue30dUsd: 0 } }, 'revenue').status).toBe('warn');
  });

  it('les déblocages ne sont jamais présentés comme un calendrier', () => {
    expect(get(base, 'unlocks').detail).toContain('pas un calendrier');
  });
});
