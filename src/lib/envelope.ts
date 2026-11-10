// Enveloppe DeFi : un petit budget borné pour les paris sur Solana, avec des règles posées à froid.

import type { DefiBet, DefiEnvelope } from '../types';

/** Liquidité minimale d'un pool, en valeur absolue : « 50 × ton achat » seul laisserait passer un pool de 1 250 $ pour un achat de 25 $. */
export const MIN_POOL_LIQUIDITY_USD = 25_000;

export const DEFAULT_ENVELOPE: DefiEnvelope = { enabled: false, capPct: 3, maxPerBuyUsd: 25, takeProfitMultiple: 2, pauseDrawdownPct: 50 };

export interface EnvelopeStatus {
  capUsd: number;
  exposureUsd: number;
  roomUsd: number;
  investedUsd: number;
  nowUsd: number;
  pnlUsd: number;
  pnlPct: number;
  drawdownHit: boolean;
  paused: boolean;
  /** Paris dont la valeur a atteint le multiple fixé : la mise de départ est à retirer. */
  takeProfit: { bet: DefiBet; valueUsd: number }[];
}

const valueOf = (b: DefiBet) => (b.status === 'open' ? b.valueUsd ?? b.costUsd : 0);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function envelopeStatus(bets: DefiBet[], totalPortfolioUsd: number, env: DefiEnvelope, now: Date = new Date()): EnvelopeStatus {
  const counted = bets.filter((b) => !env.windowStart || b.date >= env.windowStart);
  const open = bets.filter((b) => b.status === 'open');
  const exposureUsd = open.reduce((s, b) => s + valueOf(b), 0);
  const capUsd = (Math.max(0, totalPortfolioUsd) * env.capPct) / 100;
  const investedUsd = counted.reduce((s, b) => s + b.costUsd, 0);
  const nowUsd = counted.reduce((s, b) => s + (b.realizedUsd ?? 0) + valueOf(b), 0);
  const pnlPct = investedUsd > 0 ? (nowUsd / investedUsd - 1) * 100 : 0;
  return {
    capUsd,
    exposureUsd,
    roomUsd: Math.max(0, capUsd - exposureUsd),
    investedUsd,
    nowUsd,
    pnlUsd: nowUsd - investedUsd,
    pnlPct,
    drawdownHit: investedUsd > 0 && pnlPct <= -env.pauseDrawdownPct,
    paused: !!env.pausedUntil && dayKey(now) < env.pausedUntil,
    takeProfit: open.filter((b) => !b.recovered && valueOf(b) >= b.costUsd * env.takeProfitMultiple).map((b) => ({ bet: b, valueUsd: valueOf(b) })),
  };
}

/** Date (AAAA-MM-JJ) de fin d'une pause d'un mois. */
export function pauseEnd(from: Date = new Date()): string {
  return dayKey(new Date(from.getFullYear(), from.getMonth() + 1, from.getDate()));
}

export interface PreBuyInput {
  amountUsd: number;
  env: DefiEnvelope;
  status: EnvelopeStatus;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  ageHours: number | null;
  securityVerdict: 'Plutôt sain' | 'Prudence' | 'Danger' | 'Données insuffisantes' | null;
  top10Pct: number | null;
}

export interface PreBuyCheck {
  label: string;
  /** true : passe ; false : bloque ; null : inconnu ou limite. */
  ok: boolean | null;
  hard: boolean;
  detail: string;
}

export interface PreBuyResult {
  checks: PreBuyCheck[];
  verdict: 'passe' | 'prudence' | 'non';
  summary: string;
}

const fmt = (x: number) => Math.round(x).toLocaleString('fr-FR');

