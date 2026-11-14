// Discipline de l'investisseur : ce que le mois dit de ta régularité — échéances traitées, achats d'impulsion,
// sorties[propres], journal à chaud tenu. Un score honnête (jamais flatteur) et des faits, pas des jugements.
// Fonctions pures, testées : le bilan ne dépend ni du réseau, ni de l'heure.

import type { HotNote } from '../types';

export interface DisciplineInput {
  /** Jours d'échéance du mois (AAAA-MM-JJ), toutes échéances prévues (panier, plans DCA). */
  scheduledDays: string[];
  /** Jours où une échéance a été traitée (faite ou sautée volontairement) : la régularité se juge là. */
  handledDays: string[];
  /** Achats du mois : jour + symbole (les achats prévus comptent, les impulsions aussi — c'est le but). */
  buys: { date: string; symbol: string }[];
  /** Ventes du mois (jour + symbole) : les sorties liées à un palier planifié comptent mieux que les paniques. */
  sells: { date: string; symbol: string }[];
  /** Journal à chaud du mois : la mémoire du vécu, la preuve que tu te regarde agir. */
  notes: HotNote[];
}

export interface DisciplineReport {
  /** 0-100 : régularité 50, achats maîtrisés 30, journal tenu 20. */
  score: number;
  dueCount: number;
  doneCount: number;
  missedCount: number;
  /** Achats hors des jours prévus : pas interdits, mais nommés pour ce qu'ils sont. */
  impulseBuys: { date: string; symbol: string }[];
  items: { tone: 'ok' | 'warn' | 'info'; text: string }[];
}

export function isSameMonth(day: string, month: string): boolean {
  return day.slice(0, 7) === month;
}

/** Le mois en cours (« 2026-11 ») d'une date quelconque, pour préremplir le bilan. */
export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

export function disciplineMonth(i: DisciplineInput, month: string): DisciplineReport {
  const inMonth = <T extends { date: string }>(xs: T[]): T[] => xs.filter((x) => isSameMonth(x.date, month));
  const scheduled = i.scheduledDays.filter((d) => isSameMonth(d, month));
  const handled = new Set(i.handledDays.filter((d) => isSameMonth(d, month)));
  const done = scheduled.filter((d) => handled.has(d)).length;
  const missed = scheduled.length - done;
  const schedSet = new Set(scheduled);
  const buysOf = inMonth(i.buys);
  const impulse = buysOf.filter((b) => !schedSet.has(b.date));
  const notesOf = inMonth(i.notes.map((n) => ({ date: n.date, n }))).map((x) => x.n);

  // Régularité (50 pts) : les échéances traitées, aucune journée laissée dans le flou.
  const regularity = scheduled.length === 0 ? 50 : Math.round((done / scheduled.length) * 50);
  // Maîtrise (30 pts) : chaque achat hors échéance enlève 6 pts — cinq impulsions vident la marge.
  const control = Math.max(0, 30 - impulse.length * 6);
  // Journal à chaud (20 pts) : tenu, c'est-à-dire au moins une note par tranche de mouvements notables.
  const journal = Math.min(20, Math.round((notesOf.length / 4) * 20));
  const score = Math.max(0, Math.min(100, regularity + control + journal));

  const items: DisciplineReport['items'] = [];
  if (scheduled.length === 0) items.push({ tone: 'info', text: 'Aucune échéance programmée ce mois-ci : mets en place le panier avant de juger la discipline.' });
  else if (missed === 0) items.push({ tone: 'ok', text: `${done} échéance${done > 1 ? 's' : ''} sur ${scheduled.length} traitée${done > 1 ? 's' : ''} : la régularité est là.` });
  else items.push({ tone: 'warn', text: `${missed} échéance${missed > 1 ? 's' : ''} manquée${missed > 1 ? 's' : ''} sur ${scheduled.length} : le DCA ne vaut que par sa régularité.` });
  if (impulse.length === 0) items.push({ tone: 'ok', text: `${buysOf.length} achat${buysOf.length > 1 ? 's' : ''} ce mois-ci, tous sur des jours programmés.` });
  else items.push({ tone: 'warn', text: `${impulse.length} achat${impulse.length > 1 ? 's' : ''} hors échéance${impulse.length > 1 ? 's' : ''} (${impulse.slice(0, 3).map((b) => `${b.symbol.toUpperCase()} le ${b.date.slice(8)}`).join(', ')}${impulse.length > 3 ? '…' : ''}) : nomme-les, ou attends le prochain jour programmé.` });
  if (notesOf.length === 0) items.push({ tone: 'info', text: 'Aucune note à chaud ce mois-ci : la prochaine alerte déclenchée, écris ce que tu en as fait.' });
  else items.push({ tone: 'ok', text: `${notesOf.length} note${notesOf.length > 1 ? 's' : ''} à chaud : tu te regardes agir, c'est ça la discipline.` });

  return { score, dueCount: scheduled.length, doneCount: done, missedCount: missed, impulseBuys: impulse, items };
}
