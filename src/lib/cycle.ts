// « Température du marché » : un indice 0-100 construit à partir d'indicateurs de cycle
// éprouvés sur Bitcoin. 0 = peur extrême / capitulation, 100 = euphorie.

import { rsi, sma, toWeekly, type Candle } from './indicators';
import { TEMPERATURE } from './thresholds';

/** Version des règles de la température du marché (entre dans l'empreinte des stratégies du Labo). */
export const CYCLE_VERSION = 1;

export interface CycleComponent {
  key: string;
  label: string;
  value: string;
  heat: number; // 0-100
  weight: number;
  explain: string;
}

export interface CycleZone {
  key: 'capitulation' | 'accumulation' | 'neutre' | 'chaleur' | 'euphorie';
  label: string;
  action: string;
  dcaMultiplier: number;
  tone: 'up' | 'neutral' | 'down';
}

export interface CycleResult {
  temperature: number;
  zone: CycleZone;
  components: CycleComponent[];
  mayer: number;
  ratio200w: number;
  piCycle: number;
  /** Position dans le cycle de halving : contexte affiché (déjà couvert par Mayer, MM200 sem, Pi). */
  halving: HalvingContext;
}

export interface CycleInputs {
  btcDaily: Candle[];
  fng?: number;
  fundingRate?: number; // taux de financement 8 h (fraction, ex. 0.0001 = 0,01 %)
  mvrv?: number; // ratio MVRV Bitcoin (capitalisation / capital réalisé)
  stableShare?: number; // part des stablecoins dans la capitalisation crypto totale (en %)
}

// Halvings passés (certains) et prochain (estimé) : le repère de long terme du cycle.
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20', '2028-04-15'];

export interface HalvingContext {
  /** Date ISO du dernier halving révolu. */
  last: string;
  /** Date ISO (estimée) du prochain halving. */
  next: string;
  daysSince: number;
  daysToNext: number;
}

/** Position dans le cycle de halving, du dernier révolu au prochain estimé. */
export function halvingContext(now: Date = new Date()): HalvingContext {
  const t = now.getTime();
  let last = HALVINGS[0];
  let next = HALVINGS[1] ?? HALVINGS[0];
  for (let i = 0; i < HALVINGS.length - 1; i++) {
    if (Date.parse(HALVINGS[i]) <= t) { last = HALVINGS[i]; next = HALVINGS[i + 1]; }
  }
  return {
    last,
    next,
    daysSince: Math.max(0, Math.floor((t - Date.parse(last)) / 86400_000)),
    daysToNext: Math.max(0, Math.ceil((Date.parse(next) - t) / 86400_000)),
  };
}

/** Interpolation linéaire par morceaux, bornée à [0, 100]. */
export function piecewise(x: number, points: [number, number][]): number {
  if (!Number.isFinite(x)) return NaN;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points[points.length - 1][1];
}

export function zoneFor(t: number): CycleZone {
  if (t < TEMPERATURE.extremeFear) return { key: 'capitulation', label: 'Peur extrême', action: "Zone d'achat historique : renforce ton DCA (×2) sur BTC/ETH, par paliers, sans tout miser d'un coup.", dcaMultiplier: 2, tone: 'up' };
  if (t < TEMPERATURE.fear) return { key: 'accumulation', label: 'Accumulation', action: 'Bon moment pour accumuler : DCA renforcé (×1,5), privilégie la qualité.', dcaMultiplier: 1.5, tone: 'up' };
  if (t < TEMPERATURE.warm) return { key: 'neutre', label: 'Neutre', action: 'DCA normal, aucun excès : respecte ton plan et ta répartition cible.', dcaMultiplier: 1, tone: 'neutral' };
  if (t < TEMPERATURE.euphoria) return { key: 'chaleur', label: 'Marché chaud', action: 'DCA réduit (×0,5) et prépare tes prises de profits par paliers sur les positions en gain.', dcaMultiplier: 0.5, tone: 'down' };
  return { key: 'euphorie', label: 'Euphorie', action: 'Prends des profits progressivement, stoppe les achats d’altcoins, remonte ta part de stablecoins.', dcaMultiplier: 0.25, tone: 'down' };
}

