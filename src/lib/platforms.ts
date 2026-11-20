// Catalogue canonique des 150 plateformes & portefeuilles compatibles avec Boussole Crypto :
// 50 plateformes centralisées (CEX), 50 protocoles décentralisés (DEX / Perps) et 50 portefeuilles (Wallets).
// Utilisé partout dans l'app : Comptes, Wallets on-chain, Import CSV, Tickets « À copier », DeFi / Yields, Risque de contrepartie et DCA.

import type { AccountKind, WalletChain } from '../types';

export type PlatformCategory = 'cex' | 'dex' | 'wallet';
export type CustodyKind = 'custodial' | 'self-hardware' | 'self-hot' | 'defi';

export interface PlatformInfo {
  id: string;
  name: string;
  aliases?: string[];
  category: PlatformCategory;
  accountKind: AccountKind;
  custody: CustodyKind;
  chains: WalletChain[];
  url: string;
  /** Modèle d'URL de trading direct (remplace `{SYM}` par le ticker majuscule, `{sym}` par le ticker minuscule). */
  tradeUrlTemplate?: string;
  /** Slug DefiLlama Yields pour les protocoles DeFi/DEX. */
  defillamaSlug?: string;
  /** 'native' = détection dédiée ; 'generic' = import CSV universel Boussole. */
  csvMode?: 'native' | 'generic';
  /** Vrai si les soldes peuvent être lus directement sur la blockchain sans clé privée. */
  onchainReadable?: boolean;
  /** Réseaux EVM présélectionnés pour ce wallet/DEX. */
  defaultEvmChains?: string[];
  /** Conseil pratique affiché dans l'interface. */
  note?: string;
}

export const CATEGORY_LABEL: Record<PlatformCategory, string> = {
  cex: 'Centralisées',
  dex: 'Décentralisées',
  wallet: 'Portefeuilles',
};

export const CUSTODY_LABEL: Record<CustodyKind, string> = {
  'self-hardware': 'Self-custody matériel',
  'self-hot': 'Self-custody logiciel',
  defi: 'Décentralisé (DEX / smart-contract)',
  custodial: 'Plateforme centralisée (contrepartie)',
};

export const CHAIN_LABEL: Record<WalletChain, string> = {
  bitcoin: 'Bitcoin',
  evm: 'EVM (Ethereum, Base, Arbitrum…)',
  solana: 'Solana',
  ton: 'TON',
  sui: 'Sui',
  aptos: 'Aptos',
  cosmos: 'Cosmos / Osmosis',
  hyperliquid: 'Hyperliquid',
};

const cex = (
  id: string,
  name: string,
  url: string,
  opts: Partial<Omit<PlatformInfo, 'id' | 'name' | 'category' | 'accountKind' | 'custody' | 'url'>> = {},
): PlatformInfo => ({
  id,
  name,
  category: 'cex',
  accountKind: 'exchange',
  custody: 'custodial',
  chains: [],
  url,
  csvMode: 'generic',
  ...opts,
});

const dex = (
  id: string,
  name: string,
  url: string,
  chains: WalletChain[],
  opts: Partial<Omit<PlatformInfo, 'id' | 'name' | 'category' | 'accountKind' | 'custody' | 'url' | 'chains'>> = {},
): PlatformInfo => ({
  id,
  name,
  category: 'dex',
  accountKind: 'dex',
  custody: 'defi',
  chains,
  url,
  onchainReadable: chains.length > 0,
  csvMode: 'generic',
  ...opts,
});

const wallet = (
  id: string,
  name: string,
  url: string,
  chains: WalletChain[],
  hardware: boolean,
  opts: Partial<Omit<PlatformInfo, 'id' | 'name' | 'category' | 'accountKind' | 'custody' | 'url' | 'chains'>> = {},
): PlatformInfo => ({
  id,
  name,
  category: 'wallet',
  accountKind: hardware ? 'hardware' : 'hot',
  custody: hardware ? 'self-hardware' : 'self-hot',
  chains,
  url,
  onchainReadable: chains.length > 0,
  ...opts,
});

// ------------------------------------------------------------------ 50 Plateformes centralisées (CEX)

