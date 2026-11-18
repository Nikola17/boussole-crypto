// Convertit les soldes d'une plateforme (Binance) en lignes de portefeuille, comme un wallet suivi :
// prix lus sur les paires USDT de Binance, identifiant CoinGecko quand la crypto est dans le top suivi.

import type { BinanceAsset } from '../api/binanceAccount';
import type { WalletHolding } from '../api/wallets';

const STABLES = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'USDP', 'USDE', 'USTC']);

export interface SymbolInfo {
  id: string;
  name?: string;
  image?: string;
  rank?: number | null;
}

/** Soldes Binance → lignes valorisées (prix Binance si paire USDT trouvée, stablecoins à 1 $). */
export function buildExchangeHoldings(
  assets: BinanceAsset[],
  prices: Map<string, number>,
  bySymbol: Map<string, SymbolInfo>,
): WalletHolding[] {
  const out: WalletHolding[] = [];
  for (const a of assets) {
    const quantity = a.free + a.locked;
    if (quantity <= 0) continue;
    const stable = STABLES.has(a.asset);
    const priceUsd = stable ? 1 : prices.get(`${a.asset}USDT`) ?? prices.get(`${a.asset}BUSD`) ?? null;
    const info = bySymbol.get(a.asset);
    out.push({
      chain: 'Binance',
      symbol: a.asset,
      name: info?.name ?? a.asset,
      image: info?.image,
      quantity,
      priceUsd,
      valueUsd: priceUsd != null ? priceUsd * quantity : null,
      coingeckoId: info?.id,
    });
  }
  return out.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}
