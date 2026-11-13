// Calendrier macro/crypto : ce qui peut faire bouger le marché, et quoi faire.
// Les réunions de la Fed (FOMC) et les échéances trimestrielles dérivés sont certaines ;
// les dates de publication du CPI sont des estimations (le BLS les décale parfois) — vérifiables sur
// bls.gov/schedule/news_release/cpi.htm, à corriger ici si besoin (une ligne par mois).

export type MacroKind = 'fomc' | 'cpi' | 'expiry' | 'halving';

export interface MacroEvent {
  id: string;
  /** AAAA-MM-JJ, heure locale de l'utilisateur pour l'affichage (l'heure exacte vit dans `advice`). */
  date: string;
  kind: MacroKind;
  label: string;
  /** Jours restants (0 : aujourd'hui, négatif : passé). */
  daysTo: number;
  /** Ce quedit Boussole : la conduite à tenir autour de cet événement. */
  advice: string;
}

export const MACRO_LABEL: Record<MacroKind, string> = {
  fomc: 'Fed (FOMC)',
  cpi: 'Inflation US (CPI)',
  expiry: 'Échéance dérivés BTC',
  halving: 'Halving Bitcoin',
};

export const MACRO_ADVICE: Record<MacroKind, string> = {
  fomc: 'Décision de taux à 19 h, puis conférence de Powell à 19 h 30 (Paris). Volatilité garantie : évite de passer un ordre dans la demi-heure autour de l’annonce, et garde ta réserve disponible 24 h.',
  cpi: 'Publication à 14 h 30 (Paris). Si tu dois acheter ou vendre, fais-le plutôt à distance de 14 h 25-14 h 45 : la surprise est souvent violente puis digérée.',
  expiry: 'Échéance trimestrielle des futures et options Bitcoin (Deribit, 8 h UTC) : le cours peut bouger au matin sans raison visible, puis s’apaiser. Pas de panique, pas d’achat impulsif sur ce mouvement.',
  halving: 'La récompense de bloc est divisée par deux : l’offre neuve passe de ~450 à ~225 BTC/jour. Historiquement, les 12-18 mois qui suivent sont la partie la plus chaude du cycle — c’est le moment où tes paliers de vente servent.',
};

// Réunions FOMC 2026 (jours de décision : le second jour de chaque réunion).
const FOMC_DAYS = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

// CPI 2026 (estimations : publication vers le 10-15 de chaque mois, 14 h 30 Paris).
const CPI_DAYS = [
  '2026-01-13', '2026-02-11', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10',
  '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-15', '2026-11-12', '2026-12-15',
];

/** Dernier vendredi du mois (échéance trimestrielle des dérivés Bitcoin : mars, juin, septembre, décembre). */
/** Date (AAAA-MM-JJ) du dernier vendredi d'un mois — échéance trimestrielle des dérivés Bitcoin. Exporté pour les tests. */
export function lastFridayOf(year: number, month: number): string {
  const last = new Date(year, month + 1, 0); // dernier jour du mois (mois 0-11)
  const d = new Date(last);
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7)); // vendredi : 0, samedi : -1, dimanche : -2… (recule jusqu'au vendredi inclus)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Jours entiers entre aujourd'hui (date locale) et une date ISO. */
export function daysToIso(isoDate: string, now: Date): number {
  const at = new Date(isoDate + 'T12:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((at.getTime() - today.getTime()) / 86400_000);
}

const mk = (kind: MacroKind, date: string, now: Date, label?: string): MacroEvent => ({
  id: `${kind}:${date}`,
  date,
  kind,
  label: label ?? MACRO_LABEL[kind],
  daysTo: daysToIso(date, now),
  advice: MACRO_ADVICE[kind],
});

/**
 * Événements macro/crypto autour d'une date (ceux passés de moins de 2 jours restent inclus : le brief du matin
 * peut dire « c'est aujourd'hui »). Aucune donnée distante : les échéances de dérivés sont déduites du calendrier,
 * le FOMC et le CPI sont des listes de dates tenues à jour à la main ici (une correction par an suffit).
 */
export function macroEvents(now: Date): MacroEvent[] {
  const year = now.getFullYear();
  const ft: MacroKind[] = ['fomc', 'cpi'];
  const out: MacroEvent[] = [];
  for (const k of ft) for (const d of (k === 'fomc' ? FOMC_DAYS : CPI_DAYS) as string[]) {
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk(k, d, now));
  }
  for (let y = year - 2; y <= year + 2; y++) {
    const d = lastFridayOf(y, 11); // décembre seulement : l'échéance de fin d'année est la plus suivie
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk('expiry', d, now));
    for (const m of [2, 5, 8]) {
      const q = lastFridayOf(y, m);
      if (daysToIso(q, now) >= -2 && daysToIso(q, now) < 400) out.push(mk('expiry', q, now));
    }
  }
  out.sort((a, b) => a.daysTo - b.daysTo);
  return out;
}

/** Les prochains événements, du plus proche au plus lointain (les passés exclus si `skipPast`). */
export function nextMacroEvents(now: Date, max = 4, withinDays = 60): MacroEvent[] {
  return macroEvents(now).filter((e) => e.daysTo >= 0 && e.daysTo <= withinDays).slice(0, max);
}

/** « Demain », « dans 3 jours », « aujourd'hui » : la petite phrase sous chaque événement. */
export function macroWhen(e: MacroEvent): string {
  if (e.daysTo === 0) return "aujourd'hui";
  if (e.daysTo === 1) return 'demain';
  if (e.daysTo < 0) return 'en cours';
  return `dans ${e.daysTo} jours`;
}
