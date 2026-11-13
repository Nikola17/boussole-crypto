// Évite de répéter une notification : chaque alerte a une clé, et n'est envoyée qu'une fois pendant sa durée de validité.

const KEY = 'boussole-notified';
const KEEP_MS = 60 * 86400_000;
/** Un palier de vente atteint n'est notifié qu'UNE fois : sa clé vit indéfiniment (il disparaît quand la vente est enregistrée). */
export const EXIT_TTL_MS = 10 * 365 * 86400_000;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): Store | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Renvoie true (et mémorise) si l'alerte `key` n'a pas déjà été envoyée depuis moins de `ttlMs`. */
export function claimNotification(key: string, ttlMs: number, now: number = Date.now(), storage: Store | null = safeStorage()): boolean {
  if (!storage) return true;
  let map: Record<string, number> = {};
  try {
    map = JSON.parse(storage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    map = {};
  }
  const last = map[key];
  if (typeof last === 'number' && (ttlMs >= EXIT_TTL_MS ? last > 0 : now - last < ttlMs)) return false;
  map[key] = now;
  for (const k of Object.keys(map)) if (!k.startsWith('exit:') && now - map[k] > KEEP_MS) delete map[k];
  try {
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* stockage indisponible : on prévient quand même */
  }
  return true;
}

/** Lundi (AAAA-MM-JJ) de la semaine de `d` : clé des alertes hebdomadaires. */
export function weekKey(d: Date = new Date()): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}