export const CEX_PLATFORMS: PlatformInfo[] = [
  cex('binance', 'Binance', 'https://www.binance.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.binance.com/fr/trade/{SYM}_USDC?type=spot',
    note: 'Lecture seule API + import CSV natif + liens directs.',
  }),
  cex('cryptocom', 'Crypto.com', 'https://crypto.com', {
    aliases: ['CDC', 'Crypto.com App', 'Crypto.com Exchange'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://crypto.com/exchange/trade/{SYM}_USD',
    note: 'Import CSV natif détaillé (App & Exchange).',
  }),
  cex('coinbase', 'Coinbase', 'https://www.coinbase.com', {
    aliases: ['Coinbase Advanced'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.coinbase.com/advanced-trade/spot/{SYM}-USDC',
    note: 'Import CSV natif (Transactions & Advanced Trade).',
  }),
  cex('bitget', 'Bitget', 'https://www.bitget.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.bitget.com/spot/{SYM}USDT',
  }),
  cex('bybit', 'Bybit', 'https://www.bybit.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.bybit.com/trade/spot/{SYM}/USDT',
  }),
  cex('okx', 'OKX', 'https://www.okx.com', {
    aliases: ['OKEx'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.okx.com/trade-spot/{sym}-usdt',
  }),
  cex('htx', 'HTX (ex-Huobi)', 'https://www.htx.com', {
    aliases: ['HTX', 'Huobi'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.htx.com/trade/{sym}_usdt',
  }),
  cex('mexc', 'MEXC', 'https://www.mexc.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.mexc.com/exchange/{SYM}_USDT',
  }),
  cex('kucoin', 'KuCoin', 'https://www.kucoin.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.kucoin.com/trade/{SYM}-USDT',
  }),
  cex('gate', 'Gate', 'https://www.gate.io', {
    aliases: ['Gate.io'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.gate.io/trade/{SYM}_USDT',
  }),
  cex('upbit', 'Upbit', 'https://upbit.com', {
    tradeUrlTemplate: 'https://upbit.com/exchange?code=CRIX.UPBIT.USDT-{SYM}',
  }),
  cex('kraken', 'Kraken', 'https://www.kraken.com', {
    aliases: ['Kraken Pro'],
    csvMode: 'native',
    tradeUrlTemplate: 'https://pro.kraken.com/app/trade/{sym}-usd',
    note: 'Import CSV natif (Ledger & Trades).',
  }),
  cex('bitpanda', 'Bitpanda', 'https://www.bitpanda.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.bitpanda.com/en/prices/{sym}',
    note: 'Import CSV natif (historique EUR/USD).',
  }),
  cex('bitvavo', 'Bitvavo', 'https://bitvavo.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://account.bitvavo.com/markets/{SYM}-EUR',
    note: 'Import CSV natif (paires EUR).',
  }),
  cex('bingx', 'BingX', 'https://bingx.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://bingx.com/en/spot/{SYM}USDT/',
  }),
  cex('whitebit', 'WhiteBIT', 'https://whitebit.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://whitebit.com/trade/{SYM}-USDT',
  }),
  cex('bithumb', 'Bithumb', 'https://www.bithumb.com', {
    tradeUrlTemplate: 'https://www.bithumb.com/react/trade/order/{SYM}-KRW',
  }),
  cex('bitfinex', 'Bitfinex', 'https://www.bitfinex.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://trading.bitfinex.com/t/{SYM}:USD',
  }),
  cex('gemini', 'Gemini', 'https://www.gemini.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://exchange.gemini.com/trade/{SYM}USD',
  }),
  cex('bitstamp', 'Bitstamp', 'https://www.bitstamp.net', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.bitstamp.net/markets/{sym}/usd/',
  }),
  cex('bitmart', 'BitMart', 'https://www.bitmart.com', {
    tradeUrlTemplate: 'https://www.bitmart.com/trade/en-US?symbol={SYM}_USDT',
  }),
  cex('lbank', 'LBank', 'https://www.lbank.com', {
    tradeUrlTemplate: 'https://www.lbank.com/trade/{sym}_usdt',
  }),
  cex('coindcx', 'CoinDCX', 'https://coindcx.com', {
    tradeUrlTemplate: 'https://coindcx.com/trade/{SYM}USDT',
  }),
  cex('wazirx', 'WazirX', 'https://wazirx.com', {
    tradeUrlTemplate: 'https://wazirx.com/exchange/{SYM}-USDT',
  }),
  cex('mercado-bitcoin', 'Mercado Bitcoin', 'https://www.mercadobitcoin.com.br'),
  cex('btcturk', 'BtcTurk', 'https://www.btcturk.com', {
    tradeUrlTemplate: 'https://pro.btcturk.com/pro/al-sat/{SYM}_USDT',
  }),
  cex('paribu', 'Paribu', 'https://www.paribu.com'),
  cex('indodax', 'Indodax', 'https://indodax.com', {
    tradeUrlTemplate: 'https://indodax.com/market/{SYM}IDR',
  }),
  cex('bitkub', 'Bitkub', 'https://www.bitkub.com', {
    tradeUrlTemplate: 'https://www.bitkub.com/market/{SYM}',
  }),
  cex('coins-ph', 'Coins.ph', 'https://coins.ph'),
  cex('bitflyer', 'bitFlyer', 'https://bitflyer.com'),
  cex('coincheck', 'Coincheck', 'https://coincheck.com'),
  cex('luno', 'Luno', 'https://www.luno.com'),
  cex('coinspot', 'CoinSpot', 'https://www.coinspot.com.au', {
    tradeUrlTemplate: 'https://www.coinspot.com.au/buy/{sym}',
  }),
  cex('swyftx', 'Swyftx', 'https://swyftx.com'),
  cex('phemex', 'Phemex', 'https://phemex.com', {
    tradeUrlTemplate: 'https://phemex.com/spot/trade/{SYM}USDT',
  }),
  cex('xt', 'XT.com', 'https://www.xt.com', {
    aliases: ['XT'],
    tradeUrlTemplate: 'https://www.xt.com/en/trade/{sym}_usdt',
  }),
  cex('poloniex', 'Poloniex', 'https://poloniex.com', {
    tradeUrlTemplate: 'https://poloniex.com/trade/{SYM}_USDT',
  }),
  cex('coinex', 'CoinEx', 'https://www.coinex.com', {
    tradeUrlTemplate: 'https://www.coinex.com/en/exchange/{sym}-usdt',
  }),
  cex('bitso', 'Bitso', 'https://bitso.com'),
  cex('bitrue', 'Bitrue', 'https://www.bitrue.com', {
    tradeUrlTemplate: 'https://www.bitrue.com/trade/{sym}_usdt',
  }),
  cex('ascendex', 'AscendEX', 'https://ascendex.com', {
    aliases: ['BitMax'],
    tradeUrlTemplate: 'https://ascendex.com/en/cashtrade-basic/spottrading/usdt/{sym}',
  }),
  cex('pionex', 'Pionex', 'https://www.pionex.com', {
    csvMode: 'native',
    tradeUrlTemplate: 'https://www.pionex.com/en/trade/{SYM}_USDT/Manual',
  }),
  cex('zonda', 'Zonda (ex-BitBay)', 'https://zondacrypto.com', {
    aliases: ['Zonda', 'Zondacrypto', 'BitBay'],
  }),
  cex('korbit', 'Korbit', 'https://www.korbit.co.kr'),
  cex('coinone', 'Coinone', 'https://coinone.co.kr'),
  cex('tokocrypto', 'Tokocrypto', 'https://www.tokocrypto.com', {
    tradeUrlTemplate: 'https://www.tokocrypto.com/trade/{SYM}_USDT',
  }),
  cex('bitbank', 'bitbank', 'https://bitbank.cc'),
  cex('probit-global', 'ProBit Global', 'https://www.probit.com', {
    aliases: ['ProBit'],
    tradeUrlTemplate: 'https://www.probit.com/app/exchange/{SYM}-USDT',
  }),
  cex('cex-io', 'CEX.IO', 'https://cex.io', {
    aliases: ['CEXIO'],
    tradeUrlTemplate: 'https://exchange.cex.io/trade/{SYM}-USD',
  }),
];

