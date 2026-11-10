// Agrège les positions saisies (journal de transactions) et les wallets suivis, valorisés au prix du marché.

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useFx, useMarkets, usePrices } from './useMarket';
import { buildPositions, allocation, type Position } from '../lib/portfolio';
import { getBtcBalance, getEvmBalances, getSolanaHoldings, scanXpub, xpubNote, type WalletHolding, type WalletResult } from '../api/wallets';
import { coveredAccountIds, journalByAccount } from '../lib/accounts';
import { computeHoldings, computeTotals } from '../lib/holdings';
import { isExtendedKey } from '../lib/xpub';
import type { WalletAddress } from '../types';

export type { Holding } from '../lib/holdings';

async function fetchWallet(w: WalletAddress): Promise<WalletResult> {
  const errors: string[] = [];
  const notes: string[] = [];
  let holdings: WalletHolding[] = [];
  // Les prix BTC/EVM sont résolus ensuite à partir des données de marché déjà chargées (moins d'appels CoinGecko).
  if (w.chain === 'bitcoin') {
    let q: number;
    if (isExtendedKey(w.address)) {
      const scan = await scanXpub(w.address, w.btcScript ?? 'auto');
      q = scan.sats / 1e8;
      notes.push(xpubNote(scan));
    } else q = await getBtcBalance(w.address);
    holdings = [{ chain: 'Bitcoin', symbol: 'BTC', name: 'Bitcoin', quantity: q, priceUsd: null, valueUsd: null, coingeckoId: 'bitcoin' }];
  } else if (w.chain === 'evm') {
    const { raw, errors: e } = await getEvmBalances(w.address, w.evmChains?.length ? w.evmChains : ['ethereum', 'base', 'arbitrum'], w.customTokens);
    errors.push(...e);
    holdings = raw.map((r) => ({ chain: r.chain, symbol: r.symbol, name: r.symbol, quantity: r.quantity, priceUsd: null, valueUsd: null, coingeckoId: r.coingeckoId, tokenAddress: r.tokenAddress }));
  } else {
    const r = await getSolanaHoldings(w.address);
    errors.push(...r.errors);
    holdings = r.holdings;
  }
  const totalUsd = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  return { walletId: w.id, holdings, totalUsd, errors, notes, fetchedAt: Date.now() };
}

export function useWalletBalances() {
  const wallets = useStore((s) => s.wallets);
  const results = useQueries({
    queries: wallets.map((w) => ({
      queryKey: ['wallet', w.id, w.address, w.btcScript ?? '', (w.evmChains ?? []).join(','), (w.customTokens ?? []).map((t) => `${t.chain}:${t.address}`).join(',')],
      queryFn: () => fetchWallet(w),
      // Une clé publique étendue demande des dizaines de lectures : on la rafraîchit moins souvent.
      staleTime: isExtendedKey(w.address) ? 30 * 60_000 : 5 * 60_000,
      retry: 1,
    })),
  });
  return { wallets, results };
}

export function usePortfolio() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const markets = useMarkets();
  const { wallets, results } = useWalletBalances();

  const positions = useMemo(() => buildPositions(transactions), [transactions]);
  const marketMap = useMemo(() => new Map((markets.data ?? []).map((m) => [m.id, m])), [markets.data]);

  const missingIds = useMemo(() => {
    const ids: string[] = [];
    for (const p of positions.values()) if (p.quantity > 0 && !marketMap.has(p.coinId)) ids.push(p.coinId);
    for (const r of results) for (const h of r.data?.holdings ?? []) if (h.priceUsd == null && h.coingeckoId && !marketMap.has(h.coingeckoId)) ids.push(h.coingeckoId);
    return ids;
  }, [positions, marketMap, results]);
  const extra = usePrices(missingIds);

  /** Soldes des wallets valorisés (prix du marché, sinon prix CoinGecko, sinon prix on-chain). */
  const walletData = useMemo(() => results.map((r) => {
    if (!r.data) return null;
    const holdings = r.data.holdings.map((h) => {
      if (h.priceUsd != null || !h.coingeckoId) return h;
      const price = marketMap.get(h.coingeckoId)?.current_price ?? extra.data?.[h.coingeckoId]?.usd ?? null;
      return price != null ? { ...h, priceUsd: price, valueUsd: price * h.quantity } : h;
    });
    return { ...r.data, holdings, totalUsd: holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0) };
  }), [results, marketMap, extra.data]);

  const rate = currency === 'EUR' ? fx : 1;

  const accounts = useStore((s) => s.accounts);
  const journal = useMemo(() => journalByAccount(transactions), [transactions]);
  const walletLoaded = useMemo(() => walletData.map((d) => !!d), [walletData]);
  /** Comptes dont la blockchain fait foi : leurs quantités viennent des wallets, pas du journal. */
  const covered = useMemo(() => coveredAccountIds(accounts, wallets, walletLoaded), [accounts, wallets, walletLoaded]);
  const accountByWallet = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const a of accounts) for (const wid of a.walletIds) m.set(wid, { id: a.id, name: a.name });
    return m;
  }, [accounts]);

  const holdings = useMemo(() => computeHoldings({
    positions, markets: marketMap, extraPrices: extra.data, walletData, wallets, accounts, covered, journal, rate, currency,
  }), [positions, marketMap, extra.data, walletData, wallets, rate, currency, covered, journal, accounts]);

  const totals = useMemo(() => computeTotals(holdings, positions, currency), [holdings, positions, currency]);

  const alloc = useMemo(() => allocation(holdings.map((h) => ({ coinId: h.coinId ?? h.key, symbol: h.symbol, bucket: h.bucket, value: h.value }))), [holdings]);

  const walletsLoading = results.some((r) => r.isLoading);
  // Au moins un wallet n'a pas pu être lu (erreur réseau, ou erreur sur un de ses tokens) : le portefeuille affiché est partiel.
  const walletsIncomplete = results.some((r) => r.isError || (r.data?.errors.length ?? 0) > 0);
  return {
    holdings,
    totals,
    alloc,
    positions: positions as Map<string, Position>,
    wallets,
    walletResults: results,
    walletData,
    accounts,
    covered,
    journal,
    accountByWallet,
    loading: markets.isLoading || walletsLoading,
    walletsIncomplete,
    rate,
    fx,
    currency,
  };
}
