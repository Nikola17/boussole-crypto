import { describe, expect, it } from 'vitest';
import { compareRows } from './earnCompare';
import type { EnrichedPool } from '../api/yields';

const pool = (over: Partial<EnrichedPool>): EnrichedPool => ({
  pool: 'p1', project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', apy: 5, tvlUsd: 100_000_000,
  audited: true, stablecoin: true, ilRisk: false, singleExposure: false, ...over,
});

describe('comparateur de rendements', () => {
  it('fusionne Binance + DeFi, triées par APY décroissant, avec gain estimé sur la ligne détenue', () => {
    const rows = compareRows(
      [{ asset: 'USDC', apy: 4.5 }, { asset: 'BTC', apy: 2 }],
      [{ label: 'Aave V3', url: 'https://app.aave.com', list: [pool({ apy: 6.2 }), pool({ symbol: 'WETH/ETH', apy: 3, ilRisk: true, tvlUsd: 2_000_000 })] }],
      { USDC: 1000, BTC: 500 },
    );
    expect(rows[0].asset).toBe('USDC');
    expect(rows[0].apyPct).toBe(6.2);
    expect(rows[0].risk).toBe(1);
    expect(rows[0].gainYearUsd).toBeCloseTo(62);
    // BTC chez Binance : pas un stable → tier 2
    const btc = rows.find((r) => r.asset === 'BTC')!;
    expect(btc.risk).toBe(2);
    expect(btc.gainYearUsd).toBeCloseTo(10);
    // pool LP ilRisk → tier 3
    expect(rows.find((r) => r.asset === 'WETH')!.risk).toBe(3);
  });

  it('ignore les lignes sans APY et gère les sources indisponibles (null)', () => {
    const rows = compareRows(null, [{ label: 'X', list: null }], {});
    expect(rows).toHaveLength(0);
    const rows2 = compareRows([{ asset: 'USDT', apy: null as never }], [], {});
    expect(rows2).toHaveLength(0);
  });
});
