// Signaux d'achat / vente expliqués, pour deux horizons :
//  - Investisseur (long terme : tendance de fond, valorisation, cycle)
//  - Trader (swing de quelques jours à semaines : momentum, cassures, excès)
// Chaque facteur vote de -2 à +2 avec une explication en français.

import {
  atr, bollinger, changePct, highest, last, lastCross, lowest, macd, rsi, sma, slopePct,
  supportResistance, toWeekly, volumeRatio, type Candle,
} from './indicators';
import { TEMPERATURE } from './thresholds';

export type Tone = 'up' | 'neutral' | 'down';

/** Version des règles des signaux : toute modification qui change un libellé l'augmente (table de fiabilité et autopilotes suivent). */
export const SIGNALS_VERSION = 2;

/** Options de calcul : `closedOnly` = toutes les bougies reçues sont closes (banc d'essai, scan, fiches). */
export interface AnalyzeOptions { closedOnly?: boolean }

/** Historique minimal (jours) pour qu'un signal d'achat soit émis : il faut au moins la moyenne mobile 200 jours. */
export const MIN_BARS_FOR_BUY = 200;

export interface Factor {
  key: string;
  label: string;
  detail: string;
  vote: number; // -2..+2
  weight: number;
}

export interface SignalResult {
  score: number; // -100..+100
  label: string;
  tone: Tone;
  strength: 0 | 1 | 2; // 0 neutre, 1 modéré, 2 fort
  factors: Factor[];
  confidence: 'haute' | 'moyenne' | 'faible';
  /** Renseigné quand le signal a été limité (historique trop court) : à afficher à côté du libellé. */
  limitedBy?: string;
  /** Pourquoi ce libellé (version 2 : la condition mesurée qui l'a déclenché). */
  why?: string;
}

export interface TradePlan {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  riskPct: number;
  atr: number;
  support: number | null;
  resistance: number | null;
  /** Version 2 : le stop se juge à la clôture (pas d'ordre stop en séance) ; objectif principal à 3 R (tp2). */
  exitOnClose?: boolean;
}

export interface Setup {
  key: string;
  label: string;
  /** « neutral » : un mouvement se prépare mais son sens n'est pas connu (ex. compression de volatilité). */
  bias: 'bull' | 'bear' | 'neutral';
  detail: string;
}

export interface Analysis {
  price: number;
  sma20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  rsiWeekly: number;
  mayer: number;
  atrPct: number;
  change7d: number;
  change30d: number;
  investor: SignalResult;
  trader: SignalResult;
  plan: TradePlan | null;
  accumulation: { low: number; high: number } | null;
  profitZone: number | null;
  setups: Setup[];
  bars: number;
}

export interface AnalysisContext {
  /** Température de marché 0-100 (0 = peur extrême, 100 = euphorie) */
  temperature?: number;
  /** Variation vs plus haut historique (%, négatif) */
  athChangePct?: number;
  /** La crypto est Bitcoin (la zone « marché chaud » n'y est pas validée). */
  isBitcoin?: boolean;
}

function labelFor(score: number, horizon: 'investor' | 'trader'): { label: string; tone: Tone; strength: 0 | 1 | 2 } {
  const labels = horizon === 'investor'
    ? ['Prendre des profits', 'Alléger', 'Conserver', 'Accumuler', 'Accumuler fort']
    : ['Vente forte', 'Vente', 'Neutre', 'Achat', 'Achat fort'];
  if (score >= 45) return { label: labels[4], tone: 'up', strength: 2 };
  if (score >= 15) return { label: labels[3], tone: 'up', strength: 1 };
  if (score > -15) return { label: labels[2], tone: 'neutral', strength: 0 };
  if (score > -45) return { label: labels[1], tone: 'down', strength: 1 };
  return { label: labels[0], tone: 'down', strength: 2 };
}

