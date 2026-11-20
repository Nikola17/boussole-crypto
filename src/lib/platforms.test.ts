import { describe, expect, it } from 'vitest';
import {
  ALL_PLATFORMS, CEX_PLATFORMS, custodyOfAccount, DEX_PLATFORMS, findPlatform,
  searchPlatforms, tradeLinkFor, WALLET_PLATFORMS,
} from './platforms';

describe('platforms catalog (150 platforms & wallets)', () => {
  it('contains exactly 50 CEX, 50 DEX and 50 Wallets with unique ids', () => {
    expect(CEX_PLATFORMS).toHaveLength(50);
    expect(DEX_PLATFORMS).toHaveLength(50);
    expect(WALLET_PLATFORMS).toHaveLength(50);
    expect(ALL_PLATFORMS).toHaveLength(150);
    const ids = new Set(ALL_PLATFORMS.map((p) => p.id));
    expect(ids.size).toBe(150);
  });

  it('includes every requested CEX, DEX and Wallet name', () => {
    const names = new Set(ALL_PLATFORMS.map((p) => p.name));
    const expected = [
      // 50 CEX
      'Binance', 'Crypto.com', 'Coinbase', 'Bitget', 'Bybit', 'OKX', 'HTX (ex-Huobi)', 'MEXC', 'KuCoin', 'Gate',
      'Upbit', 'Kraken', 'Bitpanda', 'Bitvavo', 'BingX', 'WhiteBIT', 'Bithumb', 'Bitfinex', 'Gemini', 'Bitstamp',
      'BitMart', 'LBank', 'CoinDCX', 'WazirX', 'Mercado Bitcoin', 'BtcTurk', 'Paribu', 'Indodax', 'Bitkub', 'Coins.ph',
      'bitFlyer', 'Coincheck', 'Luno', 'CoinSpot', 'Swyftx', 'Phemex', 'XT.com', 'Poloniex', 'CoinEx', 'Bitso',
      'Bitrue', 'AscendEX', 'Pionex', 'Zonda (ex-BitBay)', 'Korbit', 'Coinone', 'Tokocrypto', 'bitbank', 'ProBit Global', 'CEX.IO',
      // 50 DEX
      'Uniswap', 'PancakeSwap', 'Hyperliquid', 'Jupiter', 'Raydium', 'Aerodrome', 'Meteora', 'Aster', 'Lighter', 'Orca',
      'Curve', 'PumpSwap (Pump.fun)', 'dYdX', 'GMX', 'Balancer', 'SushiSwap', '1inch', 'THORChain', 'LFJ (ex-Trader Joe)', 'Velodrome',
      'Fluid', 'Drift', 'edgeX', 'Camelot', 'QuickSwap', 'CoW Swap', '0x / Matcha', 'KyberSwap', 'Velora (ex-ParaSwap)', 'Ekubo',
      'Ambient', 'Maverick', 'DODO', 'Cetus', 'Bluefin', 'Thala', 'STON.fi', 'DeDust', 'Osmosis', 'SyncSwap',
      'Gains Network (gTrade)', 'Synthetix', 'ApeX Protocol', 'Aevo', 'WOOFi', 'Shadow', 'Hashflow', 'Bancor', 'Bisq', 'SpookySwap',
      // 50 Wallets
      'Trust Wallet', 'MetaMask', 'Base App (ex-Coinbase Wallet)', 'Phantom', 'Binance Wallet', 'OKX Wallet', 'Bitget Wallet', 'Exodus',
      'Blockchain.com DeFi Wallet', 'Tonkeeper', 'Wallet dans Telegram (TON Wallet)', 'TokenPocket', 'SafePal', 'Atomic Wallet',
      'Ledger (Ledger Live)', 'Trezor', 'Tangem', 'Bitcoin.com Wallet', 'Rabby', 'Crypto.com Onchain (ex-DeFi Wallet)', 'imToken',
      'Rainbow', 'Zerion', 'Solflare', 'Backpack', 'Keplr', 'Uniswap Wallet', 'Safe (ex-Gnosis Safe)', 'Bybit Wallet', 'Gate Wallet',
      'Coin98', 'Math Wallet', 'Ronin Wallet', 'Brave Wallet', 'Xverse', 'UniSat', 'Leather', 'Electrum', 'BlueWallet', 'Sparrow',
      'Slush (ex-Sui Wallet)', 'Petra', 'Leap Wallet', 'Magic Eden Wallet', 'Argent (Ready)', 'Zengo', 'Guarda', 'Kraken Wallet',
      'Keystone', 'Talisman',
    ];
    expect(expected).toHaveLength(150);
    for (const name of expected) {
      expect(names.has(name), `Missing platform: ${name}`).toBe(true);
    }
  });

  it('resolves platforms by id, name, alias and prefix', () => {
    expect(findPlatform('Huobi')?.id).toBe('htx');
    expect(findPlatform('Coinbase Wallet')?.id).toBe('base-app');
    expect(findPlatform('Trader Joe')?.id).toBe('lfj');
    expect(findPlatform('ParaSwap')?.id).toBe('velora');
    expect(findPlatform('Gnosis Safe')?.id).toBe('safe');
    expect(findPlatform('Sui Wallet')?.id).toBe('slush');
    expect(findPlatform('Ready')?.id).toBe('argent');
    expect(findPlatform('Ledger Flex')?.id).toBe('ledger');
    expect(findPlatform('Binance Spot')?.id).toBe('binance');
  });

  it('searches by name, alias and chain', () => {
    expect(searchPlatforms('tonkeeper', 'wallet').map((p) => p.id)).toContain('tonkeeper');
    expect(searchPlatforms('sui', 'dex').map((p) => p.id)).toEqual(expect.arrayContaining(['cetus', 'bluefin']));
    expect(searchPlatforms('hyperliquid', 'dex')[0]?.id).toBe('hyperliquid');
  });

  it('classifies custody and builds trade links', () => {
    expect(custodyOfAccount({ name: 'Ledger', kind: 'hardware' })).toBe('self-hardware');
    expect(custodyOfAccount({ name: 'Tangem', kind: 'hardware' })).toBe('self-hardware');
    expect(custodyOfAccount({ name: 'Rabby', kind: 'hot' })).toBe('self-hot');
    expect(custodyOfAccount({ name: 'Hyperliquid', kind: 'dex' })).toBe('defi');
    expect(custodyOfAccount({ name: 'Bybit', kind: 'exchange' })).toBe('custodial');
    expect(tradeLinkFor('bybit', 'sol')).toContain('SOL');
    expect(tradeLinkFor('hyperliquid', 'btc')).toBe('https://app.hyperliquid.xyz/trade/BTC');
  });
});
