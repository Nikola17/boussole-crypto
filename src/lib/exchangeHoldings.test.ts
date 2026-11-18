import { describe, expect, it } from 'vitest';
import { buildExchangeHoldings } from './exchangeHoldings';

describe('buildExchangeHoldings', () => {
  const prices = new Map([['BTCUSDT', 100000], ['SOLUSDT', 200], ['ETHUSDT', 3000]]);
  const bySymbol = new Map([
    ['BTC', { id: 'bitcoin', name: 'Bitcoin', rank: 1 }],
    ['SOL', { id: 'solana', name: 'Solana', rank: 5 }],
  ]);

  it('valorise via la paire USDT et retrouve l’id CoinGecko', () => {
    const h = buildExchangeHoldings([{ asset: 'BTC', free: 0.5, locked: 0.1 }, { asset: 'SOL', free: 10, locked: 0 }], prices, bySymbol);
    expect(h).toHaveLength(2);
    const btc = h.find((x) => x.symbol === 'BTC')!;
    expect(btc.quantity).toBeCloseTo(0.6);
    expect(btc.priceUsd).toBe(100000);
    expect(btc.valueUsd).toBeCloseTo(60000);
    expect(btc.coingeckoId).toBe('bitcoin');
    expect(btc.chain).toBe('Binance');
  });

  it('met les stablecoins à 1 $ et laisse null le prix inconnu (jamais 0)', () => {
    const h = buildExchangeHoldings(
      [{ asset: 'USDC', free: 100, locked: 0 }, { asset: 'XYZNOPE', free: 5, locked: 0 }],
      prices,
      bySymbol,
    );
    expect(h.find((x) => x.symbol === 'USDC')!.priceUsd).toBe(1);
    const xyz = h.find((x) => x.symbol === 'XYZNOPE')!;
    expect(xyz.priceUsd).toBeNull();
    expect(xyz.valueUsd).toBeNull();
    expect(xyz.coingeckoId).toBeUndefined();
  });

  it('trie par valeur décroissante et ignore les soldes nuls', () => {
    const h = buildExchangeHoldings(
      [{ asset: 'BTC', free: 0, locked: 0 }, { asset: 'SOL', free: 1, locked: 0 }, { asset: 'ETH', free: 1, locked: 0 }],
      prices,
      bySymbol,
    );
    expect(h.map((x) => x.symbol)).toEqual(['ETH', 'SOL']);
  });
});
