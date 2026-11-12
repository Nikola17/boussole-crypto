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
import { fetchFearGreed, fetchPrices } from './market';
import { recentChats, sendMessage } from './telegram';

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

const depsOf = (cfg: RunnerConfig): CycleDeps => ({
  fetchRemote: () => fetchRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken),
  pushRemote: (text, sha) => pushRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken, text, sha),
  telegram: (text) => sendMessage(cfg.telegramToken, cfg.telegramChatId, text),
  prices: (ids) => fetchPrices(ids, cfg.coingeckoKey),
  fearGreed: () => fetchFearGreed(),
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
  log(`Surveillance démarrée : contrôle toutes les ${cfg.intervalMinutes} min, brief ${cfg.briefEnabled ? `à ${cfg.briefHour} h` : 'désactivé'} ${cfg.timeZone}. Source : ${cfg.syncRepo}/${cfg.syncPath} (chiffré de bout en bout).`);
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
