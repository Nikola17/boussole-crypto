// Runner Boussole — surveillance 24/7 sur un serveur (application fermée) + alertes et brief sur Telegram.
//
//   node boussole-runner.mjs                          boucle permanente (contrôle toutes les N minutes)
//   node boussole-runner.mjs --once                   un seul cycle, en vrai (envoie ce qui est dû)
//   node boussole-runner.mjs --check                  diagnostic à blanc : rien n'est envoyé, rien n'est écrit
//   node boussole-runner.mjs --brief                  envoie le brief quotidien maintenant
//   node boussole-runner.mjs --discover               affiche le chat id à mettre dans la configuration
//   node boussole-runner.mjs --config <chemin>        fichier de configuration (défaut : ~/.config/boussole/runner.json)
//
// Ce fichier est la colle Node : les décisions vivent dans src/runner/cycle.ts (testées).
// Secrets : jamais journalisés, jamais écrits ailleurs que dans le fichier de configuration (chmod 600) ou
// dans l'environnement du service. Le fichier de synchronisation GitHub reste chiffré de bout en bout.
//
// Nécessite Node ≥ 20 (crypto.subtle, fetch, btoa/atob globaux) et, pour « échéance du jour » et « brief du
// matin », le même fuseau que toi (le service systemd installe TZ=Europe/Paris).

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fetchRemote, pushRemote } from '../lib/sync/github';
import { applyEnv, validateConfig, type RunnerConfig } from './config';
import { emptyState, parseState, type RunnerState } from './state';
import { runCycle, type CycleDeps } from './cycle';
import { fetchBtcDaily, fetchBtcFunding, fetchFearGreed, fetchMvrv, fetchPrices, fetchStablecoinShare } from './market';
import { recentChats, sendMessage } from './telegram';
import { fetchCoinNews, type NewsItem, type WatchedCoin } from './news';
import { fetchAllWalletEvents, walletHoldings } from '../api/smartmoney';
import { getNewPools, networkByKey, type DexPool } from '../api/dex';
import { scanEvm, scanSolana } from '../api/security';
import { emergingCandidates, emergingLine } from '../lib/emerging';
import type { SmartWallet } from '../types';
import { rateNews } from './ai';
import type { Candle } from '../lib/indicators';

const log = (msg: string): void => {
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(`${when} ${msg}\n`);
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv: string[]): { configPath: string; mode: 'loop' | 'once' | 'check' | 'brief' | 'discover' } {
  let configPath = '';
  let mode: 'loop' | 'once' | 'check' | 'brief' | 'discover' = 'loop';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' || a === '-c') configPath = argv[++i] ?? '';
    else if (a === '--once') mode = 'once';
    else if (a === '--check') mode = 'check';
    else if (a === '--brief') mode = 'brief';
    else if (a === '--discover') mode = 'discover';
    else if (a === '--help' || a === '-h') mode = 'check';
    else throw new Error(`Option inconnue : ${a}. Options : --config <chemin>, --once, --check, --brief, --discover.`);
  }
  if (!configPath) configPath = join(homedir(), '.config', 'boussole', 'runner.json');
  return { configPath, mode };
}

function loadConfig(path: string, allowMissingChatId: boolean): RunnerConfig {
  // Le fichier peut être absent : tous les secrets peuvent venir de l'environnement du service.
  const raw = existsSync(path) ? ((JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>)) : {};
  const { config, problems } = validateConfig(applyEnv(raw), { allowMissingChatId });
  if (!config) throw new Error(`Configuration incomplète (${path}) :\n- ${problems.join('\n- ')}`);
  return config;
}

// ---------------------------------------------------------------- état local

const defaultStateDir = (): string => join(homedir(), '.local', 'state', 'boussole');

const stateFileOf = (cfg: RunnerConfig): string => join(cfg.stateDir || defaultStateDir(), 'runner-state.json');

function loadState(cfg: RunnerConfig): RunnerState {
  const p = stateFileOf(cfg);
  return existsSync(p) ? parseState(readFileSync(p, 'utf-8')) : emptyState();
}

function saveState(cfg: RunnerConfig, st: RunnerState): void {
  const dir = cfg.stateDir || defaultStateDir();
  mkdirSync(dir, { recursive: true });
  const p = stateFileOf(cfg);
  writeFileSync(p, JSON.stringify(st, null, 2));
  try { chmodSync(p, 0o600); } catch { /* sans privilège : toléré, aucun secret dans ce fichier */ }
}

// ---------------------------------------------------------------- services réels