// ------------------------------------------------------------------ 50 Protocoles décentralisés (DEX / Perps)

export const DEX_PLATFORMS: PlatformInfo[] = [
  dex('uniswap', 'Uniswap', 'https://app.uniswap.org', ['evm'], {
    defillamaSlug: 'uniswap-v3',
    tradeUrlTemplate: 'https://app.uniswap.org/swap',
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
  }),
  dex('pancakeswap', 'PancakeSwap', 'https://pancakeswap.finance', ['evm'], {
    defillamaSlug: 'pancakeswap-amm-v3',
    tradeUrlTemplate: 'https://pancakeswap.finance/swap',
    defaultEvmChains: ['bsc', 'ethereum', 'arbitrum', 'base'],
  }),
  dex('hyperliquid', 'Hyperliquid', 'https://app.hyperliquid.xyz', ['hyperliquid', 'evm'], {
    aliases: ['HL'],
    defillamaSlug: 'hyperliquid',
    tradeUrlTemplate: 'https://app.hyperliquid.xyz/trade/{SYM}',
    note: 'Soldes perps & spot lus directement par adresse publique 0x (API publique, zéro clé).',
  }),
  dex('jupiter', 'Jupiter', 'https://jup.ag', ['solana'], {
    aliases: ['Jup'],
    defillamaSlug: 'jupiter',
    tradeUrlTemplate: 'https://jup.ag/swap/USDC-{SYM}',
  }),
  dex('raydium', 'Raydium', 'https://raydium.io', ['solana'], {
    defillamaSlug: 'raydium-amm',
    tradeUrlTemplate: 'https://raydium.io/swap/',
  }),
  dex('aerodrome', 'Aerodrome', 'https://aerodrome.finance', ['evm'], {
    defillamaSlug: 'aerodrome-slipstream',
    tradeUrlTemplate: 'https://aerodrome.finance/swap',
    defaultEvmChains: ['base'],
  }),
  dex('meteora', 'Meteora', 'https://app.meteora.ag', ['solana'], {
    defillamaSlug: 'meteora-dlmm',
  }),
  dex('aster', 'Aster', 'https://www.asterdex.com', ['evm'], {
    aliases: ['AsterDEX', 'APX'],
    defaultEvmChains: ['bsc', 'arbitrum'],
  }),
  dex('lighter', 'Lighter', 'https://lighter.xyz', ['evm'], {
    defaultEvmChains: ['arbitrum', 'ethereum'],
  }),
  dex('orca', 'Orca', 'https://www.orca.so', ['solana'], {
    defillamaSlug: 'orca-dex',
    tradeUrlTemplate: 'https://www.orca.so/',
  }),
  dex('curve', 'Curve', 'https://curve.fi', ['evm'], {
    aliases: ['Curve Finance'],
    defillamaSlug: 'curve-dex',
    defaultEvmChains: ['ethereum', 'arbitrum', 'optimism', 'polygon'],
  }),
  dex('pumpswap', 'PumpSwap (Pump.fun)', 'https://swap.pump.fun', ['solana'], {
    aliases: ['PumpSwap', 'Pump.fun'],
  }),
  dex('dydx', 'dYdX', 'https://dydx.trade', ['cosmos', 'evm'], {
    tradeUrlTemplate: 'https://dydx.trade/trade/{SYM}-USD',
    note: 'Chaîne Cosmos dYdX lisible en lecture seule (adresse dydx1…).',
  }),
  dex('gmx', 'GMX', 'https://app.gmx.io', ['evm'], {
    defillamaSlug: 'gmx-v2-perps',
    tradeUrlTemplate: 'https://app.gmx.io/#/trade',
    defaultEvmChains: ['arbitrum', 'avalanche'],
  }),
  dex('balancer', 'Balancer', 'https://app.balancer.fi', ['evm'], {
    defillamaSlug: 'balancer-v2',
    defaultEvmChains: ['ethereum', 'arbitrum', 'polygon', 'base'],
  }),
  dex('sushiswap', 'SushiSwap', 'https://www.sushi.com', ['evm'], {
    aliases: ['Sushi'],
    defillamaSlug: 'sushiswap',
    tradeUrlTemplate: 'https://www.sushi.com/swap',
    defaultEvmChains: ['ethereum', 'arbitrum', 'polygon', 'base'],
  }),
  dex('1inch', '1inch', 'https://app.1inch.io', ['evm'], {
    tradeUrlTemplate: 'https://app.1inch.io/',
    defaultEvmChains: ['ethereum', 'arbitrum', 'base', 'bsc', 'polygon'],
  }),
  dex('thorchain', 'THORChain', 'https://thorchain.org', ['bitcoin', 'evm', 'cosmos'], {
    aliases: ['THORSwap'],
  }),
  dex('lfj', 'LFJ (ex-Trader Joe)', 'https://lfj.gg', ['evm'], {
    aliases: ['LFJ', 'Trader Joe', 'Joe'],
    defillamaSlug: 'trader-joe-dex',
    defaultEvmChains: ['avalanche', 'arbitrum', 'bsc'],
  }),
  dex('velodrome', 'Velodrome', 'https://velodrome.finance', ['evm'], {
    defillamaSlug: 'velodrome-v2',
    tradeUrlTemplate: 'https://velodrome.finance/swap',
    defaultEvmChains: ['optimism'],
  }),
  dex('fluid', 'Fluid', 'https://fluid.io', ['evm'], {
    aliases: ['Instadapp Fluid'],
    defillamaSlug: 'fluid-dex',
    defaultEvmChains: ['ethereum', 'arbitrum', 'base', 'polygon'],
  }),
  dex('drift', 'Drift', 'https://app.drift.trade', ['solana'], {
    defillamaSlug: 'drift',
    tradeUrlTemplate: 'https://app.drift.trade/{SYM}-PERP',
  }),
  dex('edgex', 'edgeX', 'https://pro.edgex.exchange', ['evm'], {
    defaultEvmChains: ['ethereum', 'arbitrum'],
  }),
  dex('camelot', 'Camelot', 'https://app.camelot.exchange', ['evm'], {
    defillamaSlug: 'camelot-v3',
    defaultEvmChains: ['arbitrum'],
  }),
  dex('quickswap', 'QuickSwap', 'https://quickswap.exchange', ['evm'], {
    defillamaSlug: 'quickswap-v3',
    defaultEvmChains: ['polygon'],
  }),
  dex('cow-swap', 'CoW Swap', 'https://swap.cow.fi', ['evm'], {
    aliases: ['CoW Protocol'],
    tradeUrlTemplate: 'https://swap.cow.fi/',
    defaultEvmChains: ['ethereum', 'arbitrum', 'base'],
  }),
  dex('0x-matcha', '0x / Matcha', 'https://matcha.xyz', ['evm'], {
    aliases: ['0x', 'Matcha'],
    tradeUrlTemplate: 'https://matcha.xyz/',
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'polygon', 'optimism'],
  }),
  dex('kyberswap', 'KyberSwap', 'https://kyberswap.com', ['evm'], {
    aliases: ['Kyber'],
    tradeUrlTemplate: 'https://kyberswap.com/swap',
    defaultEvmChains: ['ethereum', 'arbitrum', 'polygon', 'base', 'bsc'],
  }),
  dex('velora', 'Velora (ex-ParaSwap)', 'https://app.velora.xyz', ['evm'], {
    aliases: ['Velora', 'ParaSwap'],
    tradeUrlTemplate: 'https://app.velora.xyz/',
    defaultEvmChains: ['ethereum', 'arbitrum', 'base', 'polygon', 'optimism'],
  }),
  dex('ekubo', 'Ekubo', 'https://app.ekubo.org', ['evm'], {
    defillamaSlug: 'ekubo',
    defaultEvmChains: ['ethereum'],
  }),
  dex('ambient', 'Ambient', 'https://ambient.finance', ['evm'], {
    aliases: ['CrocSwap'],
    defillamaSlug: 'ambient',
    defaultEvmChains: ['ethereum'],
  }),
  dex('maverick', 'Maverick', 'https://app.mav.xyz', ['evm'], {
    defillamaSlug: 'maverick-v2',
    defaultEvmChains: ['ethereum', 'base', 'bsc', 'zksync'],
  }),
  dex('dodo', 'DODO', 'https://app.dodoex.io', ['evm'], {
    defillamaSlug: 'dodo',
    defaultEvmChains: ['ethereum', 'bsc', 'arbitrum', 'polygon'],
  }),
  dex('cetus', 'Cetus', 'https://app.cetus.zone', ['sui', 'aptos'], {
    defillamaSlug: 'cetus-amm',
    tradeUrlTemplate: 'https://app.cetus.zone/swap',
  }),
  dex('bluefin', 'Bluefin', 'https://trade.bluefin.io', ['sui'], {
    defillamaSlug: 'bluefin-amm',
    tradeUrlTemplate: 'https://trade.bluefin.io/{SYM}-PERP',
  }),
  dex('thala', 'Thala', 'https://app.thala.fi', ['aptos'], {
    defillamaSlug: 'thala-lsd',
  }),
  dex('ston-fi', 'STON.fi', 'https://app.ston.fi', ['ton'], {
    aliases: ['STONfi'],
    defillamaSlug: 'ston.fi',
    tradeUrlTemplate: 'https://app.ston.fi/swap',
  }),
  dex('dedust', 'DeDust', 'https://dedust.io', ['ton'], {
    defillamaSlug: 'dedust',
    tradeUrlTemplate: 'https://dedust.io/swap',
  }),
  dex('osmosis', 'Osmosis', 'https://app.osmosis.zone', ['cosmos'], {
    defillamaSlug: 'osmosis-dex',
    tradeUrlTemplate: 'https://app.osmosis.zone/',
    note: 'Solde Osmosis (osmo1…) lu directement sur la blockchain Cosmos.',
  }),
  dex('syncswap', 'SyncSwap', 'https://syncswap.xyz', ['evm'], {
    defillamaSlug: 'syncswap',
    defaultEvmChains: ['zksync'],
  }),
  dex('gains-network', 'Gains Network (gTrade)', 'https://gains.trade', ['evm'], {
    aliases: ['gTrade', 'GNS'],
    defillamaSlug: 'gains-network',
    tradeUrlTemplate: 'https://gains.trade/trading',
    defaultEvmChains: ['arbitrum', 'polygon', 'base'],
  }),
  dex('synthetix', 'Synthetix', 'https://www.synthetix.io', ['evm'], {
    aliases: ['SNX'],
    defillamaSlug: 'synthetix',
    defaultEvmChains: ['optimism', 'base', 'ethereum'],
  }),
  dex('apex-protocol', 'ApeX Protocol', 'https://omni.apex.exchange', ['evm'], {
    aliases: ['ApeX', 'ApeX Omni'],
    tradeUrlTemplate: 'https://omni.apex.exchange/trade/{SYM}USDT',
    defaultEvmChains: ['arbitrum', 'ethereum'],
  }),
  dex('aevo', 'Aevo', 'https://app.aevo.xyz', ['evm'], {
    tradeUrlTemplate: 'https://app.aevo.xyz/perpetual/{sym}',
    defaultEvmChains: ['ethereum', 'arbitrum', 'optimism'],
  }),
  dex('woofi', 'WOOFi', 'https://fi.woo.org', ['evm', 'solana'], {
    aliases: ['WOO'],
    defillamaSlug: 'woofi-earn',
    defaultEvmChains: ['arbitrum', 'bsc', 'avalanche', 'optimism', 'base'],
  }),
  dex('shadow', 'Shadow', 'https://www.shadow.so', ['evm'], {
    aliases: ['Shadow Exchange'],
    defillamaSlug: 'shadow-exchange',
    defaultEvmChains: ['sonic'],
  }),
  dex('hashflow', 'Hashflow', 'https://app.hashflow.com', ['evm', 'solana'], {
    defaultEvmChains: ['ethereum', 'arbitrum', 'polygon', 'bsc'],
  }),
  dex('bancor', 'Bancor', 'https://bancor.network', ['evm'], {
    aliases: ['Carbon DeFi'],
    defillamaSlug: 'bancor-v3',
    defaultEvmChains: ['ethereum'],
  }),
  dex('bisq', 'Bisq', 'https://bisq.network', ['bitcoin'], {
    note: 'Échange P2P Bitcoin sans KYC : suivi via adresse BTC ou journal CSV.',
  }),
  dex('spookyswap', 'SpookySwap', 'https://spooky.fi', ['evm'], {
    defillamaSlug: 'spookyswap',
    defaultEvmChains: ['sonic'],
  }),
];

