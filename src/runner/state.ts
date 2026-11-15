// État local du runner, persisté sur le serveur (aucun secret dedans : ce sont des dates
// et des clés de dédoublonnage). Mêmes règles de fiabilité que le script Android public/runners/alerts.js :
// une alerte n'est marquée envoyée qu'APRÈS l'envoi réussi, un échec réseau ne consomme jamais rien.

export interface RunnerState {
  /** Clé de dédoublonnage → dernier envoi réussi (ms). Ex : « alert:a1 », « exit:solana:2 », « news:ab12cd34 ». */
  sent: Record<string, number>;
  /** Jour (AAAA-MM-JJ) du dernier brief envoyé, par créneau : « matin », « us-open », « us-close ». */
  lastBriefSlot: Record<string, string>;
  /** Dernière zone de marché constatée (peur extrême, accumulation, neutre, chaleur, euphorie) : un changement déclenche une alerte. */
  zoneLabel: string | null;
  /** Silence nocturné — alertes mises en attente (clé → {texte, date}) : elles partent regroupées à la fin de la nuit. */
  quietQueue: Record<string, { text: string; at: number; alertId?: string }>;
  /** Smart money — jusqu'où chaque wallet suivi a été lu (ms) : au-delà, tout est déjà traité. */
  smCursor: Record<string, number>;
  /** Alertes de signal : dernier jour calculé (UTC), signaux actifs par crypto, début de chaque épisode. */
  signals?: { day: string; active: Record<string, string[]>; starts: Record<string, string> };
  /** Dernier contrôle réussi (ms) ; null si aucun. */
  okAt: number | null;
  /** Dernière tentative, réussie ou non (ms). */
  attemptAt: number | null;
  /** Dernière erreur rencontrée (jamais de secret). */
  error: string | null;
}

const DAY_MS = 24 * 3600_000;
/** Une clé d'alerte notifiée est gardée 30 jours, puis nettoyée (l'alerte est normalement consommée bien avant) ;
 *  les paliers (« exit: ») passés sont gardés sans limite : ils ne sonnent qu'une fois, jusqu'à la vente enregistrée. */
export const SENT_RETENTION_MS = 30 * DAY_MS;

export function emptyState(): RunnerState {
  return { sent: {}, lastBriefSlot: {}, zoneLabel: null, quietQueue: {}, smCursor: {}, okAt: null, attemptAt: null, error: null };
}

/** Lit un état depuis un texte JSON (fichier corrompu ou absent : on repart de zéro, rien n'est perdu côté application). */
export function parseState(json: string | null | undefined): RunnerState {
  if (!json) return emptyState();
  try {
    const r = JSON.parse(json) as Record<string, unknown>;
    const sent = (r.sent && typeof r.sent === 'object' && !Array.isArray(r.sent)) ? r.sent : {};
    const slots = (r.lastBriefSlot && typeof r.lastBriefSlot === 'object' && !Array.isArray(r.lastBriefSlot)) ? r.lastBriefSlot : {};
    const out: RunnerState = { sent: {}, lastBriefSlot: {}, zoneLabel: typeof r.zoneLabel === 'string' ? r.zoneLabel : null, quietQueue: {}, smCursor: {}, okAt: typeof r.okAt === 'number' ? r.okAt : null, attemptAt: typeof r.attemptAt === 'number' ? r.attemptAt : null, error: typeof r.error === 'string' ? r.error : null };
    // Ancien champ « dernier brief du jour » : le brief du matin déjà parti pour ce jour-là n'est pas renvoyé.
    if (typeof r.lastBriefDay === 'string' && typeof (slots as Record<string, unknown>).matin === 'undefined') out.lastBriefSlot.matin = r.lastBriefDay;
    for (const [k, v] of Object.entries(slots)) if (typeof v === 'string') out.lastBriefSlot[k] = v;
    for (const [k, v] of Object.entries(sent)) if (typeof v === 'number' && Number.isFinite(v)) out.sent[k] = v;
    const quietRaw = r.quietQueue;
    if (quietRaw && typeof quietRaw === 'object' && !Array.isArray(quietRaw)) {
      for (const [k, v] of Object.entries(quietRaw)) {
        const q = v as { text?: unknown; at?: unknown; alertId?: unknown };
        if (typeof q.text === 'string' && q.text.trim() && typeof q.at === 'number' && Number.isFinite(q.at)) {
          out.quietQueue[k] = { text: q.text, at: q.at, ...(typeof q.alertId === 'string' ? { alertId: q.alertId } : {}) };
        }
      }
    }
    const sig = r.signals as { day?: unknown; active?: unknown; starts?: unknown } | undefined;
    if (sig && typeof sig.day === 'string' && sig.active && typeof sig.active === 'object' && sig.starts && typeof sig.starts === 'object') out.signals = { day: sig.day, active: sig.active as Record<string, string[]>, starts: sig.starts as Record<string, string> };
    const cursorRaw = r.smCursor;
    if (cursorRaw && typeof cursorRaw === 'object' && !Array.isArray(cursorRaw)) {
      for (const [k, v] of Object.entries(cursorRaw)) if (typeof v === 'number' && Number.isFinite(v)) out.smCursor[k] = v;
    }
    return out;
  } catch {
    return emptyState();
  }
}

