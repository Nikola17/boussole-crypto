// Agrège les positions saisies (journal de transactions) et les wallets suivis, valorisés au prix du marché.

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useFx, useMarkets, usePrices } from './useMarket';
import { buildPositions, bucketOf, allocation, type Position } from '../lib/portfolio';
import { getBtcBalance, getEvmBalances, getSolanaHoldings, scanXpub, xpubNote, type WalletHolding, type WalletResult } from '../api/wallets';
import { coveredAccountIds, journalByAccount, journalQty } from '../lib/accounts';
import { isExtendedKey } from '../lib/xpub';
import type { Bucket, WalletAddress } from '../types';

export interface Holding {
  key: string;
  coinId?: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  priceUsd: number | null;
  value: number; // devise d'affichage
  valueUsd: number;
  change24h: number | null;
  cost?: number; // coût d'acquisition de la part qui a un historique (devise d'affichage)
  /** Quantité à laquelle `cost` s'applique (le reste n'a pas d'historique dans le journal). */
  costQty?: number;
  /** Valeur de cette part (sert au calcul de la plus-value). */
  valueWithCost?: number;
  /** Compte (Ledger, Crypto.com…) qui détient cette ligne, quand il est connu. */
  accountName?: string;
  pnl?: number;
  pnlPct?: number;
  realized?: number;
  bucket: Bucket;
  rank: number | null;
  source: 'ledger' | 'wallet';
  walletLabel?: string;
  chain?: string;
}

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
      queryKey: ['wallet', w.id, w.address, w.btcScript ?? '', (w.evmChains ?? []).join(','), (w.customTokens ?? []).length],
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

  const holdings = useMemo(() => {
    const out: Holding[] = [];
    // Journal : la part déjà décrite par la blockchain d'un compte lié est retirée (sinon elle serait comptée deux fois).
    const coveredQty = (coinId: string) => covered.reduce((s, a) => s + journalQty(journal, a, coinId), 0);
    // Quantité du journal à répartir entre les wallets liés pour leur attribuer un coût d'acquisition.
    const budget = new Map<string, number>();
    for (const a of covered) for (const coinId of journal.get(a)?.keys() ?? []) budget.set(`${a}|${coinId}`, journalQty(journal, a, coinId));
    const nameOfAccount = (id: string) => accounts.find((x) => x.id === id)?.name;

    for (const p of positions.values()) {
      if (p.quantity <= 0) continue;
      const qty = Math.max(0, p.quantity - coveredQty(p.coinId));
      if (qty <= 1e-12) continue; // entièrement détenue sur un wallet lié : décrite par les lignes du wallet
      const ratio = qty / p.quantity;
      const m = marketMap.get(p.coinId);
      const priceUsd = m?.current_price ?? extra.data?.[p.coinId]?.usd ?? null;
      const change = m?.price_change_percentage_24h ?? extra.data?.[p.coinId]?.usd_24h_change ?? null;
      const valueUsd = priceUsd != null ? priceUsd * qty : 0;
      const value = valueUsd * rate;
      const cost = (currency === 'EUR' ? p.costEur : p.costUsd) * ratio;
      const holders = [...journal.entries()].filter(([a, coins]) => !covered.includes(a) && (coins.get(p.coinId) ?? 0) > 1e-12).map(([a]) => a);
      out.push({
        key: `l:${p.coinId}`,
        coinId: p.coinId,
        symbol: p.symbol.toUpperCase(),
        name: p.name,
        image: p.image ?? m?.image,
        quantity: qty,
        priceUsd,
        value,
        valueUsd,
        change24h: change,
        cost,
        costQty: qty,
        valueWithCost: value,
        pnl: priceUsd != null ? value - cost : undefined,
        pnlPct: priceUsd != null && cost > 0 ? ((value - cost) / cost) * 100 : undefined,
        realized: currency === 'EUR' ? p.realizedEur : p.realizedUsd,
        bucket: bucketOf(p.coinId, p.symbol, m?.market_cap_rank),
        rank: m?.market_cap_rank ?? null,
        source: 'ledger',
        accountName: holders.length === 1 && holders[0] ? nameOfAccount(holders[0]) : undefined,
      });
    }
    walletData.forEach((d, i) => {
      const w = wallets[i];
      if (!w || !w.includeInTotal || !d) return;
      const acct = accountByWallet.get(w.id);
      const isCovered = !!acct && covered.includes(acct.id);
      for (const h of d.holdings) {
        if (h.valueUsd != null && h.valueUsd < 1) continue; // poussières / spams
        const m = h.coingeckoId ? marketMap.get(h.coingeckoId) : undefined;
        const valueUsd = h.valueUsd ?? 0;
        let cost: number | undefined;
        let costQty: number | undefined;
        if (isCovered && acct && h.coingeckoId) {
          const p = positions.get(h.coingeckoId);
          const key = `${acct.id}|${h.coingeckoId}`;
          const left = budget.get(key) ?? 0;
          const take = Math.min(h.quantity, left);
          budget.set(key, left - take);
          if (p && p.quantity > 0 && take > 0) {
            cost = ((currency === 'EUR' ? p.costEur : p.costUsd) / p.quantity) * take;
            costQty = take;
          }
        }
        const valueWithCost = costQty != null && h.priceUsd != null ? h.priceUsd * costQty * rate : undefined;
        out.push({
          key: `w:${w.id}:${h.chain}:${h.symbol}:${h.tokenAddress ?? ''}`,
          coinId: h.coingeckoId,
          symbol: h.symbol.toUpperCase(),
          name: m?.name ?? h.name,
          image: h.image ?? m?.image,
          quantity: h.quantity,
          priceUsd: h.priceUsd,
          value: valueUsd * rate,
          valueUsd,
          change24h: m?.price_change_percentage_24h ?? null,
          cost,
          costQty,
          valueWithCost,
          pnl: cost != null && valueWithCost != null ? valueWithCost - cost : undefined,
          pnlPct: cost != null && cost > 0 && valueWithCost != null ? ((valueWithCost - cost) / cost) * 100 : undefined,
          bucket: bucketOf(h.coingeckoId ?? '', h.symbol, m?.market_cap_rank ?? null),
          rank: m?.market_cap_rank ?? null,
          source: 'wallet',
          walletLabel: w.label,
          accountName: acct?.name,
          chain: h.chain,
        });
      }
    });
    return out.sort((a, b) => b.value - a.value);
  }, [positions, marketMap, extra.data, walletData, wallets, rate, currency, covered, journal, accounts, accountByWallet]);

  const totals = useMemo(() => {
    const value = holdings.reduce((s, h) => s + h.value, 0);
    // Plus-value : seulement sur la part qui a un coût d'acquisition dans le journal.
    const withCost = holdings.filter((h) => h.cost != null && h.valueWithCost != null);
    const cost = withCost.reduce((s, h) => s + (h.cost ?? 0), 0);
    const ledgerValue = withCost.reduce((s, h) => s + (h.valueWithCost ?? 0), 0);
    let realized = 0;
    for (const p of positions.values()) realized += currency === 'EUR' ? p.realizedEur : p.realizedUsd;
    const change24h = holdings.reduce((s, h) => {
      if (h.change24h == null) return s;
      const prev = h.value / (1 + h.change24h / 100);
      return s + (h.value - prev);
    }, 0);
    return {
      value,
      cost,
      ledgerValue,
      unrealized: ledgerValue - cost,
      unrealizedPct: cost > 0 ? ((ledgerValue - cost) / cost) * 100 : 0,
      realized,
      change24h,
      change24hPct: value - change24h > 0 ? (change24h / (value - change24h)) * 100 : 0,
    };
  }, [holdings, positions, currency]);

  const alloc = useMemo(() => allocation(holdings.map((h) => ({ coinId: h.coinId ?? h.key, symbol: h.symbol, bucket: h.bucket, value: h.value }))), [holdings]);

  const walletsLoading = results.some((r) => r.isLoading);
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
    rate,
    fx,
    currency,
  };
}