// ------------------------------------------------------------------ 50 Portefeuilles (Wallets)

export const WALLET_PLATFORMS: PlatformInfo[] = [
  wallet('trust-wallet', 'Trust Wallet', 'https://trustwallet.com', ['bitcoin', 'evm', 'solana', 'ton', 'cosmos', 'sui', 'aptos'], false),
  wallet('metamask', 'MetaMask', 'https://metamask.io', ['evm', 'solana'], false, {
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc'],
  }),
  wallet('base-app', 'Base App (ex-Coinbase Wallet)', 'https://www.coinbase.com/wallet', ['evm', 'solana', 'bitcoin'], false, {
    aliases: ['Base App', 'Coinbase Wallet'],
    defaultEvmChains: ['base', 'ethereum', 'arbitrum', 'optimism', 'polygon'],
  }),
  wallet('phantom', 'Phantom', 'https://phantom.app', ['solana', 'evm', 'bitcoin', 'sui'], false, {
    defaultEvmChains: ['ethereum', 'base', 'polygon'],
  }),
  wallet('binance-wallet', 'Binance Wallet', 'https://www.binance.com/en/web3wallet', ['evm', 'solana', 'bitcoin'], false, {
    aliases: ['Binance Web3 Wallet'],
    defaultEvmChains: ['bsc', 'ethereum', 'base', 'arbitrum'],
  }),
  wallet('okx-wallet', 'OKX Wallet', 'https://www.okx.com/web3', ['evm', 'solana', 'bitcoin', 'ton', 'sui', 'aptos', 'cosmos'], false),
  wallet('bitget-wallet', 'Bitget Wallet', 'https://web3.bitget.com', ['evm', 'solana', 'bitcoin', 'ton', 'sui'], false, {
    aliases: ['BitKeep'],
  }),
  wallet('exodus', 'Exodus', 'https://www.exodus.com', ['bitcoin', 'evm', 'solana', 'cosmos'], false),
  wallet('blockchain-defi-wallet', 'Blockchain.com DeFi Wallet', 'https://www.blockchain.com/wallet', ['bitcoin', 'evm'], false, {
    aliases: ['Blockchain.com'],
  }),
  wallet('tonkeeper', 'Tonkeeper', 'https://tonkeeper.com', ['ton'], false, {
    note: 'Colle ton adresse TON (EQ… ou UQ…) pour lire ton solde en direct.',
  }),
  wallet('telegram-ton-wallet', 'Wallet dans Telegram (TON Wallet)', 'https://wallet.tg', ['ton'], false, {
    aliases: ['TON Wallet', 'Telegram Wallet', 'TON Space'],
    note: 'Pour TON Space (self-custody), colle ton adresse TON publique (EQ…/UQ…).',
  }),
  wallet('tokenpocket', 'TokenPocket', 'https://www.tokenpocket.pro', ['evm', 'solana', 'bitcoin', 'ton', 'aptos', 'sui'], false),
  wallet('safepal', 'SafePal', 'https://www.safepal.com', ['bitcoin', 'evm', 'solana', 'ton'], true, {
    note: 'Compatible matériel & app : adresse publique ou xpub Bitcoin.',
  }),
  wallet('atomic-wallet', 'Atomic Wallet', 'https://atomicwallet.io', ['bitcoin', 'evm', 'solana', 'cosmos'], false),
  wallet('ledger', 'Ledger (Ledger Live)', 'https://www.ledger.com', ['bitcoin', 'evm', 'solana', 'cosmos', 'ton', 'sui'], true, {
    aliases: ['Ledger', 'Ledger Live'],
    note: 'Recommandé : colle ta clé publique étendue (xpub/zpub) pour suivre tout ton compte Bitcoin.',
  }),
  wallet('trezor', 'Trezor', 'https://trezor.io', ['bitcoin', 'evm', 'solana'], true, {
    aliases: ['Trezor Suite'],
    note: 'Compatible xpub/zpub Bitcoin (Trezor Suite → Détails du compte) + adresses EVM/Solana.',
  }),
  wallet('tangem', 'Tangem', 'https://tangem.com', ['bitcoin', 'evm', 'solana', 'ton', 'cosmos'], true, {
    note: 'Portefeuille matériel carte NFC : suis chaque adresse publique en lecture seule.',
  }),
  wallet('bitcoin-com-wallet', 'Bitcoin.com Wallet', 'https://wallet.bitcoin.com', ['bitcoin', 'evm'], false),
  wallet('rabby', 'Rabby', 'https://rabby.io', ['evm', 'hyperliquid'], false, {
    aliases: ['Rabby Wallet'],
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche'],
  }),
  wallet('cryptocom-onchain', 'Crypto.com Onchain (ex-DeFi Wallet)', 'https://crypto.com/onchain', ['evm', 'bitcoin', 'cosmos'], false, {
    aliases: ['Crypto.com DeFi Wallet', 'Onchain'],
    defaultEvmChains: ['cronos', 'ethereum', 'base', 'arbitrum'],
  }),
  wallet('imtoken', 'imToken', 'https://token.im', ['evm', 'bitcoin', 'cosmos'], false),
  wallet('rainbow', 'Rainbow', 'https://rainbow.me', ['evm'], false, {
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
  }),
  wallet('zerion', 'Zerion', 'https://zerion.io', ['evm', 'solana'], false, {
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
  }),
  wallet('solflare', 'Solflare', 'https://solflare.com', ['solana'], false),
  wallet('backpack', 'Backpack', 'https://backpack.app', ['solana', 'evm'], false),
  wallet('keplr', 'Keplr', 'https://www.keplr.app', ['cosmos', 'evm'], false, {
    note: 'Colle tes adresses Cosmos (cosmos1…, osmo1…, dydx1…, celestia1…).',
  }),
  wallet('uniswap-wallet', 'Uniswap Wallet', 'https://wallet.uniswap.org', ['evm'], false, {
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
  }),
  wallet('safe', 'Safe (ex-Gnosis Safe)', 'https://app.safe.global', ['evm'], false, {
    aliases: ['Safe', 'Gnosis Safe'],
    defaultEvmChains: ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'],
    note: 'Multisig EVM : colle l’adresse publique du Safe (0x…).',
  }),
  wallet('bybit-wallet', 'Bybit Wallet', 'https://www.bybit.com/web3', ['evm', 'solana', 'ton'], false),
  wallet('gate-wallet', 'Gate Wallet', 'https://www.gate.io/web3', ['evm', 'solana', 'bitcoin', 'ton'], false),
  wallet('coin98', 'Coin98', 'https://coin98.com', ['evm', 'solana', 'cosmos', 'ton'], false),
  wallet('math-wallet', 'Math Wallet', 'https://mathwallet.org', ['evm', 'solana', 'cosmos', 'bitcoin'], false),
  wallet('ronin-wallet', 'Ronin Wallet', 'https://wallet.roninchain.com', ['evm'], false, {
    note: 'Les adresses ronin:… sont converties automatiquement en format EVM 0x.',
  }),
  wallet('brave-wallet', 'Brave Wallet', 'https://brave.com/wallet', ['evm', 'solana', 'bitcoin'], false),
  wallet('xverse', 'Xverse', 'https://www.xverse.app', ['bitcoin'], false, {
    note: 'Suis ton adresse Bitcoin (bc1p / bc1q / 3…) en lecture seule.',
  }),
  wallet('unisat', 'UniSat', 'https://unisat.io', ['bitcoin'], false, {
    note: 'Suis ton adresse Bitcoin (bc1p / bc1q) en lecture seule.',
  }),
  wallet('leather', 'Leather', 'https://leather.io', ['bitcoin'], false, {
    aliases: ['Hiro Wallet'],
    note: 'Suis ton adresse Bitcoin (bc1q / bc1p) en lecture seule.',
  }),
  wallet('electrum', 'Electrum', 'https://electrum.org', ['bitcoin'], false, {
    note: 'Colle ta Master Public Key (zpub/ypub/xpub) depuis Portefeuille → Informations.',
  }),
  wallet('bluewallet', 'BlueWallet', 'https://bluewallet.io', ['bitcoin'], false, {
    note: 'Colle la clé publique étendue (zpub/xpub) depuis les réglages du wallet.',
  }),
  wallet('sparrow', 'Sparrow', 'https://sparrowwallet.com', ['bitcoin'], false, {
    aliases: ['Sparrow Wallet'],
    note: 'Colle le zpub/xpub (onglet Settings → Keystore) pour lire tout le compte BTC.',
  }),
  wallet('slush', 'Slush (ex-Sui Wallet)', 'https://slush.app', ['sui'], false, {
    aliases: ['Slush', 'Sui Wallet'],
    note: 'Colle ton adresse Sui (0x… 64 caractères) pour lire SUI et tes tokens.',
  }),
  wallet('petra', 'Petra', 'https://petra.app', ['aptos'], false, {
    aliases: ['Petra Wallet'],
    note: 'Colle ton adresse Aptos (0x… 64 caractères) et sélectionne le réseau Aptos.',
  }),
  wallet('leap-wallet', 'Leap Wallet', 'https://www.leapwallet.io', ['cosmos'], false, {
    aliases: ['Leap'],
    note: 'Colle tes adresses Cosmos / Osmosis / Celestia / Injective / dYdX.',
  }),
  wallet('magic-eden-wallet', 'Magic Eden Wallet', 'https://wallet.magiceden.io', ['solana', 'bitcoin', 'evm'], false),
  wallet('argent', 'Argent (Ready)', 'https://www.ready.co', ['evm'], false, {
    aliases: ['Argent', 'Ready', 'Argent X'],
    note: 'Compatible EVM ; pour Starknet, suis tes opérations dans le journal de compte.',
  }),
  wallet('zengo', 'Zengo', 'https://zengo.com', ['bitcoin', 'evm', 'solana'], false),
  wallet('guarda', 'Guarda', 'https://guarda.com', ['bitcoin', 'evm', 'solana', 'cosmos'], false),
  wallet('kraken-wallet', 'Kraken Wallet', 'https://www.kraken.com/wallet', ['bitcoin', 'evm', 'solana'], false),
  wallet('keystone', 'Keystone', 'https://keyst.one', ['bitcoin', 'evm', 'solana', 'cosmos', 'sui', 'aptos'], true, {
    aliases: ['Keystone Pro'],
    note: 'Portefeuille matériel air-gapped : compatible xpub Bitcoin + adresses publiques EVM/Solana/Cosmos/Sui.',
  }),
  wallet('talisman', 'Talisman', 'https://www.talisman.xyz', ['evm'], false, {
    note: 'Adresses EVM lues on-chain ; comptes Polkadot/Substrate suivis dans le journal.',
  }),
];

