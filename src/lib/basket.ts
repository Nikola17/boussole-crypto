// Panier DCA : à chaque échéance, un budget en USDC réparti sur au plus deux lignes (un cœur et une « découverte »),
// modulé par la température du marché, avec une réserve qui absorbe les écarts et des règles contre l'éparpillement.

import type { BasketCoin, BasketPlan, CoinRef } from '../types';
import { temperatureMultiplier } from './dca';
import { FOMO_7D_PCT } from './thresholds';
import { isoDay } from './format';

export const MAX_DISCOVERY = 5;
export const DAY_LABEL = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const round2 = (x: number) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ Calendrier

function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dowOf = (d: Date) => ((d.getDay() + 6) % 7) + 1; // 1 = lundi

export function isBasketDay(b: Pick<BasketPlan, 'daysOfWeek' | 'startDate'>, day: Date): boolean {
  const d = startOfDay(day);
  if (d < startOfDay(parseDay(b.startDate))) return false;
  return b.daysOfWeek.includes(dowOf(d));
}

export function nextBasketOccurrences(b: Pick<BasketPlan, 'daysOfWeek' | 'startDate'>, from: Date, count = 4): Date[] {
  const out: Date[] = [];
  let cursor = startOfDay(from);
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (isBasketDay(b, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}

/** Dernière échéance passée ou du jour (au plus 14 jours en arrière). */
export function lastBasketOccurrence(b: Pick<BasketPlan, 'daysOfWeek' | 'startDate'>, today: Date): Date | null {
  let cursor = startOfDay(today);
  for (let i = 0; i < 14; i++) {
    if (isBasketDay(b, cursor)) return cursor;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return null;
}

export const basketPeriodKey = (day: Date) => isoDay(day);

// ------------------------------------------------------------------ Répartition

/** Part du budget que la ligne « découverte » peut prendre : elle fond quand les altcoins approchent de leur cible. */
export function discoveryShare(maxPct: number, altTargetPct: number, altCurrentPct: number): number {
  const max = Math.max(0, Math.min(100, maxPct)) / 100;
  if (altTargetPct <= 0) return 0;
  const room = altTargetPct - altCurrentPct;
  if (room <= 0) return 0;
  return max * Math.min(1, room / Math.max(altTargetPct * 0.5, 5));
}

/** Marché chaud : la ligne « découverte » (la plus risquée) est réduite, puis coupée. */
export function discoveryTemperatureFactor(t: number | null): number {
  if (t == null) return 1;
  if (t >= 80) return 0;
  if (t >= 60) return 0.5;
  return 1;
}

export type CdcState = 'app' | 'exchange' | 'unknown';

export interface BasketContext {
  temperature: number | null;
  totalValueUsd: number;
  altTargetPct: number;
  altCurrentPct: number;
  /** Valeur détenue (USD), tous comptes confondus, par identifiant de crypto. */
  values: Record<string, number>;
  change7d: Record<string, number | null>;
  /** Disponibilité sur Crypto.com ; null tant que la liste n'est pas chargée. */
  cdc: Record<string, CdcState> | null;
  /** Score investisseur Boussole (facultatif) pour départager les lignes « découverte ». */
  scores: Record<string, number>;
  /** Découverte automatique : les candidates du scan chosit par Boussole (mode « auto »). */
  autoDiscovery?: CoinRef[];
  rules: { maxPerGemPct: number; minLinePct: number; maxDiscoveryLines: number };
  discoveryLinesOpen: number;
}

export interface PlannedOrder extends CoinRef {
  usd: number;
  kind: 'core' | 'discovery';
  reason: string;
}

export interface BasketPlanResult {
  baseUsd: number;
  investUsd: number;
  /** + : du budget part en réserve ; − : la réserve est puisée. */
  reserveDeltaUsd: number;
  multiplier: number;
  discoveryShare: number;
  orders: PlannedOrder[];
  notes: string[];
  warnings: string[];
  excluded: { symbol: string; reason: string }[];
  /** Mode automatique : toutes les candidates qui ont passé les règles, retenues ou non (l'IA ne choisit que parmi elles). */
  pool?: { coin: CoinRef; side: 'core' | 'discovery'; score: number | null; rank: number | null; change7d: number | null; heldUsd: number }[];
}

const pct = (x: number) => `${String(Math.round(x * 10) / 10).replace('.', ',')} %`;
const usd = (x: number) => `${String(round2(x)).replace('.', ',')} USDC`;

function refOf(c: CoinRef): CoinRef {
  return { coinId: c.coinId, symbol: c.symbol, name: c.name, image: c.image };
}

/** Ligne du cœur la plus en retard sur son poids visé (le cœur inclut ce que tu détiens déjà, Ledger compris). */
function pickCore(b: BasketPlan, ctx: BasketContext, amount: number): { coin: BasketCoin; reason: string } | null {
  const coins = b.core.filter((c) => c.weight > 0);
  if (!coins.length) return null;
  const wsum = coins.reduce((s, c) => s + c.weight, 0);
  const held = coins.map((c) => ctx.values[c.coinId] ?? 0);
  const heldSum = held.reduce((s, v) => s + v, 0);
  const future = heldSum + amount;
  let best = 0;
  let bestGap = -Infinity;
  coins.forEach((c, i) => {
    const gap = (c.weight / wsum) * future - held[i];
    if (gap > bestGap) { bestGap = gap; best = i; }
  });
  const coin = coins[best];
  const reason = heldSum > 0
    ? `Ligne du cœur la plus en retard : ${pct((held[best] / heldSum) * 100)} du cœur pour ${pct((coin.weight / wsum) * 100)} visés`
    : 'Ton cœur est vide : on commence par sa ligne principale';
  return { coin, reason };
}

/** Une seule ligne « découverte » par échéance, choisie selon tes règles — tu l'as choisie, ou Boussole l'a choisie. */
function pickDiscovery(
  list: CoinRef[],
  ctx: BasketContext,
  wanted: number,
  amountUsd: number,
  minOrderUsd: number,
  excluded: { symbol: string; reason: string }[],
): { coin: CoinRef; usd: number; reason: string } | null {
  const total = ctx.totalValueUsd;
  const { maxPerGemPct, minLinePct, maxDiscoveryLines } = ctx.rules;
  const cands: { coin: CoinRef; value: number; pct: number; score: number | null }[] = [];
  for (const c of list) {
    const sym = c.symbol.toUpperCase();
    const value = ctx.values[c.coinId] ?? 0;
    const share = total > 0 ? (value / total) * 100 : 0;
    const ch = ctx.change7d[c.coinId];
    if (ctx.cdc && ctx.cdc[c.coinId] === 'unknown') excluded.push({ symbol: sym, reason: 'absente de la liste Crypto.com' });
    else if (ch != null && ch > FOMO_7D_PCT) excluded.push({ symbol: sym, reason: `+${Math.round(ch)} % en 7 jours (FOMO)` });
    else if (share >= maxPerGemPct && total >= 20 * amountUsd) excluded.push({ symbol: sym, reason: `plafond de ${pct(maxPerGemPct)} atteint` });
    else if (value <= 0 && ctx.discoveryLinesOpen >= maxDiscoveryLines) excluded.push({ symbol: sym, reason: `déjà ${ctx.discoveryLinesOpen} lignes découverte ouvertes (maximum ${maxDiscoveryLines})` });
    else cands.push({ coin: c, value, pct: share, score: ctx.scores[c.coinId] ?? null });
  }
  if (!cands.length) return null;

  // On finit une ligne avant d'en ouvrir une autre.
  const unfinished = cands.filter((c) => c.value > 0 && c.pct < minLinePct).sort((x, y) => y.value - x.value);
  let pick = unfinished[0];
  let reason = `Ligne ouverte sous ${pct(minLinePct)} du portefeuille : on la finit avant d'en ouvrir une autre`;
  if (!pick) {
    pick = [...cands].sort((x, y) => (y.score ?? -999) - (x.score ?? -999) || x.value - y.value)[0];
    reason = pick.score != null ? `Meilleur score Boussole de ta liste (${pick.score > 0 ? '+' : ''}${pick.score})` : pick.value > 0 ? 'Ligne la plus légère de ta liste' : 'Première ligne de ta liste';
  }

  let amount = wanted;
  if (total >= 20 * amountUsd) {
    const room = (maxPerGemPct / 100) * (total + wanted) - pick.value;
    if (room < wanted) {
      amount = room;
      reason += ` (limité par son plafond de ${pct(maxPerGemPct)})`;
    }
  }
  if (amount < minOrderUsd) {
    excluded.push({ symbol: pick.coin.symbol.toUpperCase(), reason: `il reste moins de ${usd(minOrderUsd)} avant son plafond` });
    return null;
  }
  return { coin: refOf(pick.coin), usd: round2(amount), reason };
}

export function planBasketOrder(b: BasketPlan, ctx: BasketContext): BasketPlanResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const excluded: { symbol: string; reason: string }[] = [];
  const base = b.amountUsd;
  const t = ctx.temperature;
  const mult = t == null ? 1 : temperatureMultiplier(t);
  const share = discoveryShare(b.discoveryMaxPct, ctx.altTargetPct, ctx.altCurrentPct);
  const factor = discoveryTemperatureFactor(t);
  const coreWanted = base * (1 - share) * mult;
  const discWanted = base * share * factor;

  if (t != null) notes.push(`Température du marché ${Math.round(t)}/100 : cœur ×${String(mult).replace('.', ',')}.`);
  else warnings.push('Température du marché indisponible : les montants ne sont pas modulés (×1). Revérifie quand la connexion revient.');
  if (share === 0 && b.discoveryMaxPct > 0) notes.push(`Part découverte à 0 % : tes altcoins (${pct(ctx.altCurrentPct)}) ont atteint ta cible (${pct(ctx.altTargetPct)}).`);
  else if (share > 0 && share < b.discoveryMaxPct / 100 - 0.001) notes.push(`Part découverte réduite à ${pct(share * 100)} (maximum ${pct(b.discoveryMaxPct)}) : tes altcoins pèsent ${pct(ctx.altCurrentPct)} pour ${pct(ctx.altTargetPct)} visés.`);
  if (share > 0 && factor === 0) notes.push('Marché très chaud : aucune ligne découverte.');
  else if (share > 0 && factor < 1) notes.push('Marché chaud : ligne découverte réduite de moitié.');

  // 1. La ligne découverte est décidée en premier : elle peut être refusée par tes règles.
  //    En mode « auto », tu n'as rien choisi : les candidates viennent du scan (lib/discovery.ts).
  const auto = b.discoveryMode === 'auto';
  const discList = auto ? (ctx.autoDiscovery ?? []) : b.discovery;
  let disc: { coin: CoinRef; usd: number; reason: string } | null = null;
  if (discWanted > 0.005) {
    if (auto && !discList.length) notes.push('Découverte automatique : aucune candidate pour le moment (scan indisponible ?). Le montant revient au cœur.');
    else if (!auto && !discList.length) notes.push('Liste découverte vide : ajoute des cryptos à étudier, ou passe la découverte en mode automatique. Le montant revient au cœur.');
    else if (discWanted < b.minOrderUsd) notes.push(`Part découverte (${usd(discWanted)}) sous le minimum de ${usd(b.minOrderUsd)} : elle revient au cœur.`);
    else {
      disc = pickDiscovery(discList, ctx, discWanted, b.amountUsd, b.minOrderUsd, excluded);
      if (!disc) notes.push('Aucune ligne découverte ne passe tes règles aujourd’hui : le montant revient au cœur.');
      else if (auto) disc.reason = `Découverte automatique : ${disc.reason.toLowerCase()}`;
    }
  }
  const discSpent = disc ? disc.usd : 0;

  // 2. Ce que la découverte n'a pas dépensé de ce qu'elle voulait revient au cœur (jamais vers la réserve : on n'a pas peur de rater un achat).
  let core = coreWanted + Math.max(0, discWanted - discSpent);

  // 3. La réserve finance un éventuel dépassement du budget (marché qui a peur) ; sans réserve, on s'arrête au budget.
  const extra = core + discSpent - base;
  if (extra > 0.005) {
    const allowed = Math.min(extra, Math.max(0, b.reserveUsd));
    if (allowed < extra) {
      core -= extra - allowed;
      notes.push(`Réserve insuffisante (${usd(b.reserveUsd)}) : le cœur est limité pour ne pas dépasser le budget.`);
    } else notes.push(`Marché qui a peur : ${usd(extra)} puisés dans ta réserve.`);
  }

  const orders: PlannedOrder[] = [];
  if (core >= b.minOrderUsd) {
    const c = pickCore(b, ctx, core);
    if (c) {
      if (ctx.cdc && ctx.cdc[c.coin.coinId] === 'unknown') warnings.push(`${c.coin.symbol.toUpperCase()} n'apparaît pas dans la liste Crypto.com : vérifie dans l'application.`);
      orders.push({ ...refOf(c.coin), usd: round2(core), kind: 'core', reason: c.reason });
    } else warnings.push('Le cœur du panier est vide : ajoute au moins une crypto.');
  } else if (core > 0.005) notes.push(`Part du cœur (${usd(core)}) sous le minimum de ${usd(b.minOrderUsd)} : mise en réserve.`);
  if (disc) orders.push({ ...disc.coin, usd: disc.usd, kind: 'discovery', reason: disc.reason });

  const invest = round2(orders.reduce((s, o) => s + o.usd, 0));
  return { baseUsd: base, investUsd: invest, reserveDeltaUsd: round2(base - invest), multiplier: mult, discoveryShare: share, orders, notes, warnings, excluded };
}
