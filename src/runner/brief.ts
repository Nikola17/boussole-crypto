// Brief quotidien du runner : un état des lieux en données (marché, échéances du jour, paliers, alertes armées).
// Ce n'est pas le brief IA de l'application — lui nécessiterait la clé du fournisseur d'IA sur le serveur.
// Fonction pure : reçoit les prix et l'indice de peur déjà lus, renvoie le texte envoyé sur Telegram.

import type { BasketExecution, BasketPlan, DcaExecution, DcaPlan } from '../types';
import type { SyncBundle } from '../lib/sync/merge';
import { hitRungs, watchOf } from './evaluate';
import { isBasketDay, nextBasketOccurrences } from '../lib/basket';
import { isScheduledDay, nextOccurrences, periodKey } from '../lib/dca';
import { buildPositions } from '../lib/portfolio';
import { fmtDate, fmtPct, fmtPrice, isoDay } from '../lib/format';
import type { CoinPrice } from './market';

export interface BriefInputs {
  /** Maintenant, dans le fuseau du serveur (le service doit avoir la même TZ que toi, ex : TZ=Europe/Paris). */
  now: Date;
  bundle: SyncBundle;
  prices: Record<string, CoinPrice>;
  /** Fear & Greed du jour (null : indisponible). */
  fng: { value: number; label: string } | null;
  currency: 'EUR' | 'USD';
  /** Fraîcheur des données synchronisées : quand le fichier distant a-t-il été écrit ? */
  syncSavedAt: string | null;
  syncDevice: string | null;
}

const HEAD_TOP = 3;

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function buildBrief(i: BriefInputs): string {
  const lines: string[] = [];
  const watch = watchOf(i.bundle); // transactions, thèses, alertes, paliers vendus
  const today = isoDay(i.now);
  const cur = i.currency;

  lines.push(`Boussole — brief du ${fmtDate(i.now)}`);

  // Marché : Fear & Greed et Bitcoin.
  const btc = i.prices.bitcoin;
  const market: string[] = [];
  if (i.fng) market.push(`Fear & Greed ${i.fng.value} (${i.fng.label})`);
  if (btc?.usd != null) market.push(`BTC ${fmtPrice(btc.usd, 'USD')}${btc.change != null ? ` (${fmtPct(btc.change, 1, true)} / 24 h)` : ''}`);
  lines.push(market.length ? `Marché : ${market.join(' · ')}` : 'Marché : données indisponibles pour l’instant.');

  // Portefeuille au journal, valorisé aux prix connus (le runner ne relit pas les wallets blockchain).
  const priceOf = (coinId: string): number | null => {
    const p = i.prices[coinId];
    if (!p || typeof p !== 'object') return null;
    const v = cur === 'EUR' ? p.eur : p.usd;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  };
  let total = 0;
  let withoutPrice = 0;
  const rows: { symbol: string; value: number; share: number; change: number | null }[] = [];
  for (const p of buildPositions(watch.transactions).values()) {
    if (!(p.quantity > 0)) continue;
    const price = priceOf(p.coinId);
    if (price == null) { withoutPrice++; continue; }
    total += price * p.quantity;
    rows.push({ symbol: p.symbol, value: price * p.quantity, share: 0, change: i.prices[p.coinId]?.change ?? null });
  }
  rows.sort((a, b) => b.value - a.value);
  for (const r of rows) r.share = total > 0 ? (r.value / total) * 100 : 0;
  if (rows.length) {
    lines.push(`Portefeuille (journal) : ${fmtPrice(total, cur)}${withoutPrice ? ` — ${withoutPrice} ligne${withoutPrice > 1 ? 's' : ''} sans prix connu` : ''}`);
    lines.push(rows.slice(0, HEAD_TOP).map((r) => `${r.symbol.toUpperCase()} ${Math.round(r.share)} %${r.change != null ? ` (${fmtPct(r.change, 1, true)})` : ''}`).join(' · '));
  }

  // Échéances du jour : panier puis plans DCA simples ; sinon, la prochaine à venir.
  const plans = list<DcaPlan>(i.bundle.data.dcaPlans).filter((p) => p.active);
  const dcaExecs = list<DcaExecution>(i.bundle.data.dcaExecutions);
  const baskets = list<BasketPlan>(i.bundle.data.basket).filter((b) => b.active);
  const basketExecs = list<BasketExecution>(i.bundle.data.basketExecutions);
  const due: string[] = [];
  const upcoming: string[] = [];
  for (const b of baskets) {
    if (isBasketDay(b, i.now)) {
      const done = basketExecs.some((e) => e.basketId === b.id && e.periodKey === today);
      due.push(`panier « ${b.name} » ${done ? '(déjà passé aujourd’hui)' : `(${b.amountUsd} USDC)`}`);
    } else {
      const next = nextBasketOccurrences(b, i.now, 1)[0];
      if (next) upcoming.push(`panier « ${b.name} » ${fmtDate(next)}`);
    }
  }
  for (const p of plans) {
    if (isScheduledDay(p, i.now)) {
      // La clé de période d'un plan est celle du cycle (semaine, mois…), pas la date du jour.
      const done = dcaExecs.some((e) => e.planId === p.id && e.periodKey === periodKey(p, i.now));
      due.push(`DCA ${p.name}${done ? ' (déjà passé aujourd’hui)' : ''}`);
    } else {
      const next = nextOccurrences(p, i.now, 1)[0];
      if (next) upcoming.push(`DCA ${p.name} ${fmtDate(next)}`);
    }
  }
  if (due.length) lines.push(`Aujourd’hui : ${due.join(' · ')}`);
  if (upcoming.length) lines.push(`Prochaine échéance : ${upcoming.join(' · ')}`);
  if (!due.length && !upcoming.length) lines.push('Aucune échéance DCA programmée.');

  // Paliers de vente atteints mais pas vendus : rappelés tant que rien n'est fait.
  const usd = new Map<string, number>();
  for (const [id, p] of Object.entries(i.prices)) if (typeof p?.usd === 'number' && p.usd > 0) usd.set(id, p.usd as number);
  const rungs = hitRungs(watch, usd);
  if (rungs.length) lines.push(`Paliers atteints non vendus : ${rungs.map((r) => `${r.symbol.toUpperCase()} ×${r.multiple} (vends ${r.pct} %)`).join(' · ')}`);

  // Alertes armées : combien veillent encore ?
  const armed = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
  lines.push(`Alertes armées : ${armed}`);

  // Fraîcheur du fichier de synchronisation : sans ça, le brief peut paraître “du jour” avec des données anciennes.
  if (i.syncSavedAt) {
    const when = new Date(i.syncSavedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`Données de synchronisation : ${fmtDate(when, true)}${i.syncDevice ? ` (${i.syncDevice})` : ''}`);
  }
  return lines.join('\n');
}
