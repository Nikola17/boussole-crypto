// Ce que le runner surveille, et les messages qu'il envoie : alertes de prix et paliers de vente.
// Fonctions pures (testées) — le réseau vit dans main.ts. Mêmes règles que public/runners/alerts.js (Android).
//
// Limitation assumée : les paliers sont recalculés depuis le JOURNAL de l'application (transactions).
// Les wallets lus sur la blockchain (xpub du Ledger, adresse Phantom…) ne sont pas relus par le runner :
// ce que le journal ne décrit pas n'est pas vu, et le cœur (BTC, ETH) n'a de toute façon pas de paliers.

import type { PaperConfig, PaperDayLog, PaperOrder, PaperPortfolio, PaperTrade, PriceAlert, SmartWallet, Thesis, Transaction, WatchedToken } from '../types';
import type { SyncBundle } from '../lib/sync/merge';
import { checkPriceAlerts } from '../lib/alerts';
import { DEFAULT_LADDER, exitLadder, pendingRungs } from '../lib/exit';
import { buildPositions } from '../lib/portfolio';
import { fmtPrice } from '../lib/format';

export interface WatchData {
  alerts: PriceAlert[];
  transactions: Transaction[];
  theses: Thesis[];
  exitDone: Record<string, number[]>;
  /** Portefeuille papier (expérimentations) : ordres fictifs et ses réglages. */
  paperTrades: PaperTrade[];
  paper: PaperConfig | null;
  paperPortfolios: PaperPortfolio[];
  paperOrders: PaperOrder[];
  paperDays: PaperDayLog[];
  /** Wallets publics suivis pour leurs résultats (smart money). */
  smartWallets: SmartWallet[];
  /** Tokens suivis des DEX (pépites) : l'autre liste qui importe au smart money. */
  watchedTokens: WatchedToken[];
  /** Mode vacances du profil : veille critique uniquement jusqu'à cette date (AAAA-MM-JJ, null : aucun). */
  vacationUntil: string | null;
}

/** Extrait les listes utiles d'un faisceau de synchronisation (déjà déchiffré). */
export function watchOf(bundle: SyncBundle): WatchData {
  const list = <T>(k: string): T[] => (Array.isArray(bundle.data[k as keyof typeof bundle.data]) ? (bundle.data[k as keyof typeof bundle.data] as T[]) : []);
  const stamps = bundle.data as Record<string, unknown>;
  const exitDone = (stamps.exitDone && typeof stamps.exitDone === 'object' && !Array.isArray(stamps.exitDone) ? stamps.exitDone : {}) as Record<string, number[]>;
  const paperRaw = stamps.paper;
  const paper = (paperRaw && typeof paperRaw === 'object' && !Array.isArray(paperRaw))
    ? paperRaw as PaperConfig
    : null;
  const profileRaw = stamps.profile as { vacationUntil?: unknown } | undefined;
  const vacationUntil = profileRaw && typeof profileRaw === 'object' && typeof profileRaw.vacationUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(profileRaw.vacationUntil) ? profileRaw.vacationUntil : null;
  return { alerts: list<PriceAlert>('alerts'), transactions: list<Transaction>('transactions'), theses: list<Thesis>('theses'), exitDone, paperTrades: list<PaperTrade>('paperTrades'), paper, paperPortfolios: list<PaperPortfolio>('paperPortfolios'), paperOrders: list<PaperOrder>('paperOrders'), paperDays: list<PaperDayLog>('paperDays'), smartWallets: list<SmartWallet>('smartWallets'), watchedTokens: list<WatchedToken>('watchedTokens'), vacationUntil };
}

export const alertKey = (id: string): string => `alert:${id}`;
export const rungKey = (coinId: string, multiple: number): string => `exit:${coinId}:${multiple}`;

/** Devise d'affichage des messages : EUR (par défaut) via le taux du jour, ou USD. */
export interface MessageCurrency { currency: 'EUR' | 'USD'; eurPerUsd: number }

/** Prix affiché dans la devise de l'utilisateur, pas en dollars bruts. */
export function priceLabel(usd: number, cur: MessageCurrency): string {
  return fmtPrice(cur.currency === 'EUR' ? usd * (cur.eurPerUsd > 0 ? cur.eurPerUsd : 1) : usd, cur.currency);
}

