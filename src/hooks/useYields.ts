// Rendements du moment pour la liste d'options de staking et de prêt (DefiLlama).

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getPoolQuote } from '../api/yields';
import { YIELD_OPTIONS, type YieldQuote } from '../lib/staking';

export function useYields() {
  const results = useQueries({
    queries: YIELD_OPTIONS.map((o) => ({ queryKey: ['yield', o.id], queryFn: () => getPoolQuote(o.id), staleTime: 30 * 60_000 })),
  });
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  const quotes = useMemo(
    () => Object.fromEntries(YIELD_OPTIONS.map((o, i) => [o.id, results[i].data ?? null])) as Record<string, YieldQuote | null>,
    [stamp],
  );
  return { quotes, loading: results.some((r) => r.isLoading), failed: results.every((r) => r.isError) };
}
