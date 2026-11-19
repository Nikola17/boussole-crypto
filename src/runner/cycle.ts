// Un cycle de surveillance : lire la sync chiffrée, évaluer alertes et paliers, envoyer sur Telegram,
// consommer les alertes du faisceau distant, envoyer le brief du jour si c'est l'heure.
// Toutes les entrées-sorties sont injectées (cycle.test.ts déroule la chaîne complète avec de faux services).

import { seal, unseal } from '../lib/sync/crypto';
import { CONFLICT } from '../lib/sync/github';
import type { SyncBundle } from '../lib/sync/merge';
import { isoDay } from '../lib/format';
import { buildPositions, isStable } from '../lib/portfolio';
import { computeCycle } from '../lib/cycle';
import type { Candle } from '../lib/indicators';
import type { RunnerConfig } from './config';
import { type RunnerState, dropQuiet, holdQuiet, inQuietWindow, markSent, pruneSent, quietMessage, recordStatus, shouldSend } from './state';
import { alertKey, alertMessage, consumeAlerts, hitAlerts, hitRungs, priceLabel, rungKey, rungMessage, watchOf, zoneMessage, type MessageCurrency } from './evaluate';
import { buildBrief, slotsOfDay } from './brief';
import type { CoinPrice } from './market';
import { isHotNews, newsKey, type NewsItem, type RatedNews, type WatchedCoin } from './news';
import { eventKey, refsOf, relevantEvents, smartBriefLines, smartMessage, type SmartEvent } from '../lib/smartmoney';
import { nextMacroEvents } from '../lib/macro';
import { upcomingDated, upcomingUnlocks } from '../lib/unlocks';
import { copyAlertText, copyRiskFlag, type TraderStats } from '../lib/copyWatch';
import { fundingAlertText, fundingVerdict } from '../lib/funding';
import { buildDashboardStatus, type DashboardStatus } from './dashboard';
import type { SmartWallet } from '../types';
import type { AutopilotRun } from './autopilot';
import { advanceSignals, signalMessage } from './signals';
import { addMoves, judgeMoves, movesDue, movesFromEvents } from '../lib/smartScore';
import { tradeHits } from '../lib/lab/tradeCheck';
import type { TradeEntry } from '../types';
import type { SmartMove } from '../types';
import { reliabilityOf, reliabilityPhrase } from '../lib/lab/reliability';

const DAY_MS = 24 * 3600_000;
/** Une même zone de marché ne re-sonne pas plus d'une fois par semaine (les allers-retours rapides restent silencieux). */
const ZONE_REPEAT_MS = 7 * DAY_MS;

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
  /** Historique journalier BTC (null : indisponible — pas d'alerte de zone ce cycle-ci). */
  btcDaily: () => Promise<Candle[] | null>;
  /** Taux de financement du perpétuel BTC (null : indisponible). */
  funding: () => Promise<number | null>;
  /** Ratio MVRV Bitcoin (null : indisponible — la composante reste absente, jamais inventée). */
  mvrv: () => Promise<number | null>;
  /** Part des stablecoins dans la capitalisation totale, en % (null : indisponible). */
  stableShare: () => Promise<number | null>;
  /** Actus fraîches des cryptos suivies ([] : indisponible ou veille désactivée). */
  news: (coins: WatchedCoin[]) => Promise<NewsItem[]>;
  /** Notes d'importance et résumés IA des actus (sans clé : valeurs à zéro). */
  aiRates: (items: NewsItem[]) => Promise<{ importance: number; resume: string }[]>;
  /** Mouvements d'un wallet suivi depuis un instant donné (facultatif : désactivé, aucune clé, aucune erreur). */
  smartEvents?: (wallets: SmartWallet[], sinceMs: number, nowMs: number) => Promise<SmartEvent[]>;
  /** Digest « pépites émergentes » du brief du matin (facultatif) : une ligne par candidate, déjà rédigée. */
  emerging?: (wallets: SmartWallet[]) => Promise<string[]>;
  /** Autopilotes et ordres papier (facultatif) : faisceau mis à jour, messages et lignes du brief. */
  autopilot?: (bundle: SyncBundle, nowMs: number) => Promise<AutopilotRun>;
  /** Signaux suivis du jour par crypto (positions et watchlist ; le serveur ajoute les 20 premières). */
  /** Bougies 1 heure récentes d'un trade ouvert du journal (stop et objectif surveillés). */
  tradeBars?: (coinId: string, symbol: string, fromMs: number, toMs: number) => Promise<Candle[]>;
  /** Prix des tokens (DexScreener) par adresse en minuscules : notation des wallets suivis. */
  tokenPrices?: (chain: string, mints: string[]) => Promise<Map<string, number>>;
  signals?: (coins: { coinId: string; symbol: string }[]) => Promise<Record<string, { symbol: string; keys: string[] }>>;
  /** Dashboard web (optionnel) : reçoit le statut public ASSAINI à écrire dans le dossier servi par nginx. Jamais appelé en mode « à blanc ». */
  status?: (s: DashboardStatus) => void;
  /** Stats publiques des traders de la watchlist copy trading (clé = id du trader). */
  copyStats?: (traders: { id: string; portfolioId?: string }[]) => Promise<Record<string, TraderStats | null>>;
  /** Taux de financement (par 8 h) d'un perp USDT (ex : BTCUSDT). */
  fundingOf?: (symbolUsdt: string) => Promise<number | null>;
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
  for (const t of watch.paperTrades) ids.add(t.coinId); // le papier est valorisé aux mêmes prix réels
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