// Historique BTC (500 bougies) : inutile de le redemander à chaque cycle de 5 minutes — rafraîchi toutes les 90 minutes.
let btcDailyCache: { at: number; data: Candle[] | null } | null = null;
async function cachedBtcDaily(): Promise<Candle[] | null> {
  if (!btcDailyCache || Date.now() - btcDailyCache.at > 90 * 60_000) {
    const data = await fetchBtcDaily();
    if (data) btcDailyCache = { at: Date.now(), data };
  }
  return btcDailyCache?.data ?? null;
}

// MVRV et part des stablecoins : indicateurs lents par nature — rafraîchis au maximum toutes les 6 heures.
let slowMetricsCache: { at: number; mvrv: number | null; stableShare: number | null } | null = null;
async function cachedSlowMetrics(cfg: RunnerConfig): Promise<{ mvrv: number | null; stableShare: number | null }> {
  if (!slowMetricsCache || Date.now() - slowMetricsCache.at > 6 * 60 * 60_000) {
    const [mvrv, stableShare] = await Promise.all([fetchMvrv().catch(() => null), fetchStablecoinShare(cfg.coingeckoKey).catch(() => null)]);
    if (mvrv != null || stableShare != null || !slowMetricsCache) slowMetricsCache = { at: Date.now(), mvrv, stableShare };
  }
  return { mvrv: slowMetricsCache?.mvrv ?? null, stableShare: slowMetricsCache?.stableShare ?? null };
}

// Fear & Greed : lu à chaque cycle pour la température de marché — rafraîchi au maximum toutes les 30 minutes.
let fngCache: { at: number; data: { value: number; label: string } | null } | null = null;
async function cachedFng(): Promise<{ value: number; label: string } | null> {
  if (!fngCache || Date.now() - fngCache.at > 30 * 60_000) {
    const data = await fetchFearGreed();
    if (data) fngCache = { at: Date.now(), data };
  }
  return fngCache?.data ?? null;
}

// Veille presse : un flux Google News par crypto suivie, rafraîchi au maximum toutes les 45 minutes
// (12 cryptos au plus : la veille ne doit pas transformer le runner en robot d'actualités).
let newsCache: { at: number; coins: string; items: NewsItem[] } | null = null;
async function cachedNews(coins: WatchedCoin[]): Promise<NewsItem[]> {
  const sig = coins.map((c) => c.coinId).join(',');
  if (!newsCache || Date.now() - newsCache.at > 45 * 60_000 || newsCache.coins !== sig) {
    const results = await Promise.allSettled(coins.map((c) => fetchCoinNews(c, 18 * 3600_000)));
    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 24);
    if (items.length || !newsCache) newsCache = { at: Date.now(), coins: sig, items };
  }
  return newsCache?.items ?? [];
}

// Pépites émergentes : le digest du matin — jeunes paires Solana/Base en traction, chacune passée au scan
// de sécurité, avec les wallets suivis qui y sont entrés. Au plus 3 lignes, des pistes jamais des conseils.
async function emergingDigest(wallets: SmartWallet[]): Promise<string[]> {
  const settled = await Promise.allSettled([getNewPools('solana'), getNewPools('base')]);
  const pools: DexPool[] = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!pools.length) return [];
  const lines: string[] = [];
  for (const c of emergingCandidates(pools, 3)) {
    let security: string | undefined;
    try {
      const net = networkByKey(c.pool.network);
      const r = net?.goplusChainId ? await scanEvm(net.goplusChainId, c.pool.tokenAddress) : await scanSolana(c.pool.tokenAddress);
      security = `scan : ${r.verdict.toLowerCase()}`;
    } catch {
      security = undefined; // un scan indisponible ne masque jamais la piste : il sera relancé à la demande
    }
    const followed: string[] = [];
    for (const w of wallets.slice(0, 8)) {
      try {
        if ((await walletHoldings(w, [c.pool.tokenAddress])).size > 0) followed.push(w.label);
      } catch { /* un wallet illisible n'empêche pas les autres */ }
    }
    lines.push(emergingLine(c, { security, wallets: followed }));
  }
  return lines;
}

const depsOf = (cfg: RunnerConfig): CycleDeps => ({
  fetchRemote: () => fetchRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken),
  pushRemote: (text, sha) => pushRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken, text, sha),
  telegram: (text) => sendMessage(cfg.telegramToken, cfg.telegramChatId, text),
  prices: (ids) => fetchPrices(ids, cfg.coingeckoKey),
  fearGreed: () => cachedFng(),
  btcDaily: () => cachedBtcDaily(),
  funding: () => fetchBtcFunding(),
  mvrv: async () => (await cachedSlowMetrics(cfg)).mvrv,
  stableShare: async () => (await cachedSlowMetrics(cfg)).stableShare,
  news: (coins) => cfg.newsEnabled ? cachedNews(coins) : Promise.resolve([]),
  aiRates: (items) => cfg.mistralApiKey ? rateNews(cfg.mistralApiKey, cfg.mistralModel, items) : Promise.resolve(items.map(() => ({ importance: 0, resume: '' }))),
  smartEvents: (wallets, sinceMs, nowMs) => cfg.smartMoneyEnabled ? fetchAllWalletEvents(wallets, sinceMs, nowMs) : Promise.resolve([]),
  emerging: (wallets) => cfg.emergingEnabled ? emergingDigest(wallets) : Promise.resolve([]),
});

