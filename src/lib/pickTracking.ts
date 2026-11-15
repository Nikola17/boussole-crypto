// Pépites suivies en avant : le score des petites capis lit des données qu'on ne peut pas rejouer, donc on le
// juge vers l'avant. Une fois par semaine ISO, l'application note les 10 meilleures candidates et les découvertes
// du panier avec leur prix ; 30 et 90 jours après (dans les 7 jours qui suivent), elle relève le prix et celui de Bitcoin.

import type { PickSnapshot } from '../types';

export const PICK_CARD_MIN_WEEKS = 8;
const TOP = 10;
const WINDOW_DAYS = 7;
const DAY = 86400_000;
const HORIZONS = [30, 90] as const;
const ageDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function weeklyPicks(week: string, day: string, gems: { coinId: string; symbol: string; score: number; priceUsd: number }[], basket: { coinId: string; symbol: string; priceUsd: number }[], btcUsd: number): PickSnapshot {
  const picks: PickSnapshot['picks'] = [];
  const seen = new Set<string>();
  for (const g of [...gems].sort((a, b) => b.score - a.score)) {
    if (picks.length >= TOP) break;
    if (seen.has(g.coinId) || !(g.priceUsd > 0)) continue;
    seen.add(g.coinId);
    picks.push({ coinId: g.coinId, symbol: g.symbol, source: 'gems', score: g.score, priceUsd: g.priceUsd });
  }
  for (const b of basket) {
    if (seen.has(b.coinId) || !(b.priceUsd > 0)) continue;
    seen.add(b.coinId);
    picks.push({ coinId: b.coinId, symbol: b.symbol, source: 'basket', score: null, priceUsd: b.priceUsd });
  }
  return { id: week, week, day, btcUsd, picks };
}

/** Un seul relevé par semaine : le premier de la semaine reste. */
export function recordWeek(snaps: PickSnapshot[], s: PickSnapshot): PickSnapshot[] {
  return snaps.some((x) => x.id === s.id) ? snaps : [...snaps, s];
}

/** Un relevé attend un prix à 30 ou 90 jours. */
export function picksDue(snaps: PickSnapshot[], today: string): boolean {
  return snaps.some((s) => (s.btc30 == null && ageDays(s.day, today) >= 30) || (s.btc90 == null && ageDays(s.day, today) >= 90));
}

/** Relève les prix arrivés à échéance ; fenêtre de 7 jours manquée → 0 (inconnu, non compté). */
export function fillForward(snaps: PickSnapshot[], today: string, priceOf: (coinId: string) => number | null, btcNow: number | null): PickSnapshot[] {
  return snaps.map((s) => {
    let out = s;
    const age = ageDays(s.day, today);
    for (const h of HORIZONS) {
      const btcKey = h === 30 ? 'btc30' : 'btc90';
      const pKey = h === 30 ? 'p30' : 'p90';
      if (out[btcKey] != null || age < h) continue;
      const inWindow = age <= h + WINDOW_DAYS && btcNow != null && btcNow > 0;
      out = {
        ...out,
        [btcKey]: inWindow ? btcNow : 0,
        picks: out.picks.map((p) => ({ ...p, [pKey]: inWindow ? priceOf(p.coinId) ?? 0 : 0 })),
      };
    }
    return out;
  });
}

export interface PickPerf { avgPct: number; vsBtcPts: number; n: number }

export function pickPerformance(snaps: PickSnapshot[], today: string): { weeks: number; at30: PickPerf | null; at90: PickPerf | null; unknown30: number; unknown90: number } {
  const first = snaps.reduce<string | null>((m, s) => (m == null || s.day < m ? s.day : m), null);
  const weeks = first ? Math.floor(ageDays(first, today) / 7) : 0;
  const at = (h: 30 | 90): { perf: PickPerf | null; unknown: number } => {
    const rets: number[] = [];
    const excess: number[] = [];
    let unknown = 0;
    for (const s of snaps) {
      const btcLater = h === 30 ? s.btc30 : s.btc90;
      if (btcLater == null) continue;
      for (const p of s.picks) {
        const later = h === 30 ? p.p30 : p.p90;
        if (!later || !(btcLater > 0) || !(s.btcUsd > 0)) { unknown++; continue; }
        const r = later / p.priceUsd - 1;
        rets.push(r);
        excess.push(r - (btcLater / s.btcUsd - 1));
      }
    }
    const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length) * 100;
    return { perf: rets.length ? { avgPct: mean(rets), vsBtcPts: mean(excess), n: rets.length } : null, unknown };
  };
  const a30 = at(30);
  const a90 = at(90);
  return { weeks, at30: a30.perf, at90: a90.perf, unknown30: a30.unknown, unknown90: a90.unknown };
}
