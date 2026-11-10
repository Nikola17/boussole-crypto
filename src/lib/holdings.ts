// Calcul des lignes du portefeuille : journal de transactions + wallets lus sur la blockchain, valorisés au prix du marché.
// Fonction pure (sans réseau ni React) : c'est le calcul qui produit les chiffres affichés partout, il est donc testé.

import type { Account, Bucket, WalletAddress } from '../types';
import type { WalletResult } from '../api/wallets';
import { journalQty } from './accounts';
import { bucketOf, type Position } from './portfolio';

export interface Holding {
  key: string;
  coinId?: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  /** Null : prix indisponible (la valeur affichée est alors 0 mais elle est INCONNUE, pas nulle). */
  priceUsd: number | null;
  value: number; // devise d'affichage
  valueUsd: number;
  change24h: number | null;
  cost?: number; // coût d'acquisition de la part qui a un historique (devise d'affichage)
  /** Quantité à laquelle `cost` s'applique (le reste n'a pas d'historique dans le journal). */
  costQty?: number;
  /** Valeur de cette part (sert au calcul de la plus-value). Absente quand le prix est inconnu. */
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

export interface MarketLite {
  current_price: number;
  price_change_percentage_24h?: number | null;
  market_cap_rank?: number | null;
  image?: string;
  name?: string;
}

export interface HoldingsInput {
  positions: Map<string, Position>;
  markets: Map<string, MarketLite>;
  extraPrices?: Record<string, { usd?: number; usd_24h_change?: number }>;
  /** Un élément par wallet (même ordre que `wallets`) ; null tant que le wallet n'est pas lu. */
  walletData: (WalletResult | null)[];
  wallets: Pick<WalletAddress, 'id' | 'label' | 'includeInTotal'>[];
  accounts: Pick<Account, 'id' | 'name' | 'walletIds'>[];
  /** Comptes dont la blockchain fait foi (tous leurs wallets sont lus). */
  covered: string[];
  journal: Map<string, Map<string, number>>;
  rate: number;
  currency: 'EUR' | 'USD';
}

export function computeHoldings(i: HoldingsInput): Holding[] {
  const { positions, markets, extraPrices, walletData, wallets, accounts, covered, journal, rate, currency } = i;
  const out: Holding[] = [];
  const accountByWallet = new Map<string, { id: string; name: string }>();
  for (const a of accounts) for (const wid of a.walletIds) accountByWallet.set(wid, { id: a.id, name: a.name });
  const nameOfAccount = (id: string) => accounts.find((x) => x.id === id)?.name;

  // Journal : la part déjà décrite par la blockchain d'un compte lié est retirée (sinon elle serait comptée deux fois).
  const coveredQty = (coinId: string) => covered.reduce((s, a) => s + journalQty(journal, a, coinId), 0);
  // Quantité du journal à répartir entre les wallets liés pour leur attribuer un coût d'acquisition.
  const budget = new Map<string, number>();
  for (const a of covered) for (const coinId of journal.get(a)?.keys() ?? []) budget.set(`${a}|${coinId}`, journalQty(journal, a, coinId));

  for (const p of positions.values()) {
    if (p.quantity <= 0) continue;
    const qty = Math.max(0, p.quantity - coveredQty(p.coinId));
    if (qty <= 1e-12) continue; // entièrement détenue sur un wallet lié : décrite par les lignes du wallet
    const ratio = qty / p.quantity;
    const m = markets.get(p.coinId);
    const priceUsd = m?.current_price ?? extraPrices?.[p.coinId]?.usd ?? null;
    const change = m?.price_change_percentage_24h ?? extraPrices?.[p.coinId]?.usd_24h_change ?? null;
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
      // Sans prix, la valeur est inconnue : on ne l'injecte pas dans la plus-value (sinon un « −100 % » apparaîtrait).
      valueWithCost: priceUsd != null ? value : undefined,
      pnl: priceUsd != null ? value - cost : undefined,
      pnlPct: priceUsd != null && cost > 0 ? ((value - cost) / cost) * 100 : undefined,
      realized: currency === 'EUR' ? p.realizedEur : p.realizedUsd,
      bucket: bucketOf(p.coinId, p.symbol, m?.market_cap_rank),
      rank: m?.market_cap_rank ?? null,
      source: 'ledger',
      accountName: holders.length === 1 && holders[0] ? nameOfAccount(holders[0]) : undefined,
    });
  }

  walletData.forEach((d, idx) => {
    const w = wallets[idx];
    if (!w || !w.includeInTotal || !d) return;
    const acct = accountByWallet.get(w.id);
    const isCovered = !!acct && covered.includes(acct.id);
    for (const h of d.holdings) {
      if (h.valueUsd != null && h.valueUsd < 1) continue; // poussières / spams
      // Compte lié dont tous les wallets ne sont pas encore lus : le journal décrit encore cette quantité. Ajouter la ligne du wallet la compterait deux fois.
      if (acct && !isCovered && h.coingeckoId && journalQty(journal, acct.id, h.coingeckoId) > 1e-12) continue;
      const m = h.coingeckoId ? markets.get(h.coingeckoId) : undefined;
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
}

export interface PortfolioTotals {
  value: number;
  cost: number;
  ledgerValue: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  change24h: number;
  change24hPct: number;
  /** Lignes dont le prix est inconnu : leur valeur n'est pas dans le total (il est donc sous-estimé). */
  unpriced: number;
}

export function computeTotals(holdings: Holding[], positions: Map<string, Position>, currency: 'EUR' | 'USD'): PortfolioTotals {
  const value = holdings.reduce((s, h) => s + h.value, 0);
  // Plus-value : seulement sur la part qui a un coût d'acquisition dans le journal ET un prix connu.
  const withCost = holdings.filter((h) => h.cost != null && h.valueWithCost != null);
  const cost = withCost.reduce((s, h) => s + (h.cost ?? 0), 0);
  const ledgerValue = withCost.reduce((s, h) => s + (h.valueWithCost ?? 0), 0);
  let realized = 0;
  for (const p of positions.values()) realized += currency === 'EUR' ? p.realizedEur : p.realizedUsd;
  const change24h = holdings.reduce((s, h) => {
    // Une variation de −100 % (ou moins) rendrait la valeur d'hier infinie : on l'ignore plutôt que de propager NaN/Infinity.
    if (h.change24h == null || !Number.isFinite(h.change24h) || h.change24h <= -99.99) return s;
    const prev = h.value / (1 + h.change24h / 100);
    return Number.isFinite(prev) ? s + (h.value - prev) : s;
  }, 0);
  const prevTotal = value - change24h;
  return {
    value,
    cost,
    ledgerValue,
    unrealized: ledgerValue - cost,
    unrealizedPct: cost > 0 ? ((ledgerValue - cost) / cost) * 100 : 0,
    realized,
    change24h,
    change24hPct: prevTotal > 0 ? (change24h / prevTotal) * 100 : 0,
    unpriced: holdings.filter((h) => h.priceUsd == null && h.quantity > 0).length,
  };
}

export interface CoinLine {
  key: string;
  coinId?: string;
  symbol: string;
  bucket: Bucket;
  value: number;
  valueUsd: number;
  /** Plus-value en % sur la part qui a un coût et un prix connus ; null sinon. */
  pnlPct: number | null;
  /** Où la crypto est détenue (journal, wallets). */
  sources: string[];
}

/**
 * Une ligne par CRYPTO : une même crypto détenue à plusieurs endroits (Ledger + Crypto.com) ne doit compter qu'une fois
 * pour les poids, les limites par ligne et les données transmises à l'IA.
 */
export function aggregateByCoin(holdings: Holding[]): CoinLine[] {
  const map = new Map<string, { line: CoinLine; cost: number; valueWithCost: number; hasCost: boolean }>();
  for (const h of holdings) {
    const key = h.coinId ?? h.key;
    let e = map.get(key);
    if (!e) {
      e = { line: { key, coinId: h.coinId, symbol: h.symbol, bucket: h.bucket, value: 0, valueUsd: 0, pnlPct: null, sources: [] }, cost: 0, valueWithCost: 0, hasCost: false };
      map.set(key, e);
    }
    e.line.value += h.value;
    e.line.valueUsd += h.valueUsd;
    const src = h.source === 'wallet' ? h.walletLabel ?? 'wallet' : h.accountName ?? 'journal';
    if (!e.line.sources.includes(src)) e.line.sources.push(src);
    if (h.cost != null && h.valueWithCost != null) { e.cost += h.cost; e.valueWithCost += h.valueWithCost; e.hasCost = true; }
  }
  return [...map.values()]
    .map((e) => ({ ...e.line, pnlPct: e.hasCost && e.cost > 0 ? ((e.valueWithCost - e.cost) / e.cost) * 100 : null }))
    .sort((a, b) => b.value - a.value);
}
