// Tickets d'ordres « À copier aujourd'hui » : agrège les exécutions récentes de tous les autopilotes actifs,
// calcule le montant réel adapté au capital de l'utilisateur, fournit les bornes anti-chase / stop / TP,
// génère les liens directs vers Binance / Crypto.com et rapproche chaque ordre des transactions et trades réels.

import type { Account, PaperDayLog, PaperFill, PaperPortfolio, TradeEntry, Transaction } from '../../types';
import { addDays } from './clock';
import { copySize } from './copy';
import type { TrustVerdict } from './trust';
import { findPlatform, tradeLinkFor } from '../platforms';

export interface CopyTicket {
  id: string;
  portfolioId: string;
  portfolioName: string;
  strategyId: string;
  isTrader: boolean;
  day: string;
  at: string;
  coinId: string;
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  kind: PaperFill['kind'];
  paperUsd: number;
  paperPriceUsd: number;
  suggestedLimitUsd: number;
  maxChaseUsd: number | null;
  suggestedRealUsd: number | null;
  suggestedQty: number | null;
  stopUsd: number | null;
  targetUsd: number | null;
  tpLegs?: PaperFill['tpLegs'];
  trailing?: PaperFill['trailing'];
  reason: string;
  tag?: string;
  status: 'pending' | 'copied';
  /** Trade réel ouvert correspondant (pour clôturer en 1 clic une vente d'autopilote trader). */
  openRealTradeId: string | null;
  binanceUrl: string;
  cryptoComUrl: string;
  fill: PaperFill;
  portfolio: PaperPortfolio;
}

export interface BuildTicketsInput {
  portfolios: PaperPortfolio[];
  days: PaperDayLog[];
  txs: Transaction[];
  trades: TradeEntry[];
  verdicts: Record<string, TrustVerdict | null>;
  realPortfolioUsd: number;
  riskPerTradePct: number;
  today: string;
  /** Nombre de jours récents inclus dans la file (défaut : 2 = aujourd'hui et hier). */
  lookbackDays?: number;
}

export function exchangeLinks(symbol: string): { binanceUrl: string; cryptoComUrl: string } {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return {
    binanceUrl: `https://www.binance.com/fr/trade/${s}_USDC?type=spot`,
    cryptoComUrl: `https://crypto.com/exchange/trade/${s}_USD`,
  };
}

/** Retourne les liens de trading directs pour les comptes CEX/DEX configurés par l'utilisateur (avec Binance & Crypto.com en secours). */
export function tradeLinksForAccounts(symbol: string, accounts: Account[]): { id: string; label: string; url: string }[] {
  const out: { id: string; label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    if (a.kind !== 'exchange' && a.kind !== 'dex') continue;
    const p = findPlatform(a.platformId ?? a.name);
    if (!p || seen.has(p.id)) continue;
    const url = tradeLinkFor(p, symbol);
    if (!url) continue;
    seen.add(p.id);
    out.push({ id: p.id, label: p.name.replace(/\s*\([^)]*\)/g, ''), url });
  }
  const defaults = exchangeLinks(symbol);
  if (!seen.has('binance')) out.push({ id: 'binance', label: 'Binance', url: defaults.binanceUrl });
  if (!seen.has('cryptocom')) out.push({ id: 'cryptocom', label: 'Crypto.com', url: defaults.cryptoComUrl });
  return out.slice(0, 6);
}

const copyKey = (portfolioId: string, day: string, coinId: string, side: 'buy' | 'sell') =>
  `${portfolioId}|${day}|${coinId}|${side}`;