export const ALL_PLATFORMS: PlatformInfo[] = [
  ...CEX_PLATFORMS,
  ...DEX_PLATFORMS,
  ...WALLET_PLATFORMS,
];

export const PLATFORMS_BY_ID: Record<string, PlatformInfo> = Object.fromEntries(
  ALL_PLATFORMS.map((p) => [p.id, p]),
);

const normText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Retrouve une plateforme par son id exact, son nom ou un de ses alias. */
export function findPlatform(idOrName: string | undefined | null): PlatformInfo | null {
  if (!idOrName) return null;
  const trimmed = idOrName.trim();
  if (!trimmed) return null;
  const byId = PLATFORMS_BY_ID[trimmed.toLowerCase()];
  if (byId) return byId;
  const q = normText(trimmed);
  for (const p of ALL_PLATFORMS) {
    if (normText(p.name) === q) return p;
    if (p.aliases?.some((a) => normText(a) === q)) return p;
  }
  // Correspondance partielle si le nom du compte commence par le nom de la plateforme (ex. « Ledger Flex », « Binance Spot »)
  for (const p of ALL_PLATFORMS) {
    const base = normText(p.name.replace(/\s*\([^)]*\)/g, ''));
    if (base.length >= 3 && (q.startsWith(`${base} `) || q === base)) return p;
    if (p.aliases?.some((a) => { const na = normText(a); return na.length >= 3 && (q.startsWith(`${na} `) || q === na); })) return p;
  }
  return null;
}

