// Panier DCA en mode automatique : tu ne règles que le montant, les jours et la part « base » / « découverte ».
// Boussole choisit tout le reste : jusqu'à 3 cryptos du top 20 (hors stablecoins) pour la base, jusqu'à 3 pépites
// ou cryptos de milieu de classement pour la découverte, avec les montants exacts. Fonction pure, testée.
//
// Les garde-fous du panier personnalisé restent : montant modulé par la température du marché (réserve d'USDC),
// découverte réduite puis coupée quand le marché est chaud, anti-FOMO (+50 % en 7 jours), disponibilité sur
// Crypto.com, plafond par pépite, et plus de nouvelles lignes quand ton maximum de lignes est atteint.

import type { CoinRef } from '../types';
import { discoveryTemperatureFactor, type BasketPlanResult, type CdcState, type PlannedOrder } from './basket';
import { temperatureMultiplier } from './dca';
import { FOMO_7D_PCT } from './thresholds';
import { isGold, isStable, isWrappedOrStaked } from './portfolio';

/** Taille de l'univers « base » : les N premières capitalisations, stablecoins et jetons « wrapped » exclus. */
export const AUTO_BASE_TOP = 20;
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
}

export interface AutoBasketSettings {
  amountUsd: number;
  /** Part du budget pour la base (0 à 100) ; le reste va à la découverte. */
  basePct: number;
  maxBaseLines: number;
  maxDiscoveryLines: number;
  minOrderUsd: number;
  reserveUsd: number;
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

const investorLabel = (s: number): string => (s >= 45 ? 'Accumuler fort' : s >= 15 ? 'Accumuler' : s > -15 ? 'Conserver' : s > -45 ? 'Alléger' : 'Prendre des profits');
const signed = (s: number) => `${s > 0 ? '+' : ''}${s}`;

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
      else if (side === 'base' && c.score != null && c.score <= AUTO_MIN_INVESTOR_SCORE) excluded.push({ symbol: sym, reason: `signal investisseur « ${investorLabel(c.score)} » (${signed(c.score)})` });
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
  if (base > 0.005) {
    const basePool = keepOpen(screen(ctx.base, 'base'), ctx.canOpenBase, 'Base');
    remember(basePool, 'core');
    baseOrders = split(basePool, Math.min(AUTO_MAX_LINES, s.maxBaseLines), base, s.minOrderUsd, 'core', (c) => {
      const sig = c.score != null ? ` · signal investisseur « ${investorLabel(c.score)} » (${signed(c.score)})` : ' · signal indisponible';
      return `${c.rank != null ? `Rang ${c.rank} (20 premières hors stablecoins)` : '20 premières hors stablecoins'}${sig}${c.heldUsd > 0 ? ' · tu en détiens déjà' : ''}`;
    });
    if (!baseOrders.length) notes.push(base < Math.max(s.minOrderUsd, 0.01) ? `Part base (${usdc(base)}) sous le minimum de ${usdc(s.minOrderUsd)} : mise en réserve.` : 'Aucune crypto du top 20 ne passe les règles aujourd’hui : le montant part en réserve.');
  }

  const orders = [...baseOrders, ...discOrders];
  if (orders.length > 1) notes.push('Le montant de chaque côté est partagé à parts égales entre les cryptos retenues.');
  const invest = round2(orders.reduce((sum, o) => sum + o.usd, 0));
  return { baseUsd: amount, investUsd: invest, reserveDeltaUsd: round2(amount - invest), multiplier: mult, discoveryShare: 1 - basePart, orders, notes, warnings, excluded, pool };
}