function combine(factors: Factor[], horizon: 'investor' | 'trader', bars: number): SignalResult {
  const usable = factors.filter((f) => Number.isFinite(f.vote));
  const wsum = usable.reduce((s, f) => s + f.weight, 0);
  const raw = usable.reduce((s, f) => s + f.vote * f.weight, 0);
  const score = wsum > 0 ? Math.round((raw / (2 * wsum)) * 100) : 0;
  let l = labelFor(score, horizon);
  const confidence = bars >= 200 && usable.length >= 4 ? 'haute' : bars >= 100 ? 'moyenne' : 'faible';
  // Sans 200 jours d'historique, pas de moyenne mobile 200 jours ni de multiple de Mayer : jamais de « Accumuler » (ni d'Achat) sur ce seul score.
  let limitedBy: string | undefined;
  if (bars < MIN_BARS_FOR_BUY && l.tone === 'up') {
    l = { label: horizon === 'investor' ? 'Conserver' : 'Neutre', tone: 'neutral', strength: 0 };
    limitedBy = `Seulement ${bars} jours d’historique : moins de 200, donc pas de signal d’achat (le score ${score > 0 ? '+' : ''}${score} est indicatif).`;
  }
  return { score, ...l, factors: usable, confidence, limitedBy };
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`;
const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

// ---------------- Version 2 : seulement ce que le banc d'essai soutient (docs/bench/2026-11-15-candidats.md) ----------------

export interface InvestorFeatures {
  /** Score composite fort (≥ 45) : « Accumuler fort » de la version 1, validé sur la période de contrôle. */
  strongScore: boolean;
  /** Température du marché du jour (null : indisponible). */
  temperature: number | null;
  /** Au moins 200 jours d'historique (sinon aucun signal d'achat). */
  enoughHistory: boolean;
  /** Excès (F10, validé) : RSI hebdomadaire > 80 ou multiple de Mayer > 2. */
  excess: boolean;
  /** Bitcoin : la zone « marché chaud » n'y est que prometteuse (validée seulement pour les altcoins). */
  isBitcoin: boolean;
}

const isHot = (t: number | null) => t != null && t >= TEMPERATURE.warm && t < TEMPERATURE.euphoria;

/** Table de décision du signal investisseur : la première ligne vraie l'emporte (docs/bench/2026-11-15-candidats.md). */
export const INVESTOR_TABLE: { label: string; tone: Tone; strength: 0 | 1 | 2; when: (f: InvestorFeatures) => boolean; why: (f: InvestorFeatures) => string }[] = [
  { label: 'Prendre des profits', tone: 'down', strength: 2, when: (f) => f.temperature != null && f.temperature >= TEMPERATURE.euphoria,
    why: (f) => `Euphorie (température ${Math.round(f.temperature ?? 0)}/100) : état de risque, une tranche peut être allégée. Trop peu de cas historiques pour mesurer sa fiabilité.` },
  { label: 'Alléger', tone: 'down', strength: 1, when: (f) => f.excess || (!f.isBitcoin && isHot(f.temperature)),
    why: (f) => (f.excess
      ? 'Excès (RSI hebdomadaire au-dessus de 80 ou prix à plus de 2 fois sa moyenne 200 jours) : dans l’historique, la baisse qui a suivi a été nettement plus profonde qu’un jour quelconque.'
      : `Marché chaud (température ${Math.round(f.temperature ?? 0)}/100) : pour une altcoin, la suite a été nettement moins bonne qu’un jour quelconque dans l’historique, avec une baisse plus profonde.`) },
  { label: 'Accumuler fort', tone: 'up', strength: 2, when: (f) => f.enoughHistory && f.strongScore,
    why: () => 'Score composite fort (≥ 45) : tendance, valorisation et cycle alignés. Validé sur la période de contrôle.' },
  { label: 'Accumuler', tone: 'up', strength: 1, when: (f) => f.enoughHistory && f.temperature != null && f.temperature < TEMPERATURE.fear,
    why: (f) => `Température du marché sous 40 (${Math.round(f.temperature ?? 0)}/100) : zone d’accumulation ou de peur, validée sur la période de contrôle.` },
  { label: 'Conserver', tone: 'neutral', strength: 0, when: () => true, why: () => 'Aucune condition mesurée comme fiable n’est réunie : rien à faire.' },
];

function investorV2(v1: SignalResult, temperature: number | null, bars: number, excess: boolean, isBitcoin: boolean): SignalResult {
  const f: InvestorFeatures = { strongScore: v1.score >= 45, temperature, enoughHistory: bars >= MIN_BARS_FOR_BUY, excess, isBitcoin };
  const line = INVESTOR_TABLE.find((l) => l.when(f))!;
  const blocked = !f.enoughHistory && line.tone === 'neutral' && (v1.score >= 45 || (temperature != null && temperature < TEMPERATURE.fear));
  return { ...v1, label: line.label, tone: line.tone, strength: line.strength, why: line.why(f), limitedBy: blocked ? v1.limitedBy ?? `Seulement ${bars} jours d’historique : moins de 200, donc pas de signal d’achat.` : undefined };
}

/** Signal trader v2 : seule la cassure des plus hauts 20 jours avec volume est validée (pas de signal de vente validé). */
function traderV2(v1: SignalResult, breakoutVolume: number | null): SignalResult {
  if (breakoutVolume == null) return { ...v1, label: 'Neutre', tone: 'neutral', strength: 0, score: 0, why: 'Pas de cassure validée : aucun signal trader fiable.' };
  const strong = breakoutVolume >= 2;
  const score = Math.round(Math.min(100, 40 + (breakoutVolume - 1.5) * 40));
  return { ...v1, label: strong ? 'Achat fort' : 'Achat', tone: 'up', strength: strong ? 2 : 1, score, why: `Cassure des plus hauts 20 jours avec un volume ×${breakoutVolume.toFixed(1).replace('.', ',')}${strong ? ' (×2 ou plus)' : ''} : validée sur la période de contrôle. Aucun plan de trade n’a d’espérance positive mesurée après frais.` };
}

export function analyze(candles: Candle[], ctx: AnalysisContext = {}, opts: AnalyzeOptions = {}): Analysis | null {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(candles, 14);
  const weekly = toWeekly(candles);
  const rw = rsi(weekly.map((w) => w.close), 14);

  const sma20 = last(s20) ?? NaN;
  const sma50 = last(s50) ?? NaN;
  const sma200 = last(s200) ?? NaN;
  const rsi14 = last(r) ?? NaN;
  const rsiWeekly = last(rw) ?? NaN;
  const mayer = Number.isFinite(sma200) && sma200 > 0 ? price / sma200 : NaN;
  const atr14 = last(a) ?? NaN;
  const atrPct = Number.isFinite(atr14) ? (atr14 / price) * 100 : NaN;

  // ---------------- Investisseur ----------------
  const inv: Factor[] = [];
  if (Number.isFinite(sma200)) {
    const slope = slopePct(s200, 20);
    const above = price > sma200;
    let vote: number;
    let detail: string;
    if (above && slope > 0) { vote = 2; detail = `Prix au-dessus d'une moyenne 200 jours qui monte (${pct(slope)} sur 20 j) : tendance de fond haussière.`; }
    else if (above) { vote = 1; detail = 'Prix au-dessus de la moyenne 200 jours, mais celle-ci plafonne : tendance à confirmer.'; }
    else if (slope > 0) { vote = 0; detail = "Repli sous une moyenne 200 jours encore haussière : zone de test, surveille la réaction."; }
    else { vote = -2; detail = `Prix sous une moyenne 200 jours qui baisse (${pct(slope)} sur 20 j) : tendance de fond baissière, la patience paie.`; }
    inv.push({ key: 'trend200', label: 'Tendance de fond (MM200)', detail, vote, weight: 3 });

    let mv: number;
    let md: string;
    if (mayer < 0.8) { mv = 2; md = `Prix à ${num(mayer)}× sa moyenne 200 j : historiquement une zone « soldée » d'accumulation.`; }
    else if (mayer < 1) { mv = 1; md = `Prix légèrement sous sa moyenne 200 j (${num(mayer)}×) : valorisation attractive.`; }
    else if (mayer < 1.5) { mv = 0; md = `Multiple de Mayer ${num(mayer)} : valorisation normale.`; }
    else if (mayer < 2) { mv = -1; md = `Multiple de Mayer ${num(mayer)} : le prix s'étire au-dessus de sa moyenne, marge de sécurité réduite.`; }
    else { mv = -2; md = `Multiple de Mayer ${num(mayer)} : surchauffe, historiquement zone de prises de profits.`; }
    inv.push({ key: 'mayer', label: 'Valorisation (multiple de Mayer)', detail: md, vote: mv, weight: 3 });
  }
  if (Number.isFinite(sma50) && Number.isFinite(sma200)) {
    const cross = lastCross(s50, s200, 20);
    let vote: number;
    let detail: string;
    if (cross?.dir === 1) { vote = 2; detail = `Croisement doré il y a ${cross.barsAgo} j (MM50 passe au-dessus de la MM200).`; }
    else if (cross?.dir === -1) { vote = -2; detail = `Croisement de la mort il y a ${cross.barsAgo} j (MM50 passe sous la MM200).`; }
    else if (sma50 > sma200) { vote = 1; detail = 'MM50 au-dessus de la MM200 : structure haussière.'; }
    else { vote = -1; detail = 'MM50 sous la MM200 : structure baissière.'; }
    inv.push({ key: 'cross', label: 'Structure (MM50 / MM200)', detail, vote, weight: 2 });
  }
  if (Number.isFinite(rsiWeekly)) {
    let vote = 0;
    let detail = `RSI hebdo ${Math.round(rsiWeekly)} : zone neutre.`;
    if (rsiWeekly < 30) { vote = 2; detail = `RSI hebdo ${Math.round(rsiWeekly)} : survente rare sur ce temps long, opportunité historique.`; }
    else if (rsiWeekly < 45) { vote = 1; detail = `RSI hebdo ${Math.round(rsiWeekly)} : momentum faible, prix plutôt bas.`; }
    else if (rsiWeekly > 80) { vote = -2; detail = `RSI hebdo ${Math.round(rsiWeekly)} : euphorie, risque de correction violente.`; }
    else if (rsiWeekly > 65) { vote = -1; detail = `RSI hebdo ${Math.round(rsiWeekly)} : marché chaud.`; }
    inv.push({ key: 'rsiw', label: 'Momentum long (RSI hebdo)', detail, vote, weight: 2 });
  }
  if (ctx.athChangePct != null && Number.isFinite(ctx.athChangePct)) {
    const d = ctx.athChangePct;
    let vote = 0;
    let detail = `À ${pct(d)} de son plus haut historique.`;
    if (d <= -85) { vote = 0; detail = `À ${pct(d)} de son ATH : soit une opportunité, soit un projet en déclin. Vérifie les fondamentaux avant tout.`; }
    else if (d <= -50) { vote = 1; detail = `À ${pct(d)} de son ATH : forte décote si le projet est toujours solide.`; }
    else if (d > -15) { vote = -1; detail = `À ${pct(d)} de son ATH : peu de marge de sécurité.`; }
    inv.push({ key: 'ath', label: 'Distance au plus haut (ATH)', detail, vote, weight: 1 });
  }
  if (ctx.temperature != null && Number.isFinite(ctx.temperature)) {
    const t = ctx.temperature;
    let vote = 0;
    let detail = `Température du marché ${Math.round(t)}/100 : neutre.`;
    if (t < TEMPERATURE.extremeFear) { vote = 2; detail = `Température ${Math.round(t)}/100 : peur extrême, les meilleures opportunités naissent ici.`; }
    else if (t < TEMPERATURE.fear) { vote = 1; detail = `Température ${Math.round(t)}/100 : climat d'accumulation.`; }
    else if (t >= TEMPERATURE.euphoria) { vote = -2; detail = `Température ${Math.round(t)}/100 : euphorie générale, sécurise des gains.`; }
    else if (t >= TEMPERATURE.warm) { vote = -1; detail = `Température ${Math.round(t)}/100 : marché chaud, sois sélectif.`; }
    inv.push({ key: 'cycle', label: 'Contexte de marché (cycle)', detail, vote, weight: 2 });
  }

  // ---------------- Trader ----------------
  const tr: Factor[] = [];
  if (Number.isFinite(sma20) && Number.isFinite(sma50)) {
    let vote: number;
    let detail: string;
    if (price > sma20 && sma20 > sma50) { vote = 2; detail = 'Prix > MM20 > MM50 : tendance court terme haussière bien alignée.'; }
    else if (price > sma20) { vote = 1; detail = 'Prix repasse au-dessus de la MM20 : tentative de rebond.'; }
    else if (sma20 > sma50) { vote = -1; detail = 'Prix sous la MM20 dans une tendance encore haussière : repli en cours.'; }
    else { vote = -2; detail = 'Prix < MM20 < MM50 : tendance court terme baissière.'; }
    tr.push({ key: 'trend', label: 'Tendance court terme', detail, vote, weight: 3 });
  }
  {
    const h0 = last(m.hist) ?? NaN;
    const h1 = last(m.hist, 1) ?? NaN;
    const line = last(m.macd) ?? NaN;
    if (Number.isFinite(h0) && Number.isFinite(h1) && Number.isFinite(line)) {
      const cross = lastCross(m.macd, m.signal, 3);
      let vote: number;
      let detail: string;
      if (cross?.dir === 1) {
        vote = line > 0 ? 2 : 1;
        detail = `Croisement haussier du MACD il y a ${cross.barsAgo} j${line > 0 ? '' : ' (sous la ligne zéro : à confirmer)'}.`;
      } else if (cross?.dir === -1) {
        vote = line < 0 ? -2 : -1;
        detail = `Croisement baissier du MACD il y a ${cross.barsAgo} j${line < 0 ? '' : ' (encore au-dessus de zéro)'}.`;
      } else if (line > 0 && h0 > 0) {
        vote = h0 >= h1 ? 2 : 1;
        detail = h0 >= h1 ? 'MACD positif et en accélération.' : 'MACD positif, le momentum ralentit un peu.';
      } else if (line < 0 && h0 < 0) {
        vote = h0 <= h1 ? -2 : -1;
        detail = h0 <= h1 ? 'MACD négatif et en accélération baissière.' : 'MACD négatif, la baisse ralentit.';
      } else if (line > 0) { vote = 0; detail = 'MACD positif mais sous son signal : essoufflement.'; }
      else { vote = 0; detail = 'MACD négatif mais au-dessus de son signal : la pression vendeuse s’atténue.'; }
      tr.push({ key: 'macd', label: 'Momentum (MACD)', detail, vote, weight: 2 });
    }
  }
  if (Number.isFinite(rsi14)) {
    // Un excès contre la tendance (survente en baisse, surachat en hausse) pèse moins : il peut durer.
    const downTrend = Number.isFinite(sma50) && price < sma50;
    const upTrend = Number.isFinite(sma50) && price > sma50;
    let vote = 0;
    let detail = `RSI ${Math.round(rsi14)} : ni excès d'achat ni de vente.`;
    if (rsi14 < 30) {
      vote = downTrend ? 1 : 2;
      detail = downTrend ? `RSI ${Math.round(rsi14)} : survente, mais contre la tendance — rebond technique possible, pas encore un retournement.` : `RSI ${Math.round(rsi14)} : survente, un rebond est fréquent.`;
    } else if (rsi14 < 40) { vote = downTrend ? 0 : 1; detail = `RSI ${Math.round(rsi14)} : proche de la survente.`; }
    else if (rsi14 > 75) {
      vote = upTrend ? -1 : -2;
      detail = upTrend ? `RSI ${Math.round(rsi14)} : surachat dans une tendance forte — risque de pause ou de correction.` : `RSI ${Math.round(rsi14)} : surachat marqué, risque de correction.`;
    } else if (rsi14 > 65) { vote = upTrend ? 0 : -1; detail = `RSI ${Math.round(rsi14)} : proche du surachat.`; }
    tr.push({ key: 'rsi', label: 'Excès (RSI 14 j)', detail, vote, weight: 1.5 });
  }
  {
    const lo = last(bb.lower) ?? NaN;
    const up = last(bb.upper) ?? NaN;
    if (Number.isFinite(lo) && Number.isFinite(up)) {
      let vote = 0;
      let detail = 'Prix dans ses bandes de Bollinger.';
      if (price < lo) { vote = 1; detail = 'Prix sous la bande de Bollinger basse : excès baissier, souvent suivi d’un retour vers la moyenne.'; }
      else if (price > up) { vote = -1; detail = 'Prix au-dessus de la bande haute : extension, attention au retour vers la moyenne.'; }
      tr.push({ key: 'bb', label: 'Bandes de Bollinger', detail, vote, weight: 1 });
    }
  }
  if (candles.length > 22) {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const prevHigh = highest(highs, 20, candles.length - 2);
    const prevLow = lowest(lows, 20, candles.length - 2);
    const vr = volumeRatio(candles, 20, opts);
    let vote = 0;
    let detail = 'Pas de cassure significative des plus hauts/bas 20 jours.';
    if (price > prevHigh && vr > 1.5) { vote = 2; detail = `Cassure des plus hauts 20 j avec un volume ×${num(vr, 1)} : signal de force.`; }
    else if (price > prevHigh) { vote = 1; detail = 'Cassure des plus hauts 20 j, mais sans volume convaincant.'; }
    else if (price < prevLow && vr > 1.5) { vote = -2; detail = `Cassure des plus bas 20 j avec un volume ×${num(vr, 1)} : signal de faiblesse.`; }
    else if (price < prevLow) { vote = -1; detail = 'Le prix enfonce ses plus bas 20 j.'; }
    tr.push({ key: 'breakout', label: 'Cassure & volume', detail, vote, weight: 2 });
  }

  const investorV1 = combine(inv, 'investor', candles.length);
  const traderV1 = combine(tr, 'trader', candles.length);
  let breakoutVolume: number | null = null;
  if (candles.length > 22) {
    const vr = volumeRatio(candles, 20, opts);
    if (price > highest(candles.map((c) => c.high), 20, candles.length - 2) && vr >= 1.5) breakoutVolume = vr;
  }
  const excess = (Number.isFinite(rsiWeekly) && rsiWeekly > 80) || (Number.isFinite(mayer) && mayer > 2);
  const investor = investorV2(investorV1, ctx.temperature ?? null, candles.length, excess, !!ctx.isBitcoin);
  const trader = traderV2(traderV1, breakoutVolume);

  // ---------------- Niveaux ----------------
  const levels = supportResistance(candles, 5, 2.5, 365);
  const supports = levels.filter((l) => l.price < price).map((l) => l.price);
  const resistances = levels.filter((l) => l.price > price).map((l) => l.price);
  const support = supports.length ? supports[supports.length - 1] : null;
  const resistance = resistances.length ? resistances[0] : null;

  let plan: TradePlan | null = null;
  if (Number.isFinite(atr14) && atr14 > 0) {
    const entry = price;
    let stop = support != null ? support - 0.5 * atr14 : price - 2 * atr14;
    stop = Math.max(stop, price - 3 * atr14);
    if (stop > price - 0.8 * atr14) stop = price - 1.5 * atr14;
    const risk = entry - stop;
    plan = {
      entry,
      stop,
      tp1: entry + 1.5 * risk,
      tp2: entry + 3 * risk,
      exitOnClose: true,
      riskPct: (risk / entry) * 100,
      atr: atr14,
      support,
      resistance,
    };
  }

  const accumulation = Number.isFinite(sma200) ? { low: sma200 * 0.85, high: sma200 * 1.02 } : null;
  const profitZone = Number.isFinite(sma200) ? sma200 * 2 : null;

  return {
    price, sma20, sma50, sma200, rsi14, rsiWeekly, mayer, atrPct,
    change7d: changePct(closes, 7),
    change30d: changePct(closes, 30),
    investor, trader, plan, accumulation, profitZone,
    setups: detectSetups(candles, { s20, s50, s200, r, m, bbWidth: bb.width }, opts),
    bars: candles.length,
  };
}

