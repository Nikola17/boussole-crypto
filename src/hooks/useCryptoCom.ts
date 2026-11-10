// Badge « disponible sur Crypto.com » : liste publique de l'Exchange + confirmation manuelle dans l'application.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { fetchCryptoComSymbols, readCachedSymbols } from '../api/cryptocom';
import { makeAvailability, statusOf, type CdcStatus } from '../lib/availability';
import { useStore } from '../store/useStore';
import { useMarkets } from './useMarket';

export function useCryptoComListing() {
  const cached = readCachedSymbols();
  return useQuery({
    queryKey: ['cdc-listing'],
    queryFn: fetchCryptoComSymbols,
    staleTime: 24 * 3600_000,
    gcTime: 48 * 3600_000,
    initialData: cached?.symbols,
    initialDataUpdatedAt: cached?.at,
  });
}

type CoinLike = { id: string; symbol: string; market_cap_rank: number | null };
const NONE: CoinLike[] = [];

/** `extra` : autres cryptos à rapprocher de la liste (petites capitalisations de l'écran Pépites, par exemple). */
export function useCryptoCom(extra: CoinLike[] = NONE) {
  const listing = useCryptoComListing();
  const markets = useMarkets();
  const seen = useStore((s) => s.cdcSeen);
  const available = useMemo(() => {
    if (!listing.data) return new Set<string>();
    const byId = new Map<string, CoinLike>();
    for (const c of [...(markets.data ?? []), ...extra]) byId.set(c.id, c);
    return makeAvailability(listing.data, [...byId.values()]);
  }, [listing.data, markets.data, extra]);
  const status = useCallback((id: string): CdcStatus => statusOf(id, available, seen), [available, seen]);
  return { ready: !!listing.data, loading: listing.isLoading, available, status };
}
