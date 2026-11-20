// Panier DCA en mode automatique : tu ne règles que le montant, les jours et la part « base » / « découverte ».
// Boussole choisit tout le reste : jusqu'à 3 cryptos du top 20 (hors stablecoins) pour la base, jusqu'à 3 pépites
// ou cryptos de milieu de classement pour la découverte, avec les montants exacts. Fonction pure, testée.
//
// Les garde-fous du panier personnalisé restent : montant modulé par la température du marché (réserve d'USDC),
// découverte réduite puis coupée quand le marché est chaud, anti-FOMO (+50 % en 7 jours), disponibilité sur
// Crypto.com, plafond par pépite, et plus de nouvelles lignes quand ton maximum de lignes est atteint.

import type { BasketPlan, CoinRef, ProfileRules } from '../types';
import type { CgMarket } from '../api/coingecko';
import { autoDiscoveryCandidates, MIDCAP_FILTER, type AutoPick } from './discovery';
import { discoveryTemperatureFactor, type BasketPlanResult, type CdcState, type PlannedOrder } from './basket';
import { temperatureMultiplier } from './dca';
import dcaVariants from '../data/dca-variants.json';
import { FOMO_7D_PCT } from './thresholds';
import { isGold, isStable, isWrappedOrStaked } from './portfolio';

/** Version des règles du panier automatique (entre dans l'empreinte des stratégies du Labo). */
export const AUTO_BASKET_VERSION = 1;

/** Taille de l'univers « base » : les N premières capitalisations, stablecoins et jetons « wrapped » exclus. */
export const AUTO_BASE_TOP = 20;
/** Univers des autopilotes du Labo : top 500 CoinGecko (filtré sur les paires cotées Binance). */
export const AUTOPILOT_UNIVERSE_TOP = 500;
/** Nombre maximal de cryptos par côté (base, découverte) et par échéance. */
export const AUTO_MAX_LINES = 3;
/** Sous ce score investisseur (« Alléger », « Prendre des profits »), une crypto du top 20 n'est pas achetée. */
export const AUTO_MIN_INVESTOR_SCORE = -15;

const round2 = (x: number) => Math.round(x * 100) / 100;
const usdc = (x: number) => `${String(round2(x)).replace('.', ',')} USDC`;
const pct = (x: number) => `${String(Math.round(x * 10) / 10).replace('.', ',')} %`;

export interface UniverseRow {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  rank: number | null;
}

/** Les cryptos éligibles à la base : top 20 par capitalisation, sans stablecoins, jetons « wrapped »/stakés ni or tokenisé. */
export function topBaseUniverse<T extends UniverseRow>(rows: T[], top = AUTO_BASE_TOP): T[] {
  return rows
    .filter((r) => !isStable(r.symbol, r.id) && !isWrappedOrStaked(r.symbol, r.name, r.id) && !isGold(r.symbol))
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .slice(0, top);
}

export interface AutoCandidate {
  coin: CoinRef;
  /** Rang par capitalisation (base) ; sert à départager deux scores égaux. */
  rank: number | null;
  /** Base : score investisseur Boussole (−100 à +100) ; découverte : score du scan des pépites (0 à 100). Null = inconnu. */
  score: number | null;
  change7d: number | null;
  /** Valeur déjà détenue (USD), tous comptes confondus. */
  heldUsd: number;
  /** Disponibilité sur Crypto.com ; null tant que la liste n'est pas chargée. */
  cdc: CdcState | null;
  /** Poids de la règle « capitalisation » (capitalisation en direct ; volume médian au banc d'essai). */
  weight?: number;
}

/** Règle de la base : trois meilleurs scores (historique), capitalisation, ancre Bitcoin et Ethereum, parts égales, Bitcoin seul. */
export type BaseMode = 'top3' | 'cap' | 'anchor' | 'equal' | 'btc';
export const BASE_MODES: BaseMode[] = ['top3', 'cap', 'anchor', 'equal', 'btc'];
export const DEFAULT_ANCHOR_PCT = 70;
export const BASE_MODE_LABEL: Record<BaseMode, string> = {
  top3: 'Trois meilleurs scores', cap: 'Pondérée par la capitalisation', anchor: 'Ancre Bitcoin et Ethereum', equal: 'Parts égales sur le top 20', btc: 'Bitcoin seul',
};

export interface AutoBasketSettings {
  amountUsd: number;
  /** Part du budget pour la base (0 à 100) ; le reste va à la découverte. */
  basePct: number;
  maxBaseLines: number;
  maxDiscoveryLines: number;
  minOrderUsd: number;
  reserveUsd: number;
  /** Absent : « top3 », la règle d'avant la mesure (un panier existant n'est jamais modifié d'office). */
  baseMode?: BaseMode;
  /** Règle « anchor » : part de la base en Bitcoin et Ethereum (75/25), 70 % par défaut. */
  anchorPct?: number;
}

