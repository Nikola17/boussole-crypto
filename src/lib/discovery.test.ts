// Découverte automatique : le scan choisit, les règles gardent la barrière. Tout est déterministe.

import { describe, expect, it } from 'vitest';
import type { SmallCapInput } from './gems';
import { autoDiscoveryCandidates } from './discovery';

const row = (over: Partial<SmallCapInput> = {}): SmallCapInput => ({
  id: 'some-gem', symbol: 'GEM', name: 'Some Gem',
  marketCap: 60e6, fdv: 80e6, volume24h: 2e6,
  change7d: 12, change30d: 20, athChangePct: -70, rank: 420,
  ...over,
});

describe('autoDiscoveryCandidates', () => {
  it('retient les pépites du scan, classées par score, au plus 5', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row({ id: `g${i}`, symbol: `G${i}`, volume24h: 1e6 + i * 1e6 }));
    const out = autoDiscoveryCandidates(rows, { excluded: new Set(), excludedSymbols: new Set() });
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.length).toBe(5);
    // Le tri est par score décroissant : les candidates se suivent.
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    expect(out[0].coin.coinId).toContain('g');
    expect(out[0].reason).toContain('score');
  });

  it('exclut le cœur du panier (identifiant ou symbole) et ce qui n\'est pas une pépite', () => {
    const rows = [
      row({ id: 'core-coin', symbol: 'CORE' }),
      row({ id: 'other', symbol: 'OTHER', name: 'same' }), // même symbole que le cœur, autre id
      row({ id: 'big', symbol: 'BIG', marketCap: 5e9 }),
      row({ id: 'stable', symbol: 'USDX', change7d: 0, change30d: 0 }),
      row({ id: 'kept', symbol: 'KEPT' }),
    ];
    const out = autoDiscoveryCandidates(rows, { excluded: new Set(['core-coin']), excludedSymbols: new Set(['OTHER']) });
    expect(out.map((p) => p.coin.coinId)).toEqual(['kept']);
  });

  it('déduplique par identifiant (une crypto vue deux fois ne prend pas deux places)', () => {
    const out = autoDiscoveryCandidates([row({ id: 'a', symbol: 'A' }), row({ id: 'a', symbol: 'A' })], { excluded: new Set(), excludedSymbols: new Set() });
    expect(out).toHaveLength(1);
  });
});
