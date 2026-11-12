// État local du runner, persisté sur le serveur (aucun secret dedans : ce sont des dates
// et des clés de dédoublonnage). Mêmes règles de fiabilité que le script Android public/runners/alerts.js :
// une alerte n'est marquée envoyée qu'APRÈS l'envoi réussi, un échec réseau ne consomme jamais rien.

export interface RunnerState {
  /** Clé de dédoublonnage → dernier envoi réussi (ms). Ex : « alert:a1 », « exit:solana:2 ». */
  sent: Record<string, number>;
  /** Jour (AAAA-MM-JJ) du dernier brief quotidien envoyé. */
  lastBriefDay: string | null;
  /** Dernier contrôle réussi (ms) ; null si aucun. */
  okAt: number | null;
  /** Dernière tentative, réussie ou non (ms). */
  attemptAt: number | null;
  /** Dernière erreur rencontrée (jamais de secret). */
  error: string | null;
}

const DAY_MS = 24 * 3600_000;
/** Une clé d'alerte notifiée est gardée 30 jours, puis nettoyée (l'alerte est normalement consommée bien avant). */
export const SENT_RETENTION_MS = 30 * DAY_MS;
/** Un palier de vente atteint mais pas vendu est rappelé au rythme d'une fois par semaine. */
export const RUNG_REPEAT_MS = 7 * DAY_MS;

export function emptyState(): RunnerState {
  return { sent: {}, lastBriefDay: null, okAt: null, attemptAt: null, error: null };
}

/** Lit un état depuis un texte JSON (fichier corrompu ou absent : on repart de zéro, rien n'est perdu côté application). */
export function parseState(json: string | null | undefined): RunnerState {
  if (!json) return emptyState();
  try {
    const r = JSON.parse(json) as Partial<RunnerState>;
    const sent = (r.sent && typeof r.sent === 'object' && !Array.isArray(r.sent)) ? r.sent : {};
    const out: RunnerState = { sent: {}, lastBriefDay: typeof r.lastBriefDay === 'string' ? r.lastBriefDay : null, okAt: typeof r.okAt === 'number' ? r.okAt : null, attemptAt: typeof r.attemptAt === 'number' ? r.attemptAt : null, error: typeof r.error === 'string' ? r.error : null };
    for (const [k, v] of Object.entries(sent)) if (typeof v === 'number' && Number.isFinite(v)) out.sent[k] = v;
    return out;
  } catch {
    return emptyState();
  }
}

/** Supprime les clés trop vieilles ; renvoie un nouvel objet si quelque chose a changé, sinon l'original. */
export function pruneSent(state: RunnerState, now: number): RunnerState {
  const kept: Record<string, number> = {};
  let changed = false;
  for (const [k, at] of Object.entries(state.sent)) {
    if (now - at > SENT_RETENTION_MS) changed = true;
    else kept[k] = at;
  }
  return changed ? { ...state, sent: kept } : state;
}

/**
 * Faut-il envoyer cette clé maintenant ?
 *  - jamais envoyée : oui ;
 *  - déjà envoyée : non, sauf rappel périodique (paliers : une fois par semaine tant que rien n'est vendu).
 */
export function shouldSend(state: RunnerState, key: string, now: number, repeatMs: number | null = null): boolean {
  const at = state.sent[key];
  if (at == null) return true;
  if (repeatMs == null) return false;
  return now - at >= repeatMs;
}

/** Note un envoi réussi (après l'envoi, jamais avant). */
export function markSent(state: RunnerState, keys: string[], now: number): RunnerState {
  if (!keys.length) return state;
  const sent = { ...state.sent };
  for (const k of keys) sent[k] = now;
  return { ...state, sent };
}

/** Statut d'un contrôle : réussite ou échec, pour le journal et le moment où ça remarche. */
export function recordStatus(state: RunnerState, ok: boolean, error: string | null, now: number): RunnerState {
  const out: RunnerState = { ...state, attemptAt: now };
  if (ok) { out.okAt = now; out.error = null; } else out.error = error ?? 'erreur inconnue';
  return out;
}
