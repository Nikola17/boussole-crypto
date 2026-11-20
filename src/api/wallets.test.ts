import { describe, expect, it } from 'vitest';
import {
  detectChain, detectChainCandidates, normalizeWalletAddress,
  parseAptosResources, parseCosmosBalances, parseHyperliquidState, parseSuiBalances, parseTonBalance,
} from './wallets';

describe('multi-chain wallet detection and parsers', () => {
  it('detects Bitcoin, EVM, Ronin, Solana, TON, Sui/Aptos, Cosmos/Osmosis/dYdX and Hyperliquid', () => {
    expect(detectChain('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe('bitcoin');
    expect(detectChain('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe('evm');
    expect(detectChainCandidates('0x742d35Cc6634C0532925a3b844Bc454e4438f44e')).toEqual(['evm', 'hyperliquid']);
    expect(detectChain('ronin:742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe('evm');
    expect(normalizeWalletAddress('ronin:742d35Cc6634C0532925a3b844Bc454e4438f44e')).toBe('0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    expect(detectChain('EQD__________________________________________0vo')).toBe('ton');
    expect(detectChain('UQAvDfWFG0oYX19jwNDNBBL1rKNT9XfaGP9HyTb5nb2Eml6y')).toBe('ton');
    expect(detectChainCandidates(`0x${'a'.repeat(64)}`)).toEqual(['sui', 'aptos']);
    expect(detectChain('osmo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqmcn030')).toBe('cosmos');
    expect(detectChain('cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a')).toBe('cosmos');
    expect(detectChain('dydx1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq89x250')).toBe('cosmos');
    expect(detectChain('So11111111111111111111111111111111111111112')).toBe('solana');
  });

  it('parses TON, Sui, Aptos, Cosmos and Hyperliquid responses cleanly', () => {
    const ton = parseTonBalance({ ok: true, result: '12500000000' });
    expect(ton).toHaveLength(1);
    expect(ton[0].symbol).toBe('TON');
    expect(ton[0].quantity).toBeCloseTo(12.5);

    const sui = parseSuiBalances([
      { coinType: '0x2::sui::SUI', totalBalance: '5000000000' },
      { coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', totalBalance: '250000000' },
    ]);
    expect(sui).toHaveLength(2);
    expect(sui[0].quantity).toBeCloseTo(5);
    expect(sui[1].quantity).toBeCloseTo(250);

    const apt = parseAptosResources([
      { type: '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>', data: { coin: { value: '350000000' } } },
    ]);
    expect(apt).toHaveLength(1);
    expect(apt[0].symbol).toBe('APT');
    expect(apt[0].quantity).toBeCloseTo(3.5);

    const osmo = parseCosmosBalances('osmo', [{ denom: 'uosmo', amount: '42000000' }]);
    expect(osmo).toHaveLength(1);
    expect(osmo[0].symbol).toBe('OSMO');
    expect(osmo[0].quantity).toBeCloseTo(42);

    const hl = parseHyperliquidState(
      { marginSummary: { accountValue: '1500.50' }, assetPositions: [{ position: { coin: 'BTC', szi: '0.02' } }] },
      { balances: [{ coin: 'HYPE', total: '120' }, { coin: 'USDC', total: '300' }] },
    );
    expect(hl.holdings).toHaveLength(3);
    expect(hl.holdings[0].chain).toBe('Hyperliquid Perps');
    expect(hl.holdings[0].valueUsd).toBeCloseTo(1500.5);
    expect(hl.holdings[1].symbol).toBe('HYPE');
    expect(hl.holdings[1].coingeckoId).toBe('hyperliquid');
    expect(hl.notes[0]).toContain('BTC');
  });
});