export function computeCycle({ btcDaily, fng, fundingRate, mvrv, stableShare }: CycleInputs): CycleResult | null {
  if (btcDaily.length < 200) return null;
  const closes = btcDaily.map((c) => c.close);
  const price = closes[closes.length - 1];
  const comps: CycleComponent[] = [];

  if (fng != null && Number.isFinite(fng)) {
    comps.push({
      key: 'fng', label: 'Fear & Greed', value: `${Math.round(fng)}/100`, heat: fng, weight: 25,
      explain: "Sentiment agrégé (volatilité, volumes, réseaux sociaux, dominance). Sous 25 : peur extrême, au-dessus de 75 : avidité.",
    });
  }

  const s200 = sma(closes, 200);
  const mayer = price / s200[s200.length - 1];
  comps.push({
    key: 'mayer', label: 'Multiple de Mayer (BTC)', value: mayer.toFixed(2).replace('.', ','), weight: 25,
    heat: piecewise(mayer, [[0.6, 0], [1.0, 35], [1.5, 65], [2.4, 100]]),
    explain: 'Prix du BTC divisé par sa moyenne 200 jours. Sous 0,8 : zone d’achat historique ; au-dessus de 2,4 : bulle.',
  });

  const weekly = toWeekly(btcDaily);
  const wCloses = weekly.map((w) => w.close);
  let ratio200w = NaN;
  if (wCloses.length >= 200) {
    const s200w = sma(wCloses, 200);
    ratio200w = price / s200w[s200w.length - 1];
    comps.push({
      key: 'ma200w', label: 'Prix / moyenne 200 semaines', value: `${ratio200w.toFixed(2).replace('.', ',')}×`, weight: 20,
      heat: piecewise(ratio200w, [[0.8, 0], [1.0, 15], [1.5, 40], [2.5, 75], [3.5, 100]]),
      explain: 'La moyenne 200 semaines a marqué tous les creux majeurs du Bitcoin. Près de 1× : opportunité rare.',
    });
  }

  const rw = rsi(wCloses, 14);
  const rsiW = rw[rw.length - 1];
  if (Number.isFinite(rsiW)) {
    comps.push({
      key: 'rsiw', label: 'RSI hebdomadaire (BTC)', value: `${Math.round(rsiW)}`, weight: 15,
      heat: piecewise(rsiW, [[30, 0], [50, 45], [70, 75], [85, 100]]),
      explain: 'Au-dessus de 80 en hebdo, le marché est historiquement euphorique ; sous 35, il est épuisé.',
    });
  }

  let piCycle = NaN;
  if (closes.length >= 350) {
    const s111 = sma(closes, 111);
    const s350 = sma(closes, 350);
    piCycle = s111[s111.length - 1] / (2 * s350[s350.length - 1]);
    comps.push({
      key: 'pi', label: 'Indicateur Pi Cycle', value: `${Math.round(piCycle * 100)} %`, weight: 10,
      heat: piecewise(piCycle, [[0.4, 0], [0.7, 50], [1.0, 100]]),
      explain: 'Rapport MM111 / (2 × MM350). À 100 %, il a signalé les sommets de cycle de 2013, 2017 et 2021.',
    });
  }

  if (mvrv != null && Number.isFinite(mvrv)) {
    comps.push({
      key: 'mvrv', label: 'MVRV (BTC)', value: `${mvrv.toFixed(2).replace('.', ',')}×`, weight: 10,
      heat: piecewise(mvrv, [[0.8, 0], [1.0, 25], [1.5, 50], [2.0, 72], [2.5, 85], [3.0, 95], [4.0, 100]]),
      explain: 'Capitalisation divisée par capital réalisé (ce que valent les pièces au prix où elles ont bougé pour la dernière fois). Sous 1 : le marché détient globalement en perte — zone d’accumulation. Au-dessus de 3 : chaque cycle s’y est arrêté (2013, 2017, 2021). Source gratuite retardée de ~7 jours.',
    });
  }

  if (stableShare != null && Number.isFinite(stableShare)) {
    comps.push({
      key: 'stables', label: 'Puissance stablecoins', value: `${stableShare.toFixed(1).replace('.', ',')} % de la crypto`, weight: 5,
      heat: piecewise(stableShare, [[3, 100], [5, 70], [7, 40], [9, 20], [12, 10]]),
      explain: 'Part des stablecoins dans la capitalisation totale : la poudre sèche installée en attendant d’acheter. Une part élevée = du carburant disponible ; une part faible = le capital est déjà investi (et récupérer du cash coûte cher).',
    });
  }

  if (fundingRate != null && Number.isFinite(fundingRate)) {
    const f = fundingRate * 100; // en %
    comps.push({
      key: 'funding', label: 'Taux de financement (perp BTC)', value: `${f.toFixed(3).replace('.', ',')} %`, weight: 5,
      heat: piecewise(f, [[-0.01, 10], [0, 30], [0.01, 50], [0.03, 75], [0.05, 100]]),
      explain: 'Coût payé par les positions longues à effet de levier. Très élevé = excès de spéculation.',
    });
  }

  const wsum = comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.weight : 0), 0);
  const temperature = wsum > 0 ? comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.heat * c.weight : 0), 0) / wsum : 50;

  return { temperature, zone: zoneFor(temperature), components: comps, mayer, ratio200w, piCycle, halving: halvingContext() };
}

/** Indice « saison des altcoins » : part du top 50 (hors stables) qui bat le BTC sur 30 jours. */
export function altSeasonIndex(rows: { id: string; change30d: number | null | undefined }[], btcChange30d: number): number | null {
  const valid = rows.filter((r) => r.id !== 'bitcoin' && r.change30d != null && Number.isFinite(r.change30d));
  if (valid.length < 20 || !Number.isFinite(btcChange30d)) return null;
  const beating = valid.filter((r) => (r.change30d as number) > btcChange30d).length;
  return Math.round((beating / valid.length) * 100);
}