export interface AutoBasketContext {
  temperature: number | null;
  totalValueUsd: number;
  maxPerGemPct: number;
  base: AutoCandidate[];
  discovery: AutoCandidate[];
  /** Faux quand ton nombre maximal de lignes est atteint : la base ne renforce alors que ce que tu détiens. */
  canOpenBase: boolean;
  /** Faux quand ton maximum de lignes « découverte » est atteint : seules les découvertes ouvertes sont renforcées. */
  canOpenDiscovery: boolean;
}

/** Un ordre par crypto retenue, budget partagé à parts égales (au centime près), jamais sous le minimum par ordre. */
function split(picks: AutoCandidate[], maxLines: number, amount: number, minOrder: number, kind: PlannedOrder['kind'], reasonOf: (c: AutoCandidate) => string): PlannedOrder[] {
  const min = Math.max(minOrder, 0.01);
  const n = Math.min(Math.max(0, Math.floor(maxLines)), Math.floor((amount + 1e-9) / min), picks.length);
  if (n <= 0) return [];
  const each = Math.floor((amount / n) * 100) / 100;
  return picks.slice(0, n).map((c, i) => ({
    coinId: c.coin.coinId,
    symbol: c.coin.symbol,
    name: c.coin.name,
    image: c.coin.image,
    usd: i === 0 ? round2(amount - each * (n - 1)) : each,
    kind,
    reason: reasonOf(c),
  }));
}

/** Parts proportionnelles aux poids, au centime ; les plus petites lignes sautent si elles passent sous le minimum. */
function splitWeighted(picks: AutoCandidate[], maxLines: number, amount: number, minOrder: number, kind: PlannedOrder['kind'], reasonOf: (c: AutoCandidate) => string): PlannedOrder[] {
  const min = Math.max(minOrder, 0.01);
  let list = picks.filter((c) => (c.weight ?? 0) > 0).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, Math.max(0, Math.floor(maxLines)));
  const total = () => list.reduce((s, c) => s + (c.weight ?? 0), 0);
  while (list.length && (amount * (list[list.length - 1].weight ?? 0)) / total() < min - 1e-9) list = list.slice(0, -1);
  if (!list.length) return [];
  const W = total();
  const shares = list.map((c) => Math.floor(((amount * (c.weight ?? 0)) / W) * 100) / 100);
  shares[0] = round2(amount - shares.slice(1).reduce((s, x) => s + x, 0));
  return list.map((c, i) => ({ coinId: c.coin.coinId, symbol: c.coin.symbol, name: c.coin.name, image: c.coin.image, usd: shares[i], kind, reason: reasonOf(c) }));
}

const signed = (s: number) => `${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.abs(s)}`;