/** Alertes de prix atteintes d'après un jeu de prix connus ; une crypto sans prix n'est jamais considérée atteinte. */
export function hitAlerts(watch: WatchData, prices: ReadonlyMap<string, number>) {
  return checkPriceAlerts(watch.alerts, prices);
}

export function alertMessage(a: PriceAlert, price: number, cur: MessageCurrency): string {
  const side = a.condition === 'above' ? 'au-dessus' : 'en dessous';
  return `Alerte ${a.symbol.toUpperCase()}\n${a.name} est passé ${side} de ${priceLabel(a.priceUsd, cur)} (cours : ${priceLabel(price, cur)}).`;;
}

export interface RungTarget {
  coinId: string;
  symbol: string;
  name: string;
  multiple: number;
  /** Part de la position de départ à vendre (en %). */
  pct: number;
  targetUsd: number;
  /** Valeur de la tranche à vendre au cours actuel. */
  valueUsd: number;
}

/** Paliers de vente atteints et pas encore vendus, au-dessus du seuil où frais et impôt mangent l'intérêt. */
export function hitRungs(watch: WatchData, prices: ReadonlyMap<string, number>): RungTarget[] {
  const out: RungTarget[] = [];
  for (const p of buildPositions(watch.transactions).values()) {
    // Le cœur ne se vend qu'en euphorie (par tranches) : pas de paliers. Les stablecoins non plus.
    if (p.coinId === 'bitcoin' || p.coinId === 'ethereum' || p.symbol.toLowerCase() === 'usdc' || p.symbol.toLowerCase() === 'usdt') continue;
    const price = prices.get(p.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (!(p.quantity > 0) || !(p.costUsd > 0)) continue;
    const thesis = watch.theses.find((t) => t.coinId === p.coinId);
    const steps = thesis?.sellPlan?.length ? thesis.sellPlan : DEFAULT_LADDER;
    const rungs = exitLadder({ avgCostUsd: p.costUsd / p.quantity, priceUsd: price, quantity: p.quantity, steps, doneMultiples: watch.exitDone[p.coinId] ?? [] });
    for (const r of pendingRungs(rungs)) {
      out.push({ coinId: p.coinId, symbol: p.symbol, name: p.name, multiple: r.multiple, pct: r.pct, targetUsd: r.targetPrice, valueUsd: r.valueUsd });
    }
  }
  return out;
}

export function rungMessage(t: RungTarget, cur: MessageCurrency): string {
  return `Palier ×${t.multiple} atteint sur ${t.symbol.toUpperCase()}\nVends ${t.pct} % de ta position de départ : ce palier a été fixé à froid (≈ ${priceLabel(t.valueUsd, cur)} à vendre). Ouvre Boussole.`;
}

/** Le marché a changé de zone (température 0-100) : préviens avec la marche à suivre, même application fermée. */
export function zoneMessage(zone: { label: string; action: string }, temperature: number, previous: string): string {
  return `Le marché change de zone : ${zone.label}\nTempérature ${Math.round(temperature)}/100 (elle était « ${previous} »).\n${zone.action}`;
}

/**
 * Marque des alertes comme déclenchées DANS le faisceau de synchronisation (l'application les verra ainsi à sa
 * propre synchronisation, et ne les re-notifiera pas). Copie complète : le faisceau reçu n'est jamais modifié.
 * Renvoie le même faisceau si rien n'a changé, un nouveau sinon.
 */
export function consumeAlerts(bundle: SyncBundle, alertIds: string[], nowIso: string): SyncBundle {
  if (!alertIds.length) return bundle;
  const alerts = watchOf(bundle).alerts;
  const wanted = new Set(alertIds);
  let changed = false;
  const next = alerts.map((a) => {
    if (!wanted.has(a.id) || a.triggeredAt || !a.active) return a;
    changed = true;
    return { ...a, triggeredAt: nowIso, active: false, updatedAt: nowIso };
  });
  if (!changed) return bundle;
  const data = { ...bundle.data, alerts: next } as typeof bundle.data;
  return { ...bundle, data };
}
