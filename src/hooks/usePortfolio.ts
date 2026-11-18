// Agrège les positions saisies (journal de transactions) et les wallets suivis, valorisés au prix du marché.

import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useFx, useMarkets, usePrices } from './useMarket';
import { buildPositions, allocation, type Position } from '../lib/portfolio';
import { getBtcBalance, getEvmBalances, getSolanaHoldings, scanXpub, xpubNote, type WalletHolding, type WalletResult } from '../api/wallets';
import { getAllPrices } from '../api/binance';
import { getBinanceAccount } from '../api/binanceAccount';
import { buildExchangeHoldings } from '../lib/exchangeHoldings';
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
    })),
  });
  return { wallets, results };
}

export function usePortfolio() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const markets = useMarkets();
  const { wallets: storeWallets, results: storeResults } = useWalletBalances();

  // Plateformes connectées en lecture seule (Binance) : leurs soldes sont traités comme un « wallet »
  // synthétique — la plateforme fait foi pour le compte, le journal ne sert plus qu'au coût d'acquisition.
  const rawAccounts = useStore((s) => s.accounts);
  const binanceKey = useStore((s) => s.settings.binanceApiKey);
  const binanceSecret = useStore((s) => s.settings.binanceApiSecret);
  const exAccounts = useMemo(() => rawAccounts.filter((a) => a.exchangePlatform === 'binance'), [rawAccounts]);
  const exEnabled = exAccounts.length > 0 && binanceKey.length > 8 && binanceSecret.length > 8;
  const pricesQuery = useQuery({ queryKey: ['binanceAllPrices'], queryFn: getAllPrices, enabled: exEnabled, staleTime: 5 * 60_000, retry: 1 });
  const exQuery = useQuery({
    queryKey: ['binanceAccount', binanceKey.slice(-8)],
    queryFn: () => getBinanceAccount(binanceKey, binanceSecret),
    enabled: exEnabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const bySymbol = useMemo(() => {
    const m = new Map<string, { id: string; name?: string; image?: string; rank?: number | null }>();
    for (const c of markets.data ?? []) m.set(c.symbol.toUpperCase(), { id: c.id, name: c.name, image: c.image, rank: c.market_cap_rank });
    return m;
  }, [markets.data]);
  const exWalletId = (accountId: string) => `exchange:binance:${accountId}`;
  const exWallets = useMemo(
    () => exAccounts.map((a) => ({ id: exWalletId(a.id), label: a.name, includeInTotal: true, chain: 'evm', address: '' }) as unknown as WalletAddress),
    [exAccounts],
  );
  const accounts = useMemo(
    () => rawAccounts.map((a) => (a.exchangePlatform ? { ...a, walletIds: [exWalletId(a.id)] } : a)),
    [rawAccounts],
  );
  const exResults = useMemo(
    () => exAccounts.map((a) => {
      const holdings = exQuery.data && pricesQuery.data ? buildExchangeHoldings(exQuery.data, pricesQuery.data, bySymbol) : [];
      const data: WalletResult | null = exEnabled
        ? { walletId: exWalletId(a.id), holdings, totalUsd: holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0), errors: exQuery.error ? [(exQuery.error as Error).message] : [], fetchedAt: Date.now() }
        : null;
      return { isLoading: exEnabled && exQuery.isLoading, isError: exEnabled && exQuery.isError, data };
    }) as unknown as typeof storeResults,
    [exAccounts, exEnabled, exQuery.data, exQuery.isLoading, exQuery.isError, exQuery.error, pricesQuery.data, bySymbol],
  );
  const wallets = useMemo(() => [...storeWallets, ...exWallets], [storeWallets, exWallets]);
  const results = useMemo(() => [...storeResults, ...exResults], [storeResults, exResults]);

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