/** Construit la file d'ordres « À copier » triée du plus récent au plus ancien, les ordres en attente en tête. */
export function buildCopyTickets(i: BuildTicketsInput): CopyTicket[] {
  const fromDay = addDays(i.today, -(Math.max(1, i.lookbackDays ?? 2) - 1));
  const activeAutos = new Map(
    i.portfolios
      .filter((p) => p.kind === 'auto' && !p.archived && p.strategyId !== 'dca-btc')
      .map((p) => [p.id, p]),
  );
  if (!activeAutos.size) return [];

  // Index des ordres déjà copiés
  const copiedKeys = new Set<string>();
  for (const t of i.txs) {
    if (!t.copyOf) continue;
    const side = t.type === 'sell' ? 'sell' : 'buy';
    copiedKeys.add(copyKey(t.copyOf.portfolioId, t.copyOf.day, t.copyOf.coinId, side));
  }
  const openCopiedTrades = new Map<string, TradeEntry>();
  for (const tr of i.trades) {
    if (!tr.copyOf) continue;
    copiedKeys.add(copyKey(tr.copyOf.portfolioId, tr.copyOf.day, tr.copyOf.coinId, 'buy'));
    if (tr.status === 'closed' && tr.exitDate) {
      copiedKeys.add(copyKey(tr.copyOf.portfolioId, tr.exitDate.slice(0, 10), tr.copyOf.coinId, 'sell'));
    } else if (tr.status === 'open') {
      openCopiedTrades.set(`${tr.copyOf.portfolioId}|${tr.coinId}`, tr);
    }
  }

  const out: CopyTicket[] = [];
  for (const log of i.days) {
    if (log.day < fromDay || log.day > i.today) continue;
    const p = activeAutos.get(log.portfolioId);
    if (!p) continue;
    const isTrader = p.strategyId !== 'investisseur' && p.strategyId !== 'dca-boussole';
    const verdict = i.verdicts[p.id] ?? null;

    for (let idx = 0; idx < log.fills.length; idx++) {
      const f = log.fills[idx];
      if (f.kind === 'delist') continue;
      const paperUsd = f.quantity * f.priceUsd;
      const stopPct = f.stop != null && f.priceUsd > 0 ? ((f.priceUsd - f.stop) / f.priceUsd) * 100 : null;
      // Si l'autopilote est déjà encourageant/fiable : utilise copySize ; sinon indique une taille prudente de test (2 % plafonné par risque).
      const trustedUsd = verdict ? copySize(verdict, i.realPortfolioUsd, stopPct, i.riskPerTradePct) : null;
      const fallbackUsd = i.realPortfolioUsd > 0
        ? Math.round(Math.min(i.realPortfolioUsd * 0.02, stopPct && stopPct > 0 ? (i.realPortfolioUsd * i.riskPerTradePct) / stopPct : i.realPortfolioUsd * 0.02) * 100) / 100
        : null;
      const suggestedRealUsd = f.side === 'buy' ? (trustedUsd ?? fallbackUsd) : null;
      const suggestedLimitUsd = f.kind === 'limit' ? f.marketUsd : f.side === 'buy' ? f.marketUsd * 1.002 : f.marketUsd * 0.998;
      const maxChaseUsd = f.side === 'buy' ? f.marketUsd * 1.025 : null;
      const suggestedQty = suggestedRealUsd != null && suggestedLimitUsd > 0 ? Math.round((suggestedRealUsd / suggestedLimitUsd) * 1e6) / 1e6 : null;
      const openReal = f.side === 'sell' ? openCopiedTrades.get(`${p.id}|${f.coinId}`) ?? null : null;
      const alreadyCopied = copiedKeys.has(copyKey(p.id, log.day, f.coinId, f.side));
      const links = exchangeLinks(f.symbol);

      out.push({
        id: `${p.id}:${log.day}:${f.coinId}:${f.side}:${idx}`,
        portfolioId: p.id,
        portfolioName: p.name,
        strategyId: p.strategyId ?? '',
        isTrader,
        day: log.day,
        at: f.at,
        coinId: f.coinId,
        symbol: f.symbol,
        name: f.name,
        side: f.side,
        kind: f.kind,
        paperUsd,
        paperPriceUsd: f.marketUsd,
        suggestedLimitUsd,
        maxChaseUsd,
        suggestedRealUsd,
        suggestedQty,
        stopUsd: f.stop ?? null,
        targetUsd: f.target ?? null,
        ...(f.tpLegs?.length ? { tpLegs: f.tpLegs } : {}),
        ...(f.trailing ? { trailing: f.trailing } : {}),
        reason: f.reason,
        ...(f.tag ? { tag: f.tag } : {}),
        status: alreadyCopied ? 'copied' : 'pending',
        openRealTradeId: openReal?.id ?? null,
        ...links,
        fill: f,
        portfolio: p,
      });
    }
  }

  return out.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    // Priorité aux ventes sur positions réellement copiées !
    const aUrg = a.openRealTradeId ? 1 : 0;
    const bUrg = b.openRealTradeId ? 1 : 0;
    if (aUrg !== bUrg) return bUrg - aUrg;
    return b.at.localeCompare(a.at);
  });
}

/** Texte prêt à coller dans le presse-papiers ou Telegram pour exécuter un ticket d'ordre. */
export function formatCopyTicketText(t: CopyTicket): string {
  const verb = t.side === 'buy' ? (t.kind === 'limit' ? 'ACHAT LIMITE' : 'ACHAT') : 'VENTE';
  const lines = [
    `${verb} ${t.symbol.toUpperCase()}/USDC (${t.portfolioName})`,
    `Prix papier : ${t.paperPriceUsd.toFixed(4).replace(/\.?0+$/, '')} $ · Limite suggérée : ${t.suggestedLimitUsd.toFixed(4).replace(/\.?0+$/, '')} $`,
  ];
  if (t.suggestedRealUsd != null) lines.push(`Montant suggéré : ${t.suggestedRealUsd.toFixed(0)} USDC${t.suggestedQty != null ? ` (≈ ${t.suggestedQty} ${t.symbol.toUpperCase()})` : ''}`);
  if (t.maxChaseUsd != null) lines.push(`Ne pas acheter au-dessus de : ${t.maxChaseUsd.toFixed(4).replace(/\.?0+$/, '')} $`);
  if (t.stopUsd != null) lines.push(`Stop-Loss : ${t.stopUsd.toFixed(4).replace(/\.?0+$/, '')} $`);
  if (t.targetUsd != null) lines.push(`Objectif : ${t.targetUsd.toFixed(4).replace(/\.?0+$/, '')} $`);
  if (t.tpLegs?.length) lines.push(`Paliers TP : ${t.tpLegs.map((l) => `${Math.round(l.fraction * 100)} % à ${l.rMultiple}R`).join(' · ')}`);
  if (t.trailing) lines.push(`Trailing stop : ${t.trailing.value}${t.trailing.mode === 'pct' ? ' %' : '× ATR'}`);
  lines.push(`Motif : ${t.reason}`);
  lines.push(`Binance : ${t.binanceUrl}`);
  return lines.join('\n');
}
