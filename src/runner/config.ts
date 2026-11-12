// Runner VPS : configuration. Le fichier (`~/.config/boussole/runner.json`, chmod 600) reste sur le serveur ;
// les variables d'environnement peuvent fournir n'importe quel secret (elles ne sont jamais journalisées).
// Ce module est pur : il valide un objet déjà lu, sans toucher au disque ni au réseau.

export interface RunnerConfig {
  /** Dépôt GitHub privé du transport chiffré (ex : Nikola17/boussole-sync). */
  syncRepo: string;
  /** Fichier transporté dans ce dépôt — identique à celui de l'application (src/hooks/useSync.ts). */
  syncPath: string;
  /** Jeton fine-grained « Contents : Read and write » limité à ce seul dépôt. */
  syncToken: string;
  /** Phrase de passe de la synchronisation chiffrée (jamais écrite sur GitHub). */
  passphrase: string;
  /** Bot Telegram (BotFather). */
  telegramToken: string;
  /** Conversation privée avec le bot (récupérable par `--discover`). */
  telegramChatId: string;
  /** Clé « Demo » gratuite CoinGecko (facultative) : relève la limite de requêtes. */
  coingeckoKey: string | null;
  /** Devise d'affichage du brief. L'application ne synchronise pas son réglage : il est répété ici. */
  currency: 'EUR' | 'USD';
  /** Intervalle entre deux contrôles, en minutes. */
  intervalMinutes: number;
  /** Heure locale d'envoi du brief quotidien (0-23). */
  briefHour: number;
  briefEnabled: boolean;
  /** Fuseau dans lequel lire l'heure du brief et les jours d'échéance (le serveur est souvent en UTC). */
  timeZone: string;
  /** Répertoire de l'état local du runner (aucun secret dedans). */
  stateDir: string;
  /** Nom du serveur, écrit dans le fichier de sync avec les consommations d'alertes. */
  device: string;
}

const PATH_DEFAULT = 'boussole-sync.enc';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Valide un objet de configuration brut ; renvoie les champs manquants ou invalides, en français, pour un message clair. */
export function validateConfig(raw: unknown): { config: RunnerConfig | null; problems: string[] } {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) return { config: null, problems: ['Configuration illisible : attends un objet JSON.'] };
  const r = raw as Record<string, unknown>;

  const syncRepo = str(r.syncRepo);
  if (!syncRepo) problems.push('syncRepo manquant (ex : "Nikola17/boussole-sync").');
  else if (!/^[\w.-]+\/[\w.-]+$/.test(syncRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, ''))) problems.push('syncRepo mal formé : attends « utilisateur/dépôt ».');

  const timeZone = str(r.timeZone) || 'Europe/Paris';
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone });
  } catch {
    problems.push(`timeZone inconnu : « ${timeZone} ».`);
  }

  const currency = str(r.currency).toUpperCase() === 'USD' ? 'USD' : 'EUR';
  // Heure du brief et cadence : absentes → valeurs par défaut ; présentes mais impossibles → refus explicite.
  const briefHourRaw = r.briefHour;
  let briefHour = 8;
  if (briefHourRaw !== undefined) {
    briefHour = typeof briefHourRaw === 'number' && Number.isInteger(briefHourRaw) && briefHourRaw >= 0 && briefHourRaw <= 23 ? briefHourRaw : -1;
    if (briefHour < 0) problems.push('briefHour doit être un entier entre 0 et 23.');
  }

  const intervalRaw = r.intervalMinutes;
  let intervalMinutes = 5;
  if (intervalRaw !== undefined) {
    intervalMinutes = typeof intervalRaw === 'number' && Number.isFinite(intervalRaw) && intervalRaw >= 1 && intervalRaw <= 120 ? Math.round(intervalRaw) : 0;
    if (!intervalMinutes) problems.push('intervalMinutes doit être un nombre entre 1 et 120.');
  }

  if (typeof r.briefEnabled !== 'undefined' && typeof r.briefEnabled !== 'boolean') problems.push('briefEnabled doit être true ou false.');

  // Les secrets obligatoires peuvent venir de l'environnement : ils sont nommés ici pour le message d'erreur.
  const syncToken = str(r.syncToken);
  const passphrase = str(r.passphrase);
  const telegramToken = str(r.telegramToken);
  const telegramChatId = str(r.telegramChatId);
  if (!syncToken) problems.push('syncToken manquant (ou variable d’environnement BOUSSOLE_SYNC_TOKEN).');
  if (!passphrase) problems.push('passphrase manquante (ou BOUSSOLE_PASSPHRASE) — la même que dans l’application, Réglages → Synchronisation.');
  if (!telegramToken) problems.push('telegramToken manquant (ou TELEGRAM_BOT_TOKEN) — créé avec @BotFather.');
  if (!telegramChatId) problems.push('telegramChatId manquant (ou TELEGRAM_CHAT_ID) — obtenu par la commande --discover.');

  if (problems.length) return { config: null, problems };

  return {
    config: {
      syncRepo,
      syncPath: str(r.syncPath) || PATH_DEFAULT,
      syncToken,
      passphrase,
      telegramToken,
      telegramChatId,
      coingeckoKey: str(r.coingeckoKey) || null,
      currency,
      intervalMinutes: intervalMinutes as number,
      briefHour: briefHour as number,
      briefEnabled: typeof r.briefEnabled === 'boolean' ? r.briefEnabled : true,
      timeZone,
      stateDir: str(r.stateDir),
      device: str(r.device) || 'vps-boussole',
    },
    problems: [],
  };
}

/** Applique les variables d'environnement par-dessus la configuration lue (les secrets ne vivent qu'à un endroit). */
export function applyEnv(raw: Record<string, unknown>, env: Record<string, string | undefined> = process.env): Record<string, unknown> {
  const out = { ...raw };
  const set = (key: string, envName: string) => {
    const v = env[envName];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  };
  set('syncToken', 'BOUSSOLE_SYNC_TOKEN');
  set('passphrase', 'BOUSSOLE_PASSPHRASE');
  set('telegramToken', 'TELEGRAM_BOT_TOKEN');
  set('telegramChatId', 'TELEGRAM_CHAT_ID');
  set('coingeckoKey', 'COINGECKO_KEY');
  set('stateDir', 'BOUSSOLE_STATE_DIR');
  return out;
}
