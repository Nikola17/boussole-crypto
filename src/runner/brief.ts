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
import { paperStatus } from '../lib/paper';
import type { CoinPrice } from './market';
import type { RatedNews } from './news';
import type { RunnerConfig } from './config';
import { nextMacroEvents } from '../lib/macro';

export type BriefSlotId = 'matin' | 'us-open' | 'us-close';

/** Heure exacte (ms) d'un moment de la journée à New York, été comme hiver. */
export function nyEpoch(hour: number, minute: number, now: Date): number | null {
  let day: string;
  try { day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); } catch { return null; }
  // Les heures de l'Atlantique Nord ne basculent pas le même jour : on vérifie l'essai été (-04:00) puis hiver (-05:00),
  // en reformattant l'instant trouvé : seul le bon essai affiche exactement 9 h 30 (ou 16 h) à New York.
  for (const off of ['-04:00', '-05:00']) {
    const t = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${off}`);
    if (!Number.isFinite(t)) continue;
    try {
      const shown = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).format(new Date(t));
      if (shown === `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`) return t;
    } catch { return null; }
  }
  return null;
}

export interface BriefSlot { id: BriefSlotId; label: string; atMs: number | null }

/** Les trois briefs de la journée, avec leur heure locale (serveur dans le fuseau de l'utilisateur). */
export function slotsOfDay(cfg: Pick<RunnerConfig, 'briefHour' | 'briefUsOpen' | 'briefUsClose'>, now: Date): BriefSlot[] {
  const out: BriefSlot[] = [{ id: 'matin', label: 'brief du matin', atMs: new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.briefHour, 0, 0, 0).getTime() }];
  const usOpen = cfg.briefUsOpen ? nyEpoch(9, 30, now) : null;
  const usClose = cfg.briefUsClose ? nyEpoch(16, 0, now) : null;
  if (usOpen != null) out.push({ id: 'us-open', label: 'ouverture des marchés américains', atMs: usOpen });
  if (usClose != null) out.push({ id: 'us-close', label: 'clôture des marchés américains', atMs: usClose });
  return out;
}

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
  /** Température du marché calculée par le serveur (null : indisponible). */
  temperature?: { value: number; zoneLabel: string } | null;
  /** Métriques de cycle du serveur : MVRV, part des stablecoins, position de halving (null : indisponibles). */
  cycleMetrics?: { mvrv: number | null; stableShare: number | null; halvingDaysToNext: number | null } | null;
  /** Créneau du brief : « matin » (complet), ou formes courtes aux moments clés américains. */
  slot?: BriefSlotId;
  /** Actus fraîches des cryptos suivies (triées, au plus 3 lignes retinues dans le brief). */
  news?: RatedNews[];
}

const HEAD_TOP = 3;

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function buildBrief(i: BriefInputs): string {
  const lines: string[] = [];
  const watch = watchOf(i.bundle); // transactions, thèses, alertes, paliers vendus
  const today = isoDay(i.now);
  const cur = i.currency;
  const short = i.slot === 'us-open' || i.slot === 'us-close';

  lines.push(i.slot === 'us-open' ? `Boussole — ouverture américaine · ${fmtDate(i.now)}` : i.slot === 'us-close' ? `Boussole — clôture américaine · ${fmtDate(i.now)}` : `Boussole — brief du ${fmtDate(i.now)}`);

  // Marché : Fear & Greed et Bitcoin.
  const btc = i.prices.bitcoin;
  const market: string[] = [];
  if (i.fng) market.push(`Fear & Greed ${i.fng.value} (${i.fng.label})`);
  if (i.temperature) market.push(`zone : ${i.temperature.zoneLabel} (${Math.round(i.temperature.value)}/100)`);
  if (i.cycleMetrics?.mvrv != null) market.push(`MVRV ${i.cycleMetrics.mvrv.toFixed(2).replace('.', ',')}×`);
  if (i.cycleMetrics?.stableShare != null) market.push(`stablecoins ${i.cycleMetrics.stableShare.toFixed(1).replace('.', ',')} %`);
  if (btc?.usd != null) market.push(`BTC ${fmtPrice(btc.usd, 'USD')}${btc.change != null ? ` (${fmtPct(btc.change, 1, true)} / 24 h)` : ''}`);
  lines.push(market.length ? `Marché : ${market.join(' · ')}` : 'Marché : données indisponibles pour l’instant.');

  // À l'horizon : les événements macro/crypto qui peuvent bouger le marché, avec la conduite à tenir.
  const horizon = nextMacroEvents(i.now, 3, 21);
  if (horizon.length) {
    lines.push(`À l’horizon : ${horizon.map((e) => `${e.label} ${e.daysTo === 0 ? 'aujourd’hui' : e.daysTo === 1 ? 'demain' : `dans ${e.daysTo} j`}`).join(' · ')}`);
    const first = horizon[0];
    if (first.daysTo <= 3) lines.push(`${first.label} — ${first.advice}`);
  }
  if (i.cycleMetrics?.halvingDaysToNext != null && i.cycleMetrics.halvingDaysToNext > 0) {
    lines.push(`Cycle : prochain halving estimé dans ${Math.round(i.cycleMetrics.halvingDaysToNext / 30)} mois.`);

  }

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

  // Prix USD de tout ce qui est valorisé (journal, papier) : dits une fois, jamais inventés.
  const usd = new Map<string, number>();
  for (const [id, p] of Object.entries(i.prices)) if (typeof p?.usd === 'number' && p.usd > 0) usd.set(id, p.usd as number);

  // Portefeuille papier (expérimentations) : le P&L des ordres fictifs, valorisé aux mêmes prix réels.
  const paper = watch.paper;
  if (paper?.enabled && watch.paperTrades.length) {
    const st = paperStatus(paper.startingUsd, watch.paperTrades, usd);
    if (st.positions.length) {
      const badge = st.pnlUsd >= 0 ? '+' : '';
      lines.push(`Papier (expérimentations) : ${fmtPrice(st.totalUsd, 'USD')} (${badge}${st.pnlPct.toFixed(1).replace('.', ',')} %)${st.unpriced ? `${st.unpriced} ligne${st.unpriced > 1 ? 's' : ''} sans prix` : ''}`);
    }
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
  if (!short && upcoming.length) lines.push(`Prochaine échéance : ${upcoming.join(' · ')}`);
  if (!short && !due.length && !upcoming.length) lines.push('Aucune échéance DCA programmée.');

  // Paliers de vente atteints mais pas vendus : rappelés tant que rien n'est fait.
  const rungs = hitRungs(watch, usd);
  if (rungs.length) lines.push(`Paliers atteints non vendus : ${rungs.map((r) => `${r.symbol.toUpperCase()} ×${r.multiple} (vends ${r.pct} %)`).join(' · ')}`);

  // Alertes armées : combien veillent encore ? (le matin seulement)
  if (!short) {
    const armed = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
    lines.push(`Alertes armées : ${armed}`);
  }

  // Actus fraîches des cryptos suivies : la presse du moment, résumée si l'IA est configurée.
  const news = i.news ?? [];
  const topNews = news.filter((n) => n.publishedAt > i.now.getTime() - 18 * 3600_000).slice(0, 3);
  if (topNews.length) {
    lines.push(`Actus : ${topNews.map((n) => `« ${n.title} »${n.source ? ` (${n.source})` : ''}`).join(' · ')}`);
    for (const n of topNews) if (n.resume) lines.push(`${n.coinName} : ${n.resume.replace(/\s+/g, ' ').slice(0, 320)}`);
  }

  // Fraîcheur du fichier de synchronisation : sans ça, le brief peut paraître “du jour” avec des données anciennes.
  if (!short && i.syncSavedAt) {
    const when = new Date(i.syncSavedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`Données de synchronisation : ${fmtDate(when, true)}${i.syncDevice ? ` (${i.syncDevice})` : ''}`);
  }
  return lines.join('\n');
}
