// Fraîcheur des données de marché : savoir si ce qu'on affiche est récent, et le dire quand ce n'est pas le cas.

export const STALE_AFTER_MS = 20 * 60_000;

export interface Freshness {
  stale: boolean;
  /** Ex. « d’aujourd’hui à 18:40 » ou « du 10/11 à 18:40 » : à afficher après « Données ». */
  label: string;
}

/**
 * `updatedAt` : dernière mise à jour réussie (0 si aucune). Les données sont « anciennes » quand la dernière réponse date de plus de
 * 20 minutes (le marché est rafraîchi toutes les 4 minutes : un tel retard signifie que le réseau ou CoinGecko ne répond plus).
 */
export function freshness(updatedAt: number, now = Date.now(), staleAfterMs = STALE_AFTER_MS): Freshness {
  if (!updatedAt) return { stale: false, label: '' };
  const d = new Date(updatedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const label = `${sameDay ? 'd’aujourd’hui' : `du ${p(d.getDate())}/${p(d.getMonth() + 1)}`} à ${p(d.getHours())}:${p(d.getMinutes())}`;
  return { stale: now - updatedAt > staleAfterMs, label };
}