export function planAutoBasket(s: AutoBasketSettings, ctx: AutoBasketContext): BasketPlanResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const excluded: { symbol: string; reason: string }[] = [];
  const amount = Math.max(0, s.amountUsd);
  const basePart = Math.max(0, Math.min(100, s.basePct)) / 100;
  const t = ctx.temperature;
  const mult = t == null ? 1 : temperatureMultiplier(t);
  const factor = discoveryTemperatureFactor(t);
  const baseWanted = amount * basePart * mult;
  const discWanted = amount * (1 - basePart) * factor;
  const total = ctx.totalValueUsd;

  if (t != null) notes.push(`Température du marché ${Math.round(t)}/100 : base ×${String(mult).replace('.', ',')}.`);
  else warnings.push('Température du marché indisponible : les montants ne sont pas modulés (×1). Revérifie quand la connexion revient.');
  if (basePart < 1 && factor === 0) notes.push('Marché très chaud : aucune découverte aujourd’hui, sa part reste en réserve.');
  else if (basePart < 1 && factor < 1) notes.push('Marché chaud : la part découverte est réduite de moitié, le reste va en réserve.');

  // Écarte ce que les règles refusent, en le disant ; renvoie les candidates restantes, triées.
  const screen = (list: AutoCandidate[], side: 'base' | 'discovery'): AutoCandidate[] => {
    const ok: AutoCandidate[] = [];
    for (const c of list) {
      const sym = c.coin.symbol.toUpperCase();
      if (c.cdc === 'unknown') excluded.push({ symbol: sym, reason: 'absente de la liste Crypto.com' });
      else if (c.change7d != null && c.change7d > FOMO_7D_PCT) excluded.push({ symbol: sym, reason: `+${Math.round(c.change7d)} % en 7 jours (FOMO)` });
      else if (side === 'base' && c.score != null && c.score <= AUTO_MIN_INVESTOR_SCORE) excluded.push({ symbol: sym, reason: `score investisseur ${signed(c.score)} (bas)` });
      else if (side === 'discovery' && total >= 20 * amount && total > 0 && (c.heldUsd / total) * 100 >= ctx.maxPerGemPct) excluded.push({ symbol: sym, reason: `plafond de ${pct(ctx.maxPerGemPct)} par pépite atteint` });
      else ok.push(c);
    }
    return ok.sort((a, b) => (b.score ?? -999) - (a.score ?? -999) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.heldUsd - a.heldUsd);
  };
  const keepOpen = (list: AutoCandidate[], canOpen: boolean, label: string): AutoCandidate[] => {
    if (canOpen) return list;
    const held = list.filter((c) => c.heldUsd > 0);
    if (held.length < list.length) notes.push(`${label} : ton maximum de lignes est atteint, seules les cryptos que tu détiens déjà sont renforcées.`);
    return held;
  };

  const pool: NonNullable<BasketPlanResult['pool']> = [];
  const remember = (list: AutoCandidate[], side: 'core' | 'discovery') => {
    for (const c of list.slice(0, 8)) pool.push({ coin: c.coin, side, score: c.score, rank: c.rank, change7d: c.change7d, heldUsd: c.heldUsd });
  };

  // 1. La découverte d'abord : ce qu'elle ne dépense pas revient à la base.
  let discOrders: PlannedOrder[] = [];
  if (discWanted > 0.005 && s.maxDiscoveryLines > 0) {
    const discPool = keepOpen(screen(ctx.discovery, 'discovery'), ctx.canOpenDiscovery, 'Découverte');
    remember(discPool, 'discovery');
    discOrders = split(discPool, Math.min(AUTO_MAX_LINES, s.maxDiscoveryLines), discWanted, s.minOrderUsd, 'discovery', (c) =>
      `Découverte · score du scan ${c.score ?? '—'}/100${c.heldUsd > 0 ? ' · tu en détiens déjà' : ''}`);
    if (!discOrders.length) notes.push(discWanted < Math.max(s.minOrderUsd, 0.01) ? `Part découverte (${usdc(discWanted)}) sous le minimum de ${usdc(s.minOrderUsd)} : elle revient à la base.` : 'Aucune découverte ne passe les règles aujourd’hui : le montant revient à la base.');
  } else if (discWanted > 0.005) notes.push('Aucune ligne découverte demandée : le montant revient à la base.');
  const discSpent = discOrders.reduce((sum, o) => sum + o.usd, 0);

  // 2. La base reçoit sa part, plus ce que la découverte n'a pas dépensé.
  let base = baseWanted + Math.max(0, discWanted - discSpent);
  const extra = base + discSpent - amount;
  if (extra > 0.005) {
    const allowed = Math.min(extra, Math.max(0, s.reserveUsd));
    if (allowed < extra) {
      base -= extra - allowed;
      notes.push(`Réserve insuffisante (${usdc(s.reserveUsd)}) : la base est limitée pour ne pas dépasser le budget.`);
    } else notes.push(`Marché qui a peur : ${usdc(extra)} puisés dans ta réserve.`);
  }

  let baseOrders: PlannedOrder[] = [];
  const mode = s.baseMode ?? 'top3';
  if (base > 0.005) {
    const reasonOf = (c: AutoCandidate) => {
      const sig = c.score != null ? ` · score investisseur ${signed(c.score)}` : ' · score indisponible';
      return `${c.rank != null ? `Rang ${c.rank} (20 premières hors stablecoins)` : '20 premières hors stablecoins'}${sig}${c.heldUsd > 0 ? ' · tu en détiens déjà' : ''}`;
    };
    // Ancre et Bitcoin seul : achetés à chaque échéance, sans filtre de signal (seulement la disponibilité).
    const pick = (id: string) => ctx.base.find((c) => c.coin.coinId === id && c.cdc !== 'unknown');
    const one = (c: AutoCandidate, usd: number, reason: string): PlannedOrder => ({ coinId: c.coin.coinId, symbol: c.coin.symbol, name: c.coin.name, image: c.coin.image, usd: round2(usd), kind: 'core', reason });
    const basePool = keepOpen(screen(ctx.base, 'base'), ctx.canOpenBase, 'Base');
    remember(basePool, 'core');
    if (mode === 'btc') {
      const btc = pick('bitcoin');
      if (btc && base >= Math.max(s.minOrderUsd, 0.01)) baseOrders = [one(btc, base, 'Bitcoin seul (règle de la base)')];
    } else if (mode === 'anchor') {
      const share = Math.max(0, Math.min(100, s.anchorPct ?? DEFAULT_ANCHOR_PCT)) / 100;
      const btc = pick('bitcoin');
      const eth = pick('ethereum');
      let anchored = base * share;
      const rest = split(basePool.filter((c) => c.coin.coinId !== 'bitcoin' && c.coin.coinId !== 'ethereum'), Math.min(AUTO_MAX_LINES, s.maxBaseLines), round2(base - anchored), s.minOrderUsd, 'core', reasonOf);
      if (!rest.length) anchored = base; // le reste, trop petit ou sans candidate, rejoint l'ancre
      const why = `Ancre Bitcoin et Ethereum (${Math.round(share * 100)} % de la base)`;
      const btcUsd = eth ? round2(anchored * 0.75) : round2(anchored);
      const anchor = [btc && btcUsd >= s.minOrderUsd ? one(btc, btcUsd, why) : null, eth && anchored - btcUsd >= s.minOrderUsd ? one(eth, anchored - btcUsd, why) : null].filter((x): x is PlannedOrder => !!x);
      baseOrders = [...anchor, ...rest];
    } else if (mode === 'cap') {
      baseOrders = splitWeighted(basePool, AUTO_BASE_TOP, base, s.minOrderUsd, 'core', reasonOf);
    } else if (mode === 'equal') {
      baseOrders = split(basePool, AUTO_BASE_TOP, base, s.minOrderUsd, 'core', reasonOf);
    } else {
      baseOrders = split(basePool, Math.min(AUTO_MAX_LINES, s.maxBaseLines), base, s.minOrderUsd, 'core', reasonOf);
    }
    if (!baseOrders.length) notes.push(base < Math.max(s.minOrderUsd, 0.01) ? `Part base (${usdc(base)}) sous le minimum de ${usdc(s.minOrderUsd)} : mise en réserve.` : 'Aucune crypto du top 20 ne passe les règles aujourd’hui : le montant part en réserve.');
  }

  const orders = [...baseOrders, ...discOrders];
  if (orders.length > 1) notes.push(mode === 'top3' || mode === 'equal' ? 'Le montant de chaque côté est partagé à parts égales entre les cryptos retenues.' : `Base : règle « ${BASE_MODE_LABEL[mode]} ».`);
  const invest = round2(orders.reduce((sum, o) => sum + o.usd, 0));
  return { baseUsd: amount, investUsd: invest, reserveDeltaUsd: round2(amount - invest), multiplier: mult, discoveryShare: 1 - basePart, orders, notes, warnings, excluded, pool };
}