/** Supprime les clés trop vieilles ; renvoie un nouvel objet si quelque chose a changé, sinon l'original. Les paliers restent. */
export function pruneSent(state: RunnerState, now: number): RunnerState {
  const kept: Record<string, number> = {};
  let changed = false;
  for (const [k, at] of Object.entries(state.sent)) {
    if (k.startsWith('exit:')) { kept[k] = at; continue; }
    if (now - at > SENT_RETENTION_MS) changed = true;
    else kept[k] = at;
  }
  return changed ? { ...state, sent: kept } : state;
}

/**
 * Faut-il envoyer cette clé maintenant ? Une clé déjà envoyée ne se renvoie jamais : le rappel hebdomadaire
 * des paliers atteints a été retiré (il reste rappelé chaque jour dans le brief tant que rien n'est vendu).
 */
export function shouldSend(state: RunnerState, key: string): boolean {
  return state.sent[key] == null;
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

/** Sommes-nous dans la fenêtre de silence nocturne ? Heures entières locales ; 23→8 traverse minuit ; identiques = jamais. */
export function inQuietWindow(start: number, end: number, now: Date): boolean {
  if (start === end) return false;
  const h = now.getHours();
  return start < end ? (h >= start && h < end) : (h >= start || h < end);
}

/** Alertes mises en attente pour la nuit : une même clé ne garde que sa version la plus récente (regroupement, pas de spam). */
export function holdQuiet(state: RunnerState, items: { key: string; text: string; alertId?: string }[], now: number): RunnerState {
  if (!items.length) return state;
  const quietQueue = { ...state.quietQueue };
  for (const it of items) quietQueue[it.key] = { text: it.text, at: now, alertId: it.alertId };
  return { ...state, quietQueue };
}

/** Vider la file d'attente de la nuit (les clés repartent marquées envoyées par l'appelant, après l'envoi réel). */
export function dropQuiet(state: RunnerState, keys: string[]): RunnerState {
  if (!keys.length) return state;
  const quietQueue = { ...state.quietQueue };
  for (const k of keys) delete quietQueue[k];
  return { ...state, quietQueue };
}

/** Le message qui rassemble les alertes de la nuit : une ligne par alerte, heure d'origine au format local. */
export function quietMessage(items: { text: string; at: number }[], timeZone = 'Europe/Paris'): string {
  const fmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone });
  const lines = items
    .sort((a, b) => a.at - b.at)
    .map((it) => `${fmt.format(new Date(it.at))} — ${it.text.split('\n')[0]}`);
  const shown = lines.slice(0, 8);
  if (lines.length > 8) shown.push(`+ ${lines.length - 8} autre${lines.length > 9 ? 's' : ''} pendant la nuit`);
  return ['Pendant la nuit, sans réveiller personne :', ...shown].join('\n');
}