/** Recherche filtrée par texte (nom, alias, chaîne) et catégorie optionnelle. */
export function searchPlatforms(query: string, category: PlatformCategory | 'all' = 'all'): PlatformInfo[] {
  const pool = category === 'all' ? ALL_PLATFORMS : ALL_PLATFORMS.filter((p) => p.category === category);
  const q = normText(query);
  if (!q) return pool;
  return pool.filter((p) => {
    if (normText(p.name).includes(q)) return true;
    if (p.id.includes(q)) return true;
    if (p.aliases?.some((a) => normText(a).includes(q))) return true;
    if (p.chains.some((c) => c.includes(q) || normText(CHAIN_LABEL[c]).includes(q))) return true;
    return false;
  });
}

/** Déduit la nature de garde (contrepartie vs self-custody) d'un compte. */
export function custodyOfAccount(account: { name: string; kind: AccountKind; platformId?: string }): CustodyKind {
  const p = findPlatform(account.platformId ?? account.name);
  if (p) return p.custody;
  if (account.kind === 'hardware') return 'self-hardware';
  if (account.kind === 'hot') return 'self-hot';
  if (account.kind === 'dex') return 'defi';
  return 'custodial';
}

/** Génère l'URL de trading direct d'une crypto sur une plateforme CEX ou DEX du catalogue. */
export function tradeLinkFor(platformOrId: string | PlatformInfo, symbol: string): string | null {
  const p = typeof platformOrId === 'string' ? findPlatform(platformOrId) : platformOrId;
  if (!p) return null;
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p.tradeUrlTemplate) {
    return p.tradeUrlTemplate.replace(/\{SYM\}/g, clean).replace(/\{sym\}/g, clean.toLowerCase());
  }
  return p.url;
}
