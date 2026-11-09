import { describe, expect, it } from 'vitest';
import { YIELD_OPTIONS, yieldRows } from './staking';

describe('rendement et staking', () => {
  const q = (apy: number | null) => ({ apy, apyBase: apy, tvlUsd: 1e9 });

  it("chaque option a un identifiant de pool unique, des risques et un mode d'emploi", () => {
    expect(new Set(YIELD_OPTIONS.map((o) => o.id)).size).toBe(YIELD_OPTIONS.length);
    for (const o of YIELD_OPTIONS) {
      expect(o.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(o.risks.length).toBeGreaterThan(0);
      expect(o.howTo.length).toBeGreaterThan(20);
    }
  });

  it("calcule le gain annuel à ta taille et juge s'il vaut la peine", () => {
    const lido = YIELD_OPTIONS[0];
    const rows = yieldRows([lido], { [lido.id]: q(2.25) }, { ethereum: 980 }, 11.6);
    expect(rows[0].gainYearUsd).toBeCloseTo(22.05);
    expect(rows[0].verdict).toBe('ok');
    const small = yieldRows([lido], { [lido.id]: q(2.25) }, { ethereum: 100 }, 11.6);
    expect(small[0].verdict).toBe('skip');
  });

  it('sans position ou sans donnée : pas de verdict chiffré', () => {
    const jito = YIELD_OPTIONS.find((o) => o.project === 'Jito')!;
    expect(yieldRows([jito], { [jito.id]: q(5) }, {}, 10)[0].verdict).toBe('none');
    expect(yieldRows([jito], {}, { solana: 500 }, 10)[0].verdict).toBe('unknown');
    expect(yieldRows([jito], { [jito.id]: q(null) }, { solana: 500 }, 10)[0].gainYearUsd).toBeNull();
  });

  it('les options sont rangées par actif détenu (ETH, SOL, HYPE, USDC)', () => {
    expect(new Set(YIELD_OPTIONS.map((o) => o.coinId))).toEqual(new Set(['ethereum', 'solana', 'hyperliquid', 'usd-coin']));
  });
});
