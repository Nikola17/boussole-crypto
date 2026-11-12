// Un cycle de surveillance : lire la sync chiffrée, évaluer alertes et paliers, envoyer sur Telegram,
// consommer les alertes du faisceau distant, envoyer le brief du jour si c'est l'heure.
// Toutes les entrées-sorties sont injectées (cycle.test.ts déroule la chaîne complète avec de faux services).

import { seal, unseal } from '../lib/sync/crypto';
import { CONFLICT } from '../lib/sync/github';
import type { SyncBundle } from '../lib/sync/merge';
import { isoDay } from '../lib/format';
import { buildPositions } from '../lib/portfolio';
import type { RunnerConfig } from './config';
import { type RunnerState, markSent, pruneSent, recordStatus, RUNG_REPEAT_MS, shouldSend } from './state';
import { alertKey, alertMessage, consumeAlerts, hitAlerts, hitRungs, rungKey, rungMessage, watchOf } from './evaluate';
import { buildBrief } from './brief';
import type { CoinPrice } from './market';

export interface RemoteFile {
  sha: string | null;
  /** Texte chiffré « BC1|… » tel que GitHub le stocke. */
  content: string;
}

export interface CycleDeps {
  /** Fichier de synchronisation distant (null : il n'existe pas encore). */
  fetchRemote: () => Promise<RemoteFile | null>;
  /** Réécriture du fichier distant ; rejette avec le message « conflict » si l'empreinte n'est plus la bonne. */
  pushRemote: (text: string, sha: string | null) => Promise<void>;
  /** Envoi Telegram d'un message. */
  telegram: (text: string) => Promise<void>;
  /** Prix CoinGecko pour une liste d'identifiants. */
  prices: (ids: string[]) => Promise<Record<string, CoinPrice>>;
  /** Fear & Greed du jour (null : indisponible — le brief s'en passe). */
  fearGreed: () => Promise<{ value: number; label: string } | null>;
}

export interface CycleOptions {
  /** Mode diagnostic : rien n'est envoyé, rien n'est consommé ; `onDry` reçoit ce qui serait parti. */
  dry: boolean;
  /** Envoyer le brief même si l'heure habituelle n'est pas venue (commande --brief). */
  forceBrief: boolean;
  onDry?: (text: string) => void;
}

export interface CycleResult {
  sent: number;
  consumed: number;
  error: string | null;
  /** Alertes de prix encore armées vues dans ce cycle. */
  watching: number;
}

export interface RemoteBundle extends SyncBundle {
  device?: string;
  savedAt?: string;
}

/** Identifiants CoinGecko utiles à ce cycle : positions du journal, alertes armées, échéances, Bitcoin. */
export function coinsOf(bundle: SyncBundle, watch: ReturnType<typeof watchOf>): string[] {
  const ids = new Set<string>(['bitcoin']);
  for (const coinId of buildPositions(watch.transactions).keys()) if (coinId) ids.add(coinId);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) ids.add(a.coinId);
  const ref = (v: unknown) => { if (v && typeof v === 'object') { const c = v as { coinId?: string }; if (c.coinId) ids.add(c.coinId); } };
  const arr = (k: string): unknown[] => (Array.isArray(bundle.data[k as keyof typeof bundle.data]) ? (bundle.data[k as keyof typeof bundle.data] as unknown[]) : []);
  for (const p of arr('dcaPlans')) ref(p);
  const basket = bundle.data.basket;
  if (basket && typeof basket === 'object') {
    const b = basket as { core?: unknown[]; discovery?: unknown[] };
    for (const c of [...(b.core ?? []), ...(b.discovery ?? [])]) ref(c);
  }
  return [...ids];
}

/** Vérifie qu'un objet déchiffré a bien la tête d'un faisceau Boussole ; sinon erreur claire. */
function asBundle(v: unknown): RemoteBundle {
  if (!v || typeof v !== 'object' || !(v as RemoteBundle).data || !Array.isArray((v as RemoteBundle).deletions)) {
    throw new Error('Le fichier de synchronisation ne contient pas des données Boussole.');
  }
  return v as RemoteBundle;
}

