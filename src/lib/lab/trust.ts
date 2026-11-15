// Verdict de confiance d'un autopilote : calculé sur ses seuls jours en direct, frais compris, avec des critères
// écrits à l'avance (fiche, 9.7). Il redescend tout seul quand les résultats se dégradent : il n'existe pas de
// « confiance aveugle ». Fonction pure ; le tirage aléatoire du bootstrap a une graine fixe (le portefeuille).

import { bootstrapMeans, hashSeed, quantile } from './stats';
import { closedTrades, maxDrawdownPct, tradeStatsOf, twr, type DayPoint } from './metrics';
import type { Fill } from './types';

export interface TrustRules { minDays: number; minTrades: number; minDeposits: number; maxDrawdownPct: number; maxExtraDrawdownPts: number; bootstrapDraws: number; minWindowWinPct: number; withdrawGapPts: number; copyPct: number; copyPctTrusted: number }
export const DEFAULT_TRUST_RULES: TrustRules = { minDays: 90, minTrades: 30, minDeposits: 20, maxDrawdownPct: 25, maxExtraDrawdownPts: 5, bootstrapDraws: 2000, minWindowWinPct: 60, withdrawGapPts: 10, copyPct: 5, copyPctTrusted: 15 };

export type TrustLevel = 'observation' | 'insuffisant' | 'encourageant' | 'fiable' | 'retirée';
export interface TrustCriterion { id: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'; ok: boolean | null; text: string }
export interface TrustVerdict { level: TrustLevel; headline: string; criteria: TrustCriterion[]; copyPct: number | null; withdrawnOn?: string }

export interface TrustInput {
  kind: 'trades' | 'deposits';
  /** Identifiant du portefeuille : graine du bootstrap. */
  seed: string;
  /** Série journalière des jours en direct. */
  live: DayPoint[];
  fills: Fill[];
  /** Référence sur les mêmes jours : DCA Bitcoin simple (échéances) ou Bitcoin gardé (trades). */
  reference: DayPoint[] | null;
  /** 10ᵉ centile des fenêtres de même durée sur l'historique (banc d'essai), en %. */
  bench: { p10: number } | null;
  previous?: TrustVerdict | null;
  /** Jour du calcul (AAAA-MM-JJ) : date d'un éventuel retrait de confiance. */
  today?: string;
}

const pct1 = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')} %`;
const r2 = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')} R`;
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Indices TWR des deux séries sur leurs jours communs. */
function alignedIndexes(a: DayPoint[], b: DayPoint[]): [number[], number[]] {
  const bd = new Map(b.map((p, i) => [p.day, i]));
  const ia: number[] = [];
  const ib: number[] = [];
  let va = 1;
  let vb = 1;
  let prevA: DayPoint | null = null;
  let prevB: DayPoint | null = null;
  for (const p of a) {
    const j = bd.get(p.day);
    if (j == null) continue;
    const q = b[j];
    if (prevA && prevB) {
      const baseA = prevA.valueUsd + p.flowUsd;
      const baseB = prevB.valueUsd + q.flowUsd;
      if (baseA > 0) va *= p.valueUsd / baseA;
      if (baseB > 0) vb *= q.valueUsd / baseB;
    }
    ia.push(va);
    ib.push(vb);
    prevA = p;
    prevB = q;
  }
  return [ia, ib];
}

function recentGapPts(live: DayPoint[], ref: DayPoint[] | null, days = 60): number | null {
  if (!ref || live.length < days) return null;
  const [a, b] = alignedIndexes(live.slice(-days - 1), ref);
  if (a.length < 2) return null;
  return ((a[a.length - 1] / a[0]) - (b[b.length - 1] / b[0])) * 100;
}

export function trustVerdict(i: TrustInput, rules: TrustRules = DEFAULT_TRUST_RULES): TrustVerdict {
  const days = i.live.length;
  const perf = twr(i.live) * 100;
  const mdd = maxDrawdownPct(i.live);
  const criteria: TrustCriterion[] = [];
  const c1 = days >= rules.minDays;
  criteria.push({ id: 'C1', ok: c1, text: `Durée en direct : ${days} jour${days > 1 ? 's' : ''} sur ${rules.minDays}` });
  let c2: boolean;
  let c3: boolean;
  let c4: boolean;
  let c5: boolean;
  let sampleText: string;
  if (i.kind === 'trades') {
    const closed = closedTrades(i.fills);
    const st = tradeStatsOf(closed);
    const rs = closed.map((t) => t.r).filter((r): r is number => r != null);
    const values = rs.length === closed.length && rs.length ? rs : closed.map((t) => t.pnlPct);
    const exp = rs.length === closed.length && rs.length ? st.expectancyR ?? 0 : st.expectancyPct;
    c2 = closed.length >= rules.minTrades;
    sampleText = `${closed.length} trades sur ${rules.minTrades}`;
    criteria.push({ id: 'C2', ok: c2, text: `Trades clos : ${closed.length} sur ${rules.minTrades}` });
    c3 = perf > 0 && exp > 0;
    criteria.push({ id: 'C3', ok: c3, text: `Performance ${pct1(perf)}, espérance ${rs.length === closed.length && rs.length ? r2(exp) : pct1(exp)} par trade` });
    c4 = mdd >= -rules.maxDrawdownPct;
    criteria.push({ id: 'C4', ok: c4, text: `Baisse maximale ${pct1(mdd)} (limite −${rules.maxDrawdownPct} %)` });
    const p5 = values.length >= 2 ? quantile(bootstrapMeans(values, rules.bootstrapDraws, hashSeed(i.seed)), 0.05) : NaN;
    c5 = Number.isFinite(p5) && p5 > 0;
    criteria.push({ id: 'C5', ok: values.length >= 2 ? c5 : null, text: c5 ? 'Espérance positive même dans le pire des cas plausibles (bootstrap)' : 'Espérance : marge d’erreur trop large pour conclure' });
  } else {
    const deposits = i.live.filter((p) => p.flowUsd > 0).length;
    c2 = deposits >= rules.minDeposits;
    sampleText = `${deposits} échéances sur ${rules.minDeposits}`;
    criteria.push({ id: 'C2', ok: c2, text: `Échéances : ${deposits} sur ${rules.minDeposits}` });
    const refPerf = i.reference ? twr(i.reference) * 100 : null;
    c3 = refPerf != null && perf > refPerf;
    criteria.push({ id: 'C3', ok: refPerf == null ? null : c3, text: refPerf == null ? 'Référence indisponible' : `Performance ${pct1(perf)} contre ${pct1(refPerf)} pour le DCA Bitcoin simple` });
    const refDd = i.reference ? maxDrawdownPct(i.reference) : null;
    c4 = refDd != null && mdd >= refDd - rules.maxExtraDrawdownPts;
    criteria.push({ id: 'C4', ok: refDd == null ? null : c4, text: `Baisse maximale ${pct1(mdd)}${refDd != null ? ` (référence ${pct1(refDd)}, marge ${rules.maxExtraDrawdownPts} points)` : ''}` });
    let wins = 0;
    let windows = 0;
    if (i.reference) {
      const [a, b] = alignedIndexes(i.live, i.reference);
      for (let s = 0; s + 30 < a.length; s++) { windows++; if (a[s + 30] / a[s] > b[s + 30] / b[s]) wins++; }
    }
    c5 = windows > 0 && (wins / windows) * 100 >= rules.minWindowWinPct;
    criteria.push({ id: 'C5', ok: windows > 0 ? c5 : null, text: windows ? `Bat la référence sur ${Math.round((wins / windows) * 100)} % des périodes de 30 jours (seuil ${rules.minWindowWinPct} %)` : 'Pas encore de période de 30 jours' });
  }
  const c6 = i.bench ? perf >= i.bench.p10 : null;
  criteria.push({ id: 'C6', ok: c6, text: i.bench ? `Conforme à l’historique : ${pct1(perf)} pour un 10ᵉ centile à ${pct1(i.bench.p10)}` : 'Pas de référence historique pour cette durée' });

  const wasTrusted = i.previous && (i.previous.level === 'encourageant' || i.previous.level === 'fiable' || i.previous.level === 'retirée');
  const gap = recentGapPts(i.live, i.reference);
  const ddBreached = i.kind === 'trades' ? !c4 : i.reference ? !c4 : false;
  if (wasTrusted && (ddBreached || (gap != null && gap <= -rules.withdrawGapPts))) {
    const on = i.previous?.level === 'retirée' && i.previous.withdrawnOn ? i.previous.withdrawnOn : i.today ?? i.live[i.live.length - 1]?.day ?? '';
    const why = ddBreached ? 'baisse maximale dépassée' : `${Math.round(-gap!)} points de retard sur la référence en 60 jours`;
    return { level: 'retirée', headline: `Confiance retirée le ${dm(on)} : ${why}.`, criteria, copyPct: null, withdrawnOn: on };
  }
  if (!c1 || !c2) return { level: 'observation', headline: `En observation : jour ${days} sur ${rules.minDays}, ${sampleText}. Ne copie pas encore.`, criteria, copyPct: null };
  if (!c3 || !c4) return { level: 'insuffisant', headline: `Ne fait pas mieux que ${i.kind === 'trades' ? 'de rester en cash' : 'le DCA Bitcoin simple'}. À ne pas copier.`, criteria, copyPct: null };
  if (!c5 || c6 !== true) return { level: 'encourageant', headline: 'Résultats positifs, mais ce peut encore être de la chance.', criteria, copyPct: rules.copyPct };
  return { level: 'fiable', headline: 'Fiable jusqu’ici. Le verdict se recalcule chaque jour.', criteria, copyPct: rules.copyPctTrusted };
}
