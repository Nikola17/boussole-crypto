// Bilan de la semaine : DCA faits ou manqués, réserve, règles respectées, écart avec Bitcoin.

export interface WeeklyInput {
  /** Échéances prévues depuis lundi jusqu'à aujourd'hui (AAAA-MM-JJ). */
  scheduled: string[];
  executions: { periodKey: string; skipped?: boolean; investedUsd: number; reserveDeltaUsd: number }[];
  budgetUsd: number;
  reserveUsd: number;
  lines: number;
  maxLines: number;
  tinyLines: number;
  discoveryLines: number;
  maxDiscoveryLines: number;
  /** Écart (en %) entre ton portefeuille et « tout en Bitcoin », quand il est calculable. */
  vsBtcPct: number | null;
  temperature: number | null;
}

export interface WeeklyItem {
  tone: 'ok' | 'warn' | 'info';
  text: string;
}

export interface WeeklyReport {
  scheduled: number;
  done: number;
  skipped: number;
  missed: number;
  investedUsd: number;
  items: WeeklyItem[];
}

const n = (x: number, d = 0) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR');

export function weeklyReview(i: WeeklyInput): WeeklyReport {
  const byKey = new Map(i.executions.map((e) => [e.periodKey, e]));
  let done = 0;
  let skipped = 0;
  let missed = 0;
  let invested = 0;
  for (const day of i.scheduled) {
    const e = byKey.get(day);
    if (!e) missed++;
    else if (e.skipped) skipped++;
    else { done++; invested += e.investedUsd; }
  }
  const items: WeeklyItem[] = [];
  const total = i.scheduled.length;
  if (total === 0) items.push({ tone: 'info', text: 'Aucune échéance de panier cette semaine pour l’instant.' });
  else if (missed === 0) items.push({ tone: 'ok', text: `${done + skipped} échéance${done + skipped > 1 ? 's' : ''} sur ${total} traitée${done + skipped > 1 ? 's' : ''}${skipped ? ` (dont ${skipped} sautée${skipped > 1 ? 's' : ''} volontairement)` : ''}.` });
  else items.push({ tone: 'warn', text: `${missed} échéance${missed > 1 ? 's' : ''} manquée${missed > 1 ? 's' : ''} sur ${total} : le DCA ne vaut que par sa régularité.` });
  if (total > 0) items.push({ tone: 'info', text: `${n(invested, 2)} USDC investis sur ${n(i.budgetUsd * total, 2)} de budget ; réserve à ${n(i.reserveUsd, 2)} USDC.` });
  if (i.lines > i.maxLines) items.push({ tone: 'warn', text: `${i.lines} lignes pour un maximum de ${i.maxLines} : regroupe les plus petites.` });
  else if (i.tinyLines > 0) items.push({ tone: 'warn', text: `${i.tinyLines} ligne${i.tinyLines > 1 ? 's' : ''} sous le poids minimal : à regrouper ou à renforcer.` });
  else items.push({ tone: 'ok', text: `${i.lines} ligne${i.lines > 1 ? 's' : ''}, aucune sous le poids minimal.` });
  if (i.discoveryLines > i.maxDiscoveryLines) items.push({ tone: 'warn', text: `${i.discoveryLines} lignes « découverte » ouvertes (maximum ${i.maxDiscoveryLines}).` });
  if (i.vsBtcPct != null) items.push({ tone: 'info', text: i.vsBtcPct >= 0 ? `Ton portefeuille devance Bitcoin seul de ${n(i.vsBtcPct, 1)} % sur les mêmes montants.` : `Bitcoin seul ferait ${n(-i.vsBtcPct, 1)} % mieux sur les mêmes montants.` });
  if (i.temperature != null) items.push({ tone: 'info', text: `Température du marché : ${n(i.temperature)}/100.` });
  return { scheduled: total, done, skipped, missed, investedUsd: invested, items };
}