export async function runCycle(cfg: RunnerConfig, st: RunnerState, opts: CycleOptions, deps: CycleDeps, now = new Date()): Promise<{ state: RunnerState; result: CycleResult }> {
  const nowMs = now.getTime();
  const dayKey = isoDay(now);
  let state = pruneSent(st, nowMs);
  const result: CycleResult = { sent: 0, consumed: 0, error: null, watching: 0 };
  const send = async (text: string): Promise<void> => {
    if (opts.dry) { opts.onDry?.(text); return; }
    await deps.telegram(text);
  };

  const remote = await deps.fetchRemote();
  if (!remote) {
    const err = `Le fichier ${cfg.syncPath} n’existe pas encore dans ${cfg.syncRepo} : active la synchronisation dans l’application (Réglages) et laisse-la écrire une première fois.`;
    return { state: recordStatus(state, false, err, nowMs), result: { ...result, error: err } };
  }

  const bundle = asBundle(await unseal(remote.content, cfg.passphrase));
  const watch = watchOf(bundle);
  const priceRows = await deps.prices(coinsOf(bundle, watch));
  const priceMap = new Map<string, number>();
  for (const [id, p] of Object.entries(priceRows)) if (typeof p.usd === 'number' && p.usd > 0) priceMap.set(id, p.usd);
  result.watching = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;

  // 1. Alertes de prix atteintes, et paliers de vente (journal) atteints non vendus, pas encore envoyés par ce serveur.
  const queue: { key: string; text: string; alertId?: string }[] = [];
  for (const { alert, price } of hitAlerts(watch, priceMap)) {
    const key = alertKey(alert.id);
    if (shouldSend(state, key, nowMs)) queue.push({ key, text: alertMessage(alert, price), alertId: alert.id });
  }
  for (const t of hitRungs(watch, priceMap)) {
    const key = rungKey(t.coinId, t.multiple);
    if (shouldSend(state, key, nowMs, RUNG_REPEAT_MS)) queue.push({ key, text: rungMessage(t) });
  }

  // 2. Envoi : une alerte n'est marquée envoyée qu'APRÈS un envoi réussi ; le premier échec arrête (on réessaie au cycle suivant).
  const consumedIds: string[] = [];
  for (const m of queue) {
    if (opts.dry) { opts.onDry?.(m.text); continue; } // à blanc : montré, jamais compté ni marqué
    try {
      await deps.telegram(m.text);
      state = markSent(state, [m.key], nowMs);
      result.sent++;
      if (m.alertId) consumedIds.push(m.alertId);
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
  }

  // 3. Consommation des alertes de prix dans le faisceau distant : l'application les verra déclenchées à
  //    sa propre synchronisation et ne les re-notifiera pas. Conflit (l'autre appareil vient d'écrire) : on n'insiste pas.
  if (consumedIds.length && !opts.dry) {
    try {
      const next = consumeAlerts(bundle, consumedIds, now.toISOString());
      const sealed = await seal({ ...next, device: cfg.device, savedAt: now.toISOString() }, cfg.passphrase);
      await deps.pushRemote(sealed, remote.sha);
      result.consumed = consumedIds.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.error = result.error ?? (msg === CONFLICT ? 'l’autre appareil vient d’écrire la synchronisation : la consommation passera au prochain cycle' : msg);
    }
  }

  // 4. Brief quotidien : une fois par jour, après l'heure choisie, tant qu'il n'est pas parti.
  const dueBrief = opts.forceBrief || (cfg.briefEnabled && now.getHours() >= cfg.briefHour && state.lastBriefDay !== dayKey);
  if (dueBrief) {
    const brief = buildBrief({ now, bundle, prices: priceRows, fng: await deps.fearGreed(), currency: cfg.currency, syncSavedAt: bundle.savedAt ?? null, syncDevice: bundle.device ?? null });
    try {
      await send(brief);
      if (!opts.dry) state = { ...state, lastBriefDay: dayKey };
    } catch (e) {
      result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    }
  }

  state = recordStatus(state, result.error == null, result.error, nowMs);
  return { state, result };
}