/** Cryptos à suivre en presse : positions et alertes, sans le cœur (couvert par le brief), ni les stablecoins. */
export function newsCoinsOf(watch: ReturnType<typeof watchOf>): WatchedCoin[] {
  const seen = new Map<string, WatchedCoin>();
  const add = (coinId: string | undefined, symbol: string, name: string) => {
    if (!coinId || seen.has(coinId)) return;
    if (coinId === 'bitcoin' || coinId === 'ethereum' || isStable(symbol, coinId)) return;
    seen.set(coinId, { coinId, name });
  };
  for (const p of buildPositions(watch.transactions).values()) add(p.coinId, p.symbol, p.name);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) add(a.coinId, a.symbol, a.name);
  return [...seen.values()].slice(0, 12);
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
  // Autopilotes du Labo : même calcul que l'application ; leurs journaux partent dans l'écriture unique du faisceau.
  let working: SyncBundle = bundle;
  let autopilotChanged = 0;
  let autopilotLines: string[] = [];
  let autopilotEvents: { key: string; text: string }[] = [];
  if (cfg.autopilotEnabled && deps.autopilot) {
    const r = await deps.autopilot(bundle, nowMs).catch(() => null);
    if (r) { working = r.bundle; autopilotChanged = r.changed; autopilotLines = r.briefLines; autopilotEvents = r.events; }
  }
  // Mode vacances : veille critique uniquement (alertes de prix, paliers), le bruit s'arrête.
  const onVacation = !!watch.vacationUntil && watch.vacationUntil >= dayKey;
  const priceRows = await deps.prices(coinsOf(bundle, watch));
  const priceMap = new Map<string, number>();
  for (const [id, p] of Object.entries(priceRows)) if (typeof p.usd === 'number' && p.usd > 0) priceMap.set(id, p.usd);
  result.watching = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;

  // Taux EUR/USD du jour, lu sur le prix du Bitcoin : les messages partent dans la devise de l'utilisateur.
  const eurPerUsd = (priceRows.bitcoin?.usd && priceRows.bitcoin.eur ? priceRows.bitcoin.eur / priceRows.bitcoin.usd : 0.92);
  const cur: MessageCurrency = { currency: cfg.currency, eurPerUsd };

  // 1. Alertes de prix atteintes, et paliers de vente (journal) atteints non vendus, pas encore envoyés par ce serveur.
  //    Un palier n'est envoyé qu'une fois : il reste rappelé chaque jour dans le brief tant que la vente n'est pas enregistrée.
  const queue: { key: string; text: string; alertId?: string }[] = [];
  for (const { alert, price } of hitAlerts(watch, priceMap)) {
    const key = alertKey(alert.id);
    if (shouldSend(state, key)) queue.push({ key, text: alertMessage(alert, price, cur), alertId: alert.id });
  }
  for (const t of hitRungs(watch, priceMap)) {
    const key = rungKey(t.coinId, t.multiple);
    if (shouldSend(state, key)) queue.push({ key, text: rungMessage(t, cur) });
  }

  // 1 bis. Déblocages de tokens suivis : alerte J-1 (demain) puis J-0 (le jour J), une fois chacun.
  //         Veille critique : envoyés même en mode vacances.
  for (const u of upcomingUnlocks(watch.unlocks, dayKey, 1)) {
    const badge = u.daysUntil === 0 ? 'J-0' : 'J-1';
    const key = `unlock:${u.id}:${badge}`;
    if (shouldSend(state, key)) {
      const qty = u.amount != null ? ` (${u.amount})` : '';
      const pct = u.pctSupply != null ? ` — ${u.pctSupply} % de l’offre totale` : '';
      queue.push({ key, text: `${badge === 'J-0' ? 'Aujourd’hui' : 'Demain'} : déblocage ${u.symbol.toUpperCase()}${qty}${pct}${u.note ? ` — ${u.note}` : ''}.
Prépare ta décision : vendre, garder, ou attendre — et à quel palier.` });
    }
  }

  // 1 bis bis. Événements Launchpool/Launchpad suivis : alertes J-7, J-1 puis J-0, une fois chacune.
  if (!onVacation) {
    for (const ev of upcomingDated(watch.launchEvents, dayKey, 7)) {
      if (![0, 1, 7].includes(ev.daysUntil)) continue;
      const badge = ev.daysUntil === 0 ? 'J-0' : ev.daysUntil === 1 ? 'J-1' : 'J-7';
      const key = `launch:${ev.id}:${badge}`;
      if (shouldSend(state, key)) {
        const fin = ev.endDate ? ` → fin le ${ev.endDate}` : '';
        queue.push({ key, text: `${badge === 'J-0' ? 'Aujourd’hui' : badge === 'J-1' ? 'Demain' : 'Dans 7 jours'} : ${ev.name} (débute ${ev.date}${fin})${ev.note ? ` — ${ev.note}` : ''}. Vérifie les conditions (lock de BNB…) sur binance.com/earn.` });
      }
    }
  }

  // 1 bis ter. Watchlist copy trading : stats publiques des traders suivis ; alerte quand le risque monte (1×/jour/trader).
  if (!onVacation && watch.copyTraders.length && deps.copyStats) {
    const stats = await deps.copyStats(watch.copyTraders).catch(() => ({}) as Record<string, TraderStats | null>);
    for (const t of watch.copyTraders) {
      const st = stats[t.id] ?? (t.portfolioId ? stats[t.portfolioId] ?? null : null);
      if (!st || copyRiskFlag(st) === 'ok') continue;
      const key = `copy:${t.id}:${dayKey}`;
      if (shouldSend(state, key)) queue.push({ key, text: copyAlertText(t.name, st) });
    }
  }

  // 1 bis quat. Funding extrême sur les perps de tes 5 plus grosses lignes (1 alerte/jour/symbole).
  if (!onVacation && deps.fundingOf) {
    const top = [...buildPositions(watch.transactions).values()]
      .filter((p) => p.quantity > 0 && !isStable(p.symbol, p.coinId))
      .sort((a, b) => ((priceMap.get(b.coinId) ?? 0) * b.quantity) - ((priceMap.get(a.coinId) ?? 0) * a.quantity))
      .slice(0, 5);
    for (const p of top) {
      const sym = `${p.symbol.toUpperCase()}USDT`;
      const rate = await deps.fundingOf(sym).catch(() => null);
      if (rate == null || fundingVerdict(rate) === 'normal') continue;
      const key = `funding:${sym}:${dayKey}`;
      if (shouldSend(state, key)) queue.push({ key, text: fundingAlertText(sym, rate) });
    }
  }

  // 1 bis. Température du marché (mêmes indicateurs que l'application) : un changement de zone prévient sur Telegram,
  //      application fermée. Au premier passage, la zone est seulement mémorisée.
  const fng = await deps.fearGreed().catch(() => null);
  const temperature = await marketTemperature(deps, fng);
  if (temperature) {
    if (!state.zoneLabel) {
      if (!opts.dry) state = { ...state, zoneLabel: temperature.zone.label };
    } else if (!onVacation && state.zoneLabel !== temperature.zone.label) {
      const key = `zone:${temperature.zone.label}`;
      const last = state.sent[key];
      if (last == null || nowMs - last >= ZONE_REPEAT_MS) queue.push({ key, text: zoneMessage(temperature.zone, temperature.temperature, state.zoneLabel) });
    }
  }

  // 1 bis ter. Calendrier macro/crypto : un événement qui arrive aujourd'hui ou demain est annoncé une fois,
  //      avec la conduite à tenir (Fed, CPI, échéance de dérivés — le halving, lui, est un repère de long terme).
  for (const ev of (onVacation ? [] : nextMacroEvents(now, 3, 2))) {
    const key = `macro:${ev.id}`;
    if (state.sent[key] == null) {
      queue.push({ key, text: `${ev.daysTo === 0 ? 'Aujourd’hui' : 'Demain'} : ${ev.label}\n${ev.advice}` });
    }
  }

  // 1 ter. Veille presse : les actus fraîches des cryptos suivies sont notées (IA si configurée, sinon heuristique
  //      de mots-clés). Seules les importantes partent en alerte ; les non-importantes sont marquées vues pour
  //      ne pas être réévaluées sans fin. Un échec de l'IA ne marque rien : réévaluation au cycle suivant.
  const ratedNews: RatedNews[] = [];
  const newsAlerts: { key: string; text: string }[] = [];
  const seenNews: string[] = [];
  if (cfg.newsEnabled && !onVacation) {
    const coins = newsCoinsOf(watch);
    const fresh = coins.length ? await deps.news(coins).catch(() => [] as NewsItem[]) : [];
    const candidates = fresh
      .filter((n) => nowMs - n.publishedAt < 15 * 3600_000) // une actu a 15 h pour devenir une alerte
      .filter((n) => state.sent[newsKey(n)] == null)
      .slice(0, 8);
    const ratings = candidates.length ? await deps.aiRates(candidates).catch(() => candidates.map(() => ({ importance: 0, resume: '' }))) : [];
    const hasAi = !!cfg.mistralApiKey;
    for (const [i, n] of candidates.entries()) {
      const r = ratings[i] ?? { importance: 0, resume: '' };
      const key = newsKey(n);
      const important = r.importance >= 6 || (!hasAi && isHotNews(n));
      if (important && newsAlerts.length < 3) {
        newsAlerts.push({ key, text: newsMessage({ ...n, ...r }) });
      } else {
        // Notée sans importance (décision IA, ou heuristique sans IA) : vue, pour ne pas tourner en rond.
        // Une réponse IA manquante (importance 0) n'est jamais marquée : on réessaiera au cycle suivant.
        // Une actu importante au-delà de la limite de 3 par cycle n'est pas marquée non plus : elle attendra le suivant.
        if (hasAi ? (r.importance > 0 && r.importance < 6) : !isHotNews(n)) seenNews.push(key);
      }
    }
    // Les actus des briefs du jour : les mêmes, notées, même si elles ne partent pas en alerte.
    const ratedOf = new Map(candidates.map((n, i) => [n.url, ratings[i] ?? { importance: 0, resume: '' }]));
    for (const n of fresh) {
      const r = ratedOf.get(n.url) ?? { importance: 0, resume: '' };
      ratedNews.push({ ...n, ...r });
    }
    ratedNews.sort((a, b) => b.publishedAt - a.publishedAt);
    if (seenNews.length && !opts.dry) state = markSent(state, seenNews, nowMs);
  }
  queue.push(...newsAlerts);

  // 1 quat. Smart money : les wallets publics suivis (fonds, préparateurs actifs…) ne préviennent que pour
  //      les tokens de TA liste — watched du DEX, positions du journal, alertes armées. Leur VENTE est le
  //      signal : c'est elle qui fait relire la thèse de sortie. Un échec de lecture ne consomme jamais rien.
  const smartRecent: SmartEvent[] = [];
  const smartAlerts: { key: string; text: string }[] = [];
  const alertedKeys = new Map<string, { walletId: string; atMs: number }>();
  const smartCursorNext: Record<string, number> = {};
  if (cfg.smartMoneyEnabled && !onVacation && watch.smartWallets.length && deps.smartEvents) {
    // Un wallet ajouté à l'instant se suit à partir de maintenant (2 h de recul), l'historique n'est pas rejoué.
    const sinceOf = (id: string): number => state.smCursor[id] ?? nowMs - 2 * 3600_000;
    const sinceMs = Math.min(...watch.smartWallets.slice(0, 12).map((w) => sinceOf(w.id)));
    const evts = await deps.smartEvents(watch.smartWallets.slice(0, 12), sinceMs, nowMs).catch(() => [] as SmartEvent[]);
    smartRecent.push(...evts);
    const refs = refsOf({
      watched: watch.watchedTokens,
      positions: [...buildPositions(watch.transactions).values()],
      alerts: watch.alerts,
    });
    const relevant = new Set(relevantEvents(evts, refs));
    for (const e of evts) {
      const key = eventKey(e);
      const isAlert = relevant.has(e) && shouldSend(state, key);
      if (isAlert && smartAlerts.length < 3) {
        smartAlerts.push({ key, text: smartMessage(e, nowMs) });
        alertedKeys.set(key, { walletId: e.walletId, atMs: e.atMs });
      } else {
        // Déjà alerté, hors de ta liste, ou au-delà de la limite du cycle : traité, le curseur avance.
        smartCursorNext[e.walletId] = Math.max(smartCursorNext[e.walletId] ?? 0, e.atMs);
      }
    }
  }
  queue.push(...smartAlerts);

  // 1 huit. Trades ouverts du journal : stop ou objectif touché sur les 3 dernières bougies 1 heure → un message, une fois.
  if (deps.tradeBars) {
    const open = (Array.isArray(bundle.data.trades) ? bundle.data.trades as TradeEntry[] : []).filter((t) => t.status === 'open' && (t.stopLoss != null || t.takeProfit != null));
    if (open.length) {
      const bars = new Map<string, Candle[]>();
      for (const t of open.slice(0, 20)) {
        const b = await deps.tradeBars(t.coinId, t.symbol, nowMs - 3 * 3600_000, nowMs).catch(() => [] as Candle[]);
        bars.set(t.id, b);
      }
      for (const h of tradeHits(open, (t) => bars.get(t.id) ?? [])) {
        if (!shouldSend(state, h.key)) continue;
        const what = h.kind === 'stop' ? 'stop touché' : 'objectif atteint';
        queue.push({ key: h.key, text: `Trade ${h.trade.symbol.toUpperCase()} : ${what} (${priceLabel(h.level, cur)}).\nOuvre Boussole pour clôturer le trade dans ton journal.` });
      }
    }
  }

  // 1 sept. Wallets suivis notés : chaque mouvement au prix connu entre dans smartMoves (300 au plus), puis
  //         reçoit le prix du token 7 et 30 jours après. Écrit dans l'écriture unique du faisceau.
  let smartMovesChanged = false;
  if (cfg.smartMoneyEnabled && deps.tokenPrices) {
    const before = (Array.isArray(working.data.smartMoves) ? working.data.smartMoves : []) as SmartMove[];
    const due = movesDue(before, nowMs);
    const wanted = new Map<string, Set<string>>();
    const want = (chain: string | undefined, mint: string | undefined) => {
      if (!chain || !mint) return;
      if (!wanted.has(chain)) wanted.set(chain, new Set());
      wanted.get(chain)!.add(mint);
    };
    for (const e of smartRecent) want(e.chain, e.mint);
    for (const m of due) want(m.chain, m.mint);
    if (wanted.size) {
      const prices = new Map<string, number>();
      for (const [chain, mints] of wanted) {
        const got = await deps.tokenPrices(chain, [...mints]).catch(() => new Map<string, number>());
        for (const [k, v] of got) prices.set(k.toLowerCase(), v);
      }
      const stamp = new Date(nowMs).toISOString();
      const added = addMoves(before, movesFromEvents(smartRecent, prices).map((m) => ({ ...m, updatedAt: stamp })));
      const judged = judgeMoves(added, nowMs, (m) => (m.mint ? prices.get(m.mint.toLowerCase()) ?? null : null));
      const next = judged.moves.map((m, i) => (m !== added[i] ? { ...m, updatedAt: stamp } : m));
      if (next.length !== before.length || next.some((m, i) => m !== before[i])) {
        working = { ...working, data: { ...working.data, smartMoves: next } };
        smartMovesChanged = true;
      }
    }
  }

  // 1 sext. Alertes de signal : une fois par jour, après la clôture de la bougie journalière (0 h 10 UTC).
  const utcDay = now.toISOString().slice(0, 10);
  if (cfg.signalAlertsEnabled && deps.signals && state.signals?.day !== utcDay && now.getUTCHours() * 60 + now.getUTCMinutes() >= 10) {
    const watchIds = Array.isArray(bundle.data.watchlist) ? (bundle.data.watchlist as string[]) : [];
    const coins = new Map<string, string>();
    for (const p of buildPositions(watch.transactions).values()) if (p.coinId && p.quantity > 0) coins.set(p.coinId, p.symbol);
    for (const id of watchIds) if (!coins.has(id)) coins.set(id, id);
    const today = await deps.signals([...coins].map(([coinId, symbol]) => ({ coinId, symbol }))).catch(() => null);
    if (today) {
      const r = advanceSignals({ active: state.signals?.active ?? {}, starts: state.signals?.starts ?? {} }, today, utcDay);
      // Premier calcul : on mémorise sans prévenir (sinon tous les états en cours sonneraient d'un coup).
      if (state.signals && !onVacation) {
        let n = 0;
        for (const e of r.events) {
          if (n >= 3 || !shouldSend(state, e.key)) continue;
          queue.push({ key: e.key, text: signalMessage(e, reliabilityPhrase(reliabilityOf(e.signal))) });
          n++;
        }
      }
      if (!opts.dry) state = { ...state, signals: { day: utcDay, ...r.state } };
    }
  }

  // 1 quint. Autopilotes (papier) : ordres du jour, stops et objectifs, ordres manuels exécutés. Pas en vacances.
  if (cfg.autopilotTelegram && !onVacation) for (const e of autopilotEvents) if (shouldSend(state, e.key)) queue.push(e);

  // 2. Envoi. Silence nocturne : rien ne part entre quietStart et quietEnd — les alertes attendent en file
  //    (regroupées par clé, heures réelles conservées) et partent en un seul message à la fin de la nuit.
  const consumedIds: string[] = [];
  const quiet = inQuietWindow(cfg.quietStart, cfg.quietEnd, now);
  if (quiet && queue.length && !opts.dry) {
    state = holdQuiet(state, queue, nowMs);
    queue.length = 0;
  }
  if (!quiet && Object.keys(state.quietQueue).length && !opts.dry) {
    // Fin de nuit (premier cycle hors fenêtre) : un digest unique réveille le matin avec tout ce qui s'est passé.
    const held = Object.entries(state.quietQueue);
    const digest = quietMessage(held.map(([, v]) => v), cfg.timeZone);
    try {
      await send(digest);
      const heldKeys = new Set(held.map(([k]) => k));
      const heldIds = held.flatMap(([, v]) => (v.alertId ? [v.alertId] : []));
      state = markSent(state, [...heldKeys], nowMs);
      state = dropQuiet(state, [...heldKeys]);
      // La nuit a peut-être changé la zone : le message s'est envolé avec le digest, la référence suit.
      const lastZone = [...held].reverse().find(([k]) => k.startsWith('zone:'));
      if (lastZone && temperature && state.zoneLabel !== temperature.zone.label && lastZone[1].text.includes(temperature.zone.label)) {
        state = { ...state, zoneLabel: temperature.zone.label };
      }
      result.sent++;
      consumedIds.push(...heldIds);
      // La même alerte repérée par CE cycle (avant l'envoi du digest) ne part qu'une fois : elle est déjà dedans.
      for (let i = queue.length - 1; i >= 0; i--) if (heldKeys.has(queue[i].key)) queue.splice(i, 1);
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      // Le digest n'est pas parti : il attendra le prochain cycle, les alertes restent tenues.
    }
  }
  // Une alerte n'est marquée envoyée qu'APRÈS un envoi réussi ; le premier échec arrête (on réessaie au cycle suivant).
  for (const m of queue) {
    if (opts.dry) { opts.onDry?.(m.text); continue; } // à blanc : montré, jamais compté ni marqué
    try {
      await deps.telegram(m.text);
      state = markSent(state, [m.key], nowMs);
      result.sent++;
      if (m.alertId) consumedIds.push(m.alertId);
      if (alertedKeys.has(m.key)) {
        // L'alerte smart money vient de partir : ce wallet est lu jusqu'à ce mouvement au prochain cycle.
        const a = alertedKeys.get(m.key)!;
        state = { ...state, smCursor: { ...state.smCursor, [a.walletId]: Math.max(state.smCursor[a.walletId] ?? 0, a.atMs) } };
      }
      if (m.key.startsWith('zone:') && temperature && temperature.zone.label !== state.zoneLabel) {
        // le changement de zone vient de partir : la nouvelle zone devient la référence
        state = { ...state, zoneLabel: temperature.zone.label };
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
  }

  // Smart money : les mouvements traités sans alerte (hors liste, déjà envoyés…) font avancer le curseur
  // de lecture ; les alertes qui n'ont pas pu partir gardent leur place, elles repartent au prochain cycle.
  if (Object.keys(smartCursorNext).length && !opts.dry) {
    const smCursor = { ...state.smCursor };
    let moved = false;
    for (const [id, at] of Object.entries(smartCursorNext)) {
      if (at > (smCursor[id] ?? 0)) { smCursor[id] = at; moved = true; }
    }
    if (moved) state = { ...state, smCursor };
  }

  // 3. Consommation des alertes de prix dans le faisceau distant : l'application les verra déclenchées à
  //    sa propre synchronisation et ne les re-notifiera pas. Conflit (l'autre appareil vient d'écrire) : on n'insiste pas.
  if ((consumedIds.length || autopilotChanged || smartMovesChanged) && !opts.dry) {
    try {
      const next = consumedIds.length ? consumeAlerts(working, consumedIds, now.toISOString()) : working;
      const sealed = await seal({ ...next, device: cfg.device, savedAt: now.toISOString() }, cfg.passphrase);
      await deps.pushRemote(sealed, remote.sha);
      result.consumed = consumedIds.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.error = result.error ?? (msg === CONFLICT ? 'l’autre appareil vient d’écrire la synchronisation : l’écriture passera au prochain cycle' : msg);
    }
  }

  // 5. Briefs du jour : matin (complet), puis ouverture et clôture des marchés américains (formes courtes avec actus).
  //    Chaque créneau part une fois par jour, après son heure, tant qu'il n'est pas parti (--brief force le matin).
  for (const slot of slotsOfDay(cfg, now)) {
    if (slot.id === 'matin' && !cfg.briefEnabled) continue;
    if (!(opts.forceBrief && slot.id === 'matin') && slot.atMs != null && nowMs < slot.atMs) continue;
    if (!(opts.forceBrief && slot.id === 'matin') && state.lastBriefSlot[slot.id] === dayKey) continue;
    // Le digest émergent ne vit que dans le brief du matin : une passe par jour, jamais dans les formes courtes.
    let emergingLines: string[] | undefined;
    if (slot.id === 'matin' && cfg.emergingEnabled && deps.emerging) {
      emergingLines = await deps.emerging(watch.smartWallets).catch(() => []);
    }
    const brief = buildBrief({
      now, bundle, prices: priceRows, fng, currency: cfg.currency,
      syncSavedAt: bundle.savedAt ?? null, syncDevice: bundle.device ?? null,
      temperature: temperature ? { value: temperature.temperature, zoneLabel: temperature.zone.label } : null,
      cycleMetrics: temperature ? { mvrv: temperature.mvrv, stableShare: temperature.stableShare, halvingDaysToNext: temperature.halvingDaysToNext } : null,
      slot: slot.id, news: ratedNews.slice(0, 6), smart: smartBriefLines(smartRecent, nowMs),
      emerging: emergingLines, vacationUntil: onVacation ? watch.vacationUntil : null, autopilots: autopilotLines,
    });
    try {
      await send(brief);
      if (!opts.dry) state = { ...state, lastBriefSlot: { ...state.lastBriefSlot, [slot.id]: dayKey } };
    } catch (e) {
      result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    }
  }

  state = recordStatus(state, result.error == null, result.error, nowMs);

  // Dashboard web : statut public assaini (aucun secret), écrit seulement si configuré et hors « à blanc ».
  if (!opts.dry && deps.status) {
    try {
      deps.status(buildDashboardStatus({
        now, device: cfg.device, result, state, fng,
        temperature: temperature ? { value: temperature.temperature, zoneLabel: temperature.zone.label } : null,
        btcPrice: priceRows.bitcoin ?? null,
        unlocks: watch.unlocks, launchEvents: watch.launchEvents,
        syncSavedAt: bundle.savedAt ?? null, syncDevice: bundle.device ?? null,
      }));
    } catch { /* le dashboard ne doit jamais casser la surveillance */ }
  }
  return { state, result };
}

/** Message Telegram d'une actu importante : titre, source, ancienneté, résumé IA le cas échéant. */
export function newsMessage(n: RatedNews, now = new Date()): string {
  const age = Math.max(0, now.getTime() - n.publishedAt);
  const ago = age < 3600_000 ? `il y a ${Math.max(1, Math.round(age / 60_000))} min` : age < 24 * 3600_000 ? `il y a ${Math.round(age / 3600_000)} h` : `il y a ${Math.round(age / 86400_000)} jours`;
  const lines = [`Presse — ${n.coinName}`, `« ${n.title} »${n.source ? ` (${n.source}, ${ago})` : ` (${ago})`}`];
  if (n.resume) lines.push(n.resume.replace(/\s+/g, ' ').trim().slice(0, 600));
  return lines.join('\n');
}

/**
 * Température du marché, calculée avec les mêmes indicateurs que l'application (Fear & Greed, multiple de Mayer,
 * moyenne 200 semaines, RSI hebdomadaire, Pi Cycle, taux de financement). Indisponible (null) : pas d'alerte ce cycle-ci.
 */
export async function marketTemperature(deps: Pick<CycleDeps, 'btcDaily' | 'funding' | 'mvrv' | 'stableShare'>, fng: { value: number } | null): Promise<{ temperature: number; zone: { key: string; label: string; action: string }; mvrv: number | null; stableShare: number | null; halvingDaysToNext: number | null } | null> {
  const btcDaily = await deps.btcDaily().catch(() => null);
  if (!btcDaily) return null;
  const funding = await deps.funding().catch(() => null);
  const [mvrv, stableShare] = await Promise.all([
    deps.mvrv().catch(() => null),
    deps.stableShare().catch(() => null),
  ]);
  const r = computeCycle({ btcDaily, fng: fng?.value, fundingRate: funding ?? undefined, mvrv: mvrv ?? undefined, stableShare: stableShare ?? undefined });
  return r ? { temperature: r.temperature, zone: { key: r.zone.key, label: r.zone.label, action: r.zone.action }, mvrv, stableShare, halvingDaysToNext: r.halving.daysToNext } : null;
}