// ------------------------------------------------------------------ calcul complet (écran du panier et autopilote)

/** Ligne de marché → entrée du score des pépites. */
const toSmallCapInput = (m: CgMarket) => ({
  id: m.id, symbol: m.symbol, name: m.name, marketCap: m.market_cap, fdv: m.fully_diluted_valuation, volume24h: m.total_volume,
  change7d: m.price_change_percentage_7d_in_currency ?? null, change30d: m.price_change_percentage_30d_in_currency ?? null,
  athChangePct: m.ath_change_percentage, rank: m.market_cap_rank,
});

/** Les 20 premières capitalisations éligibles à la base. */
export function autoBaseUniverse(markets: CgMarket[]) {
  return topBaseUniverse(markets.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, image: m.image, rank: m.market_cap_rank })), AUTO_BASE_TOP);
}

/** Candidates « découverte » : pépites du scan et/ou milieu de classement (rangs 21 et plus), 8 au plus, sans la base. */
export function autoDiscoveryPicks(markets: CgMarket[], smallCaps: CgMarket[] | null, source: 'gems' | 'mid' | 'both', base: { id: string; symbol: string }[]): AutoPick[] {
  const opts = { excluded: new Set(base.map((c) => c.id)), excludedSymbols: new Set(base.map((c) => c.symbol.toUpperCase())), max: 8 };
  const gems = source !== 'mid' && smallCaps ? autoDiscoveryCandidates(smallCaps.map(toSmallCapInput), { ...opts, label: 'Pépite du scan' }) : [];
  const mids = source !== 'gems' ? autoDiscoveryCandidates(markets.filter((m) => (m.market_cap_rank ?? 0) > AUTO_BASE_TOP).map(toSmallCapInput), { ...opts, filter: MIDCAP_FILTER, label: 'Milieu de classement' }) : [];
  const seen = new Set<string>();
  return [...gems, ...mids].sort((a, b) => b.score - a.score).filter((p) => (seen.has(p.coin.coinId) ? false : (seen.add(p.coin.coinId), true))).slice(0, 8);
}