interface SetupSeries {
  s20: number[];
  s50: number[];
  s200: number[];
  r: number[];
  m: { macd: number[]; signal: number[]; hist: number[] };
  bbWidth: number[];
}

/**
 * Setups de la version 2 : seuls ceux que l'historique soutient (docs/bench/2026-11-15-candidats.md).
 * Retirés : repli en tendance haussière et surachat (inversés), croisements, cassure baissière, compression (sans effet).
 */
export function detectSetups(candles: Candle[], s: SetupSeries, opts: AnalyzeOptions = {}): Setup[] {
  const out: Setup[] = [];
  const n = candles.length;
  if (n < 30) return out;
  const c = candles[n - 1];
  const prev = candles[n - 2];
  const price = c.close;
  const sma50 = s.s50[n - 1];
  const rsi14 = s.r[n - 1];
  const highs = candles.map((k) => k.high);
  const vr = volumeRatio(candles, 20, opts);
  const prevHigh = highest(highs, 20, n - 2);
  if (price > prevHigh && vr > 1.5) out.push({ key: 'breakout', label: 'Cassure avec volume', bias: 'bull', detail: `Plus haut 20 j cassé, volume ×${num(vr, 1)}.` });
  if (rsi14 < 30 && price > prev.close) out.push({ key: 'oversold', label: 'Survente + rebond', bias: 'bull', detail: `RSI ${Math.round(rsi14)} et première bougie verte (prometteur sur 14 jours, pas validé).` });
  const mc = lastCross(s.m.macd, s.m.signal, 3);
  if (mc?.dir === 1 && Number.isFinite(sma50) && price > sma50) out.push({ key: 'macd', label: 'Relance MACD', bias: 'bull', detail: 'MACD repasse au-dessus de son signal, prix au-dessus de la MM50 (prometteur, pas validé).' });
  return out;
}

export const SETUP_KEYS: Record<string, string> = {
  breakout: 'Cassure avec volume',
  oversold: 'Survente + rebond',
  macd: 'Relance MACD',
};
