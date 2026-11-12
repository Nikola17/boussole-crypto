// Ce que le runner surveille, et les messages qu'il envoie : alertes de prix et paliers de vente.
// Fonctions pures (testées) — le réseau vit dans main.ts. Mêmes règles que public/runners/alerts.js (Android).
//
// Limitation assumée : les paliers sont recalculés depuis le JOURNAL de l'application (transactions).
// Les wallets lus sur la blockchain (xpub du Ledger, adresse Phantom…) ne sont pas relus par le runner :
// ce que le journal ne décrit pas n'est pas vu, et le cœur (BTC, ETH) n'a de toute façon pas de paliers.

import type { PriceAlert, Thesis, Transaction } from '../types';
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
}

/** Extrait les listes utiles d'un faisceau de synchronisation (déjà déchiffré). */
export function watchOf(bundle: SyncBundle): WatchData {
  const list = <T>(k: string): T[] => (Array.isArray(bundle.data[k as keyof typeof bundle.data]) ? (bundle.data[k as keyof typeof bundle.data] as T[]) : []);
  const stamps = bundle.data as Record<string, unknown>;
  const exitDone = (stamps.exitDone && typeof stamps.exitDone === 'object' && !Array.isArray(stamps.exitDone) ? stamps.exitDone : {}) as Record<string, number[]>;
  return { alerts: list<PriceAlert>('alerts'), transactions: list<Transaction>('transactions'), theses: list<Thesis>('theses'), exitDone };
}

export const alertKey = (id: string): string => `alert:${id}`;
export const rungKey = (coinId: string, multiple: number): string => `exit:${coinId}:${multiple}`;

/** Alertes de prix atteintes d'après un jeu de prix connus ; une crypto sans prix n'est jamais considérée atteinte. */
export function hitAlerts(watch: WatchData, prices: ReadonlyMap<string, number>) {
  return checkPriceAlerts(watch.alerts, prices);
}

export function alertMessage(a: PriceAlert, price: number): string {
  const side = a.condition === 'above' ? 'au-dessus' : 'en dessous';
  return `Alerte ${a.symbol.toUpperCase()}\n${a.name} est passé ${side} de ${fmtPrice(a.priceUsd, 'USD')} (cours : ${fmtPrice(price, 'USD')}).`;
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

export function rungMessage(t: RungTarget): string {
  return `Palier ×${t.multiple} atteint sur ${t.symbol.toUpperCase()}\nVends ${t.pct} % de ta position de départ : ce palier a été fixé à froid (≈ ${fmtPrice(t.valueUsd, 'USD')} à vendre). Ouvre Boussole.`;
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