export interface AutoBasketInputs {
  basket: Pick<BasketPlan, 'amountUsd' | 'basePct' | 'maxBaseLines' | 'maxDiscoveryLines' | 'minOrderUsd' | 'reserveUsd' | 'discoverySource' | 'baseMode' | 'anchorPct'>;
  /** Poids de la règle « capitalisation » quand les capitalisations manquent (banc d'essai : volume médian). */
  weights?: Record<string, number>;
  markets: CgMarket[];
  smallCaps: CgMarket[] | null;
  /** Score investisseur par crypto (base). */
  scores: Record<string, number>;
  change7d: Record<string, number | null>;
  cdc: Record<string, CdcState> | null;
  temperature: number | null;
  heldUsd: Record<string, number>;
  totalValueUsd: number;
  rules: ProfileRules;
  /** Lignes ouvertes (toutes, puis « découverte ») : au maximum, la base et la découverte ne font que renforcer. */
  linesOpen: number;
  discoveryLinesOpen: number;
}

/** L'ordre du panier automatique, de bout en bout : univers, candidates, règles. Même résultat sur l'écran et dans l'autopilote. */
export function buildAutoBasketPlan(i: AutoBasketInputs): BasketPlanResult {
  const base = autoBaseUniverse(i.markets);
  const picks = autoDiscoveryPicks(i.markets, i.smallCaps, i.basket.discoverySource ?? 'both', base);
  const imageOf = (id: string) => i.markets.find((m) => m.id === id)?.image ?? i.smallCaps?.find((m) => m.id === id)?.image;
  const cand = (coin: CoinRef, rank: number | null, score: number | null): AutoCandidate => ({
    coin, rank, score, change7d: i.change7d[coin.coinId] ?? null, heldUsd: i.heldUsd[coin.coinId] ?? 0, cdc: i.cdc ? i.cdc[coin.coinId] ?? 'unknown' : null,
  });
  const b = i.basket;
  return planAutoBasket(
    { amountUsd: b.amountUsd, basePct: b.basePct ?? 70, maxBaseLines: b.maxBaseLines ?? 3, maxDiscoveryLines: b.maxDiscoveryLines ?? 3, minOrderUsd: b.minOrderUsd, reserveUsd: b.reserveUsd, baseMode: b.baseMode, anchorPct: b.anchorPct },
    {
      temperature: i.temperature,
      totalValueUsd: i.totalValueUsd,
      maxPerGemPct: i.rules.maxPerGemPct,
      base: base.map((c) => ({ ...cand({ coinId: c.id, symbol: c.symbol, name: c.name, image: c.image }, c.rank, i.scores[c.id] ?? null), weight: i.weights?.[c.id] ?? i.markets.find((m) => m.id === c.id)?.market_cap ?? 0 })),
      discovery: picks.map((p) => cand({ ...p.coin, image: imageOf(p.coin.coinId) }, null, p.score)),
      canOpenBase: i.linesOpen < i.rules.maxLines,
      canOpenDiscovery: i.discoveryLinesOpen < i.rules.maxDiscoveryLines,
    },
  );
}

// ------------------------------------------------------------------ règle mesurée (rapport docs/bench/*-dca-variantes.md)

/** La règle de base désignée par le banc d'essai : la variante retenue, ou l'ancre Bitcoin et Ethereum si aucune ne bat le DCA Bitcoin simple. */
export function measuredBaseMode(): { mode: BaseMode; measuredPct: number; top3Pct: number; dcaBtcPct: number; beatsBtc: boolean; since: string } {
  const v = dcaVariants as { chosen: string | null; beatsBtc: boolean; controlTwrPct: Record<string, number>; dcaBtcTwrPct: number; controlFrom: string };
  const mode = (v.beatsBtc && v.chosen ? v.chosen : 'anchor') as BaseMode;
  return { mode, measuredPct: v.controlTwrPct[mode], top3Pct: v.controlTwrPct.top3, dcaBtcPct: v.dcaBtcTwrPct, beatsBtc: v.beatsBtc, since: v.controlFrom };
}

/** Réglage de la base d'un nouveau panier. */
export function newBasketBase(): Pick<BasketPlan, 'baseMode' | 'anchorPct'> {
  const { mode } = measuredBaseMode();
  return mode === 'anchor' ? { baseMode: mode, anchorPct: DEFAULT_ANCHOR_PCT } : { baseMode: mode };
}