/** Contrôle avant achat d'un token Solana : les règles de l'enveloppe, puis les signaux de sécurité et de liquidité. */
export function preBuyChecks(i: PreBuyInput): PreBuyResult {
  const c: PreBuyCheck[] = [];
  const add = (label: string, ok: boolean | null, hard: boolean, detail: string) => c.push({ label, ok, hard, detail });
  const need = i.amountUsd * 50;

  add('Enveloppe active', i.env.enabled && !i.status.paused, true, !i.env.enabled ? 'L’enveloppe est désactivée.' : i.status.paused ? `En pause jusqu’au ${i.env.pausedUntil}.` : 'Oui.');
  add('Montant dans la limite d’un achat', i.amountUsd <= i.env.maxPerBuyUsd, true, `${fmt(i.amountUsd)} $ pour un maximum de ${fmt(i.env.maxPerBuyUsd)} $.`);
  add('Place restante dans l’enveloppe', i.amountUsd <= i.status.roomUsd, true, `${fmt(i.status.roomUsd)} $ disponibles (plafond ${fmt(i.status.capUsd)} $, déjà engagé ${fmt(i.status.exposureUsd)} $).`);
  // Une donnée qui manque BLOQUE l'achat (ok = false) : on n'achète pas sur des informations qu'on n'a pas.
  const sv = i.securityVerdict;
  add('Scan de sécurité', sv == null || sv === 'Danger' || sv === 'Données insuffisantes' ? false : sv === 'Prudence' ? null : true, true,
    sv == null ? 'Scan indisponible : achat bloqué tant qu’il n’a pas pu être fait.' : sv === 'Données insuffisantes' ? 'Données insuffisantes : le scan n’a pas assez d’informations pour juger. Achat bloqué.' : `Verdict : ${sv}.`);
  add('Liquidité minimale du pool', i.liquidityUsd == null ? false : i.liquidityUsd >= MIN_POOL_LIQUIDITY_USD, true,
    i.liquidityUsd == null ? 'Liquidité inconnue : achat bloqué.' : `${fmt(i.liquidityUsd)} $ pour un minimum de ${fmt(MIN_POOL_LIQUIDITY_USD)} $, quel que soit le montant.`);
  add('Liquidité d’au moins 50 × ton achat', i.liquidityUsd == null ? false : i.liquidityUsd >= need, true,
    i.liquidityUsd == null ? 'Liquidité inconnue : achat bloqué.' : `${fmt(i.liquidityUsd)} $ de liquidité pour ${fmt(need)} $ requis.`);
  add('Volume sur 24 h d’au moins 50 × ton achat', i.volume24hUsd == null ? null : i.volume24hUsd >= need, false,
    i.volume24hUsd == null ? 'Volume inconnu.' : `${fmt(i.volume24hUsd)} $ échangés sur 24 h.`);
  add('Ancienneté du token', i.ageHours == null ? false : i.ageHours >= 24 * 7 ? true : i.ageHours >= 24 ? null : false, true,
    i.ageHours == null ? 'Âge inconnu : achat bloqué.' : i.ageHours < 24 ? 'Moins de 24 h : le risque d’arnaque est maximal.' : `${Math.round(i.ageHours / 24)} jour${Math.round(i.ageHours / 24) > 1 ? 's' : ''}${i.ageHours < 24 * 7 ? ' : très récent' : ''}.`);
  add('Concentration des gros portefeuilles', i.top10Pct == null ? false : i.top10Pct <= 30 ? true : i.top10Pct <= 50 ? null : false, true,
    i.top10Pct == null ? 'Concentration inconnue : achat bloqué.' : `Top 10 : ${Math.round(i.top10Pct)} %.`);

  const blocked = c.some((x) => x.hard && x.ok === false);
  const doubt = c.some((x) => x.ok === null || x.ok === false);
  const verdict = blocked ? 'non' : doubt ? 'prudence' : 'passe';
  const summary = verdict === 'non'
    ? 'Ne pas acheter : au moins une règle bloquante n’est pas respectée.'
    : verdict === 'prudence'
      ? 'À manier avec prudence : certaines informations manquent ou sont limites.'
      : 'Les règles sont respectées. Cela ne garantit pas le résultat : ne mise que ce que tu peux perdre.';
  return { checks: c, verdict, summary };
}

/**
 * Raisons pour lesquelles un achat noté « à la main » sort de l'enveloppe. Un journal exact vaut mieux qu'un journal truqué :
 * on peut noter l'achat, mais il est marqué « hors règles » et la raison est affichée.
 */
export function betViolations(env: DefiEnvelope, status: EnvelopeStatus, amountUsd: number): string[] {
  const out: string[] = [];
  if (!env.enabled) out.push('l’enveloppe est désactivée');
  if (status.paused) out.push(`l’enveloppe est en pause jusqu’au ${env.pausedUntil}`);
  if (amountUsd > env.maxPerBuyUsd) out.push(`la mise dépasse ton maximum par achat (${Math.round(env.maxPerBuyUsd)} $)`);
  if (amountUsd > status.roomUsd + 0.005) out.push(`la mise dépasse la place restante dans l’enveloppe (${Math.round(status.roomUsd)} $)`);
  return out;
}
