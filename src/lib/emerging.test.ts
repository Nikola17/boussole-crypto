// Pépites émergentes : les nouvelles paires Solana/Base en traction. Tout est déterministe : la même
// liste de pools donne toujours les mêmes candidats, la même expliquée.

import { describe, expect, it } from 'vitest';
import type { DexPool } from '../api/dex';
import { emergingCandidates, emergingLine } from './emerging';

const pool = (over: Partial<DexPool> = {}): DexPool => ({
  id: 'solana:p1', network: 'solana', poolAddress: 'P', dex: 'raydium',
  name: 'X / USDC', tokenAddress: 'MINT', tokenSymbol: 'X', tokenName: 'Token X',
  priceUsd: 0.001, fdvUsd: null, mcapUsd: null,
  liquidityUsd: 100_000, volume24h: 2_000_000,
  change1h: 5, change6h: 10, change24h: 50,
  buys24h: 900, sells24h: 300, buyers24h: 400, sellers24h: 150,
  createdAt: new Date().toISOString(), ageHours: 30, source: 'new',
  ...over,
});

describe('emergingCandidates', () => {
  it('retient une paire Solana jeune, liquide, active, en pression acheteuse', () => {
    const out = emergingCandidates([pool()]);
    expect(out).toHaveLength(1);
    expect(out[0].traction).toBeGreaterThan(40);
    expect(out[0].reasons.join(' ')).toContain("d'âge");
    expect(out[0].reasons.join(' ')).toContain("d'achats");
  });

  it('écarte ce qui n\'est pas Solana/Base, les stablecoins, les wrappés', () => {
    expect(emergingCandidates([pool({ network: 'eth' })])).toHaveLength(0);
    expect(emergingCandidates([pool({ tokenSymbol: 'USDC' })])).toHaveLength(0);
    expect(emergingCandidates([pool({ tokenName: 'Wrapped X' })])).toHaveLength(0);
  });

  it('écarte : trop vieux, trop peu de liquidité, volume bidon, ventes dominantes, refroidissement', () => {
    expect(emergingCandidates([pool({ ageHours: 8 * 24 })])).toHaveLength(0);
    expect(emergingCandidates([pool({ liquidityUsd: 10_000 })])).toHaveLength(0);
    expect(emergingCandidates([pool({ volume24h: 50_000 })])).toHaveLength(0);
    expect(emergingCandidates([pool({ buys24h: 300, sells24h: 900 })])).toHaveLength(0);
    expect(emergingCandidates([pool({ change24h: -30 })])).toHaveLength(0);
  });

  it('trop peu de transactions : la pression ne se juge pas sur trois ordres', () => {
    expect(emergingCandidates([pool({ buys24h: 20, sells24h: 5 })])).toHaveLength(0);
  });

  it('trie par traction et borne le nombre de candidats', () => {
    const pools = [1, 2, 3].flatMap((i) => [
      pool({ id: `a${i}`, volume24h: 1_500_000 + i * 100_000 }),
      pool({ id: `b${i}`, volume24h: 500_000 }),
    ]);
    const out = emergingCandidates(pools, 2);
    expect(out).toHaveLength(2);
    expect(out[0].traction).toBeGreaterThanOrEqual(out[1].traction);
    expect(out[0].pool.volume24h).toBeGreaterThan(out[1].pool.volume24h);
  });
});

describe('emergingLine (digest du serveur)', () => {
  const cand = emergingCandidates([pool()])[0];

  it('une ligne compacte avec chiffres bruts, sans promesse', () => {
    const line = emergingLine(cand, { security: 'scan : plutôt sain' });
    expect(line).toContain('X (Solana, 1 j d\'âge, vol 2.0 M $');
    expect(line).toContain('% d\'achats (24 h)');
    expect(line).toContain('scan : plutôt sain');
  });

  it('le wallet suivi qui y est entré est nommé, sinon rien de suggéré', () => {
    expect(emergingLine(cand, { wallets: ['Fonds Test'] })).toContain('— wallet suivi : Fonds Test');
    expect(emergingLine(cand, { wallets: [] })).not.toContain('wallet suivi');
    expect(emergingLine(cand)).not.toContain('wallet suivi');
  });
});