// ---------------------------------------------------------------- modes

async function modeCheck(cfg: RunnerConfig): Promise<void> {
  // Rien n'est envoyé, rien n'est écrit : ce mode déroule un cycle complet à blanc pour vérifier la chaîne.
  const { result } = await runCycle(cfg, loadState(cfg), { dry: true, forceBrief: true, onDry: (text) => log(`[à blanc] ${text.split('\n').join(' — ')}`) }, depsOf(cfg));
  log(`Diagnostic : ${result.error == null ? `prêt (alertes armées : ${result.watching})` : `un problème subsiste (${result.error})`}.`);
}

async function modeMain(cfg: RunnerConfig, mode: 'loop' | 'once' | 'brief' | 'discover'): Promise<void> {
  if (mode === 'discover') {
    const chats = await recentChats(cfg.telegramToken);
    if (!chats.length) {
      log('Aucune conversation privée vue par le bot. Ouvre Telegram, écris « /start » à ton bot, puis relance --discover.');
      return;
    }
    for (const c of chats) log(`Chat id : ${c.chatId}${c.title ? ` (${c.title})` : ''} — ajoute "telegramChatId": "${c.chatId}" dans la configuration.`);
    if (cfg.telegramChatId) {
      await sendMessage(cfg.telegramToken, cfg.telegramChatId, 'Boussole parle depuis ton serveur : la surveillance est bien raccordée.');
      log('Message de test envoyé.');
    }
    return;
  }

  const run = async (): Promise<void> => {
    const { state, result } = await runCycle(cfg, loadState(cfg), { dry: false, forceBrief: mode === 'brief' }, depsOf(cfg));
    saveState(cfg, state);
    if (result.sent) log(`${result.sent} message${result.sent > 1 ? 's' : ''} envoyé${result.sent > 1 ? 's' : ''}${result.consumed ? `, ${result.consumed} alerte${result.consumed > 1 ? 's' : ''} consommée${result.consumed > 1 ? 's' : ''} dans la synchronisation` : ''}.`);
    if (result.error) log(`Échec : ${result.error}`);
  };

  if (mode === 'once' || mode === 'brief') {
    await run();
    return;
  }
  log(`Surveillance démarrée : contrôle toutes les ${cfg.intervalMinutes} min ${cfg.timeZone}. Briefs : ${cfg.briefEnabled ? `matin ${cfg.briefHour} h` : 'matin désactivé'}${cfg.briefUsOpen ? ', ouverture US (9 h 30 New York)' : ''}${cfg.briefUsClose ? ', clôture US (16 h New York)' : ''}. Veille presse : ${cfg.newsEnabled ? `activée${cfg.mistralApiKey ? ' (résumés IA)' : ' (heuristique, sans clé IA)'}` : 'désactivée'}. Smart money : ${cfg.smartMoneyEnabled ? 'activé' : 'désactivé'}${cfg.emergingEnabled ? ', digest émergentes dans le brief du matin' : ''}. Source : ${cfg.syncRepo}/${cfg.syncPath} (chiffré de bout en bout).`);
  for (;;) {
    try {
      await run();
    } catch (e) {
      log(`Échec du cycle : ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(cfg.intervalMinutes * 60_000);
  }
}

// ---------------------------------------------------------------- point d'entrée

async function main(): Promise<void> {
  const { configPath, mode } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(configPath, mode === 'discover'); // --discover sert à trouver le chat id : il tourne sans.
  log(`Configuration : dépôt ${cfg.syncRepo}, devise ${cfg.currency}, appareil « ${cfg.device} », brief ${cfg.briefEnabled ? `${cfg.briefHour} h` : 'désactivé'} ${cfg.timeZone}.`);
  if (mode === 'check') await modeCheck(cfg);
  else await modeMain(cfg, mode);
}

process.on('SIGINT', () => { log('Arrêt demandé (SIGINT).'); process.exit(0); });
process.on('SIGTERM', () => { log('Arrêt demandé (SIGTERM).'); process.exit(0); });

main().catch((e) => {
  log(`Erreur fatale : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
