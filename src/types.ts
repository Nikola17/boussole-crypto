// Types partagés (données persistées localement sur l'appareil)

import type { Currency } from './lib/format';
import type { DcaStrategy, Frequency } from './lib/dca';
import type { BtcScriptChoice } from './lib/xpub';

export type ThemeMode = 'system' | 'dark' | 'light';
export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
/** `compat` = API compatible OpenAI (Nous Portal par défaut) ; `anthropic` = Claude en direct. */
export type AiProvider = 'compat' | 'anthropic';

export interface Settings {
  currency: Currency;
  theme: ThemeMode;
  aiProvider: AiProvider;
  anthropicKey: string;
  aiModel: AiModel;
  aiWebSearch: boolean;
  /** Anonymiser le dossier envoyé à l'IA : pas de prénom, des pourcentages à la place des montants. */
  aiAnonymous: boolean;
  compatKey: string;
  compatBaseUrl: string;
  compatModel: string;
  briefingAuto: boolean;
  coingeckoKey: string;
  notifications: boolean;
  /** Windows : fermer la fenêtre garde Boussole actif dans la zone de notification (alertes). */
  closeToTray: boolean;
  /** Windows : démarrer avec la session. */
  autoStart: boolean;
  /** Android : demander l'empreinte/le code de l'appareil à l'ouverture (réglage de CET appareil, jamais synchronisé). */
  appLock: boolean;
  disclaimerAccepted: boolean;
  taxRatePct: number;
  scanSize: 50 | 100;
  // Synchronisation PC ↔ téléphone : réglages propres à CET appareil, jamais synchronisés ni exportés.
  syncEnabled: boolean;
  /** Dépôt GitHub privé du transport (ex : Nikola17/boussole-sync). */
  syncRepo: string;
  /** Jeton d'accès fine-grained limité à ce seul dépôt (Contents : lecture + écriture). */
  syncToken: string;
  /** Phrase de passe de laquelle découle la clé de chiffrement (AES-GCM, données illisibles pour GitHub). */
  syncPassphrase: string;
  /** Dernière synchronisation réussie (horodatage en secondes), pour l'affichage « il y a N min ». */
  syncLastAt: number;
  /** Identifiant de cet appareil, utile aux journalisations ; généré au premier usage. */
  deviceId: string;
}

/** Horodatage de la dernière modification d'un élément synchronisé (ISO 8601). Absent = inconnu (la plus ancienne). */
export type UpdatedAt = string;

/** Une suppression à propager : `collection/identifiant` et moment (ISO 8601). */
export interface SyncDeletion {
  key: string;
  at: string;
}

export type Bucket = 'btc' | 'eth' | 'large' | 'mid' | 'small' | 'stable';

export type Archetype = 'Prudent' | 'Équilibré' | 'Dynamique' | 'Audacieux' | 'Ma stratégie';

export interface ProfileRules {
  maxPerGemPct: number;
  maxPerAltPct: number;
  cashReservePct: number;
  riskPerTradePct: number;
  /** Nombre maximal de lignes (cryptos distinctes hors stablecoins) dans le portefeuille. */
  maxLines: number;
  /** Poids minimal d'une ligne (en % du portefeuille) pour qu'elle vaille la peine d'être gardée. */
  minLinePct: number;
  /** Nombre maximal de lignes « découverte » (petits paris) ouvertes en même temps. */
  maxDiscoveryLines: number;
}

export interface Profile {
  completed: boolean;
  name: string;
  horizon: 1 | 2 | 3; // court, moyen, long
  riskTolerance: 1 | 2 | 3 | 4 | 5;
  experience: 1 | 2 | 3;
  maxLoss: 1 | 2 | 3 | 4; // perte supportable : 10 %, 25 %, 50 %, 80 %+
  goal: 1 | 2 | 3; // préserver, croissance, multiplier
  capital: number;
  monthlyBudget: number;
  interests: { dca: boolean; trading: boolean; gems: boolean; airdrops: boolean };
  archetype: Archetype;
  target: Record<Bucket, number>;
  rules: ProfileRules;
  /** Mode vacances : veille critique uniquement (alertes de prix et paliers) jusqu'à cette date (AAAA-MM-JJ). */
  vacationUntil?: string;
}

/** Journal à chaud : ce que j'ai fait et pourquoi, pris juste après une alerte — la mémoire du vécu, pas la théorie. */
export interface HotNote {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  /** L'alerte qui a déclenché la note, si la note en part d'une. */
  alertId?: string;
  coinId?: string;
  symbol?: string;
  /** AAAA-MM-JJ : le jour du mouvement décrit. */
  date: string;
  /** Ce que j'ai fait face à l'alerte. */
  action: 'nothing' | 'buy' | 'sell' | 'partial' | 'wait';
  /** Pourquoi — libre, une phrase ou une page. */
  note: string;
  createdAt: string;
}

/** Attente anti-FOMO : un achat prévu sur une crypto qui a trop monté en 7 jours doit attendre 24 h. */
export interface ImpulseWait {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  /** La variation 7 jours constatée au moment de l'attente (en %) — pour ne rien inventer plus tard. */
  change7dPct?: number;
  createdAt: string;
  /** ISO 8601 : avant cette date, l'achat reste bloqué. */
  unlockAt: string;
}

/** Une modification datée du profil (ou de ses règles) : l'historique de ce qui a changé, et quand. */
export interface ProfileChange {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  at: string;
  /** Ce qui a changé (« règles.maxLines : 8 → 12 », « archetype : Prudent → Équilibré »). */
  summary: string;
}

export interface CoinRef {
  coinId: string; // id CoinGecko
  symbol: string;
  name: string;
  image?: string;
}

export type TxType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'reward' | 'transfer';

export interface Transaction extends CoinRef {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  date: string; // AAAA-MM-JJ
  type: TxType;
  quantity: number;
  price: number; // prix unitaire dans `currency`
  currency: Currency;
  fee: number; // frais dans `currency`
  fxEurPerUsd: number; // taux EUR pour 1 USD au moment de la saisie
  /** Achat payé en monnaie fiat (sinon échange crypto→crypto, neutre fiscalement) */
  fromFiat?: boolean;
  /** Vente convertie en monnaie fiat (événement imposable en France) */
  toFiat?: boolean;
  /** Valeur globale du portefeuille (€) au moment de la vente — nécessaire au calcul 150 VH bis */
  portfolioValueEur?: number;
  source?: 'manual' | 'dca' | 'trade' | 'import';
  note?: string;
  /** Compte concerné (pour un transfert : compte d'origine). */
  accountId?: string;
  /** Transfert : compte de destination. */
  toAccountId?: string;
  /** Horodatage précis (UTC, ISO 8601) quand la plateforme le fournit. */
  time?: string;
}

export type WalletChain = 'bitcoin' | 'evm' | 'solana';

export interface CustomToken {
  chain: string; // clé de chaîne EVM
  address: string;
  symbol: string;
  decimals: number;
  coingeckoId?: string;
}

export interface WalletAddress {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  label: string;
  chain: WalletChain;
  address: string;
  evmChains?: string[];
  customTokens?: CustomToken[];
  /** Bitcoin : format d'adresses d'une clé publique étendue (xpub/ypub/zpub). */
  btcScript?: BtcScriptChoice;
  includeInTotal: boolean;
  createdAt: string;
}

export type AccountKind = 'exchange' | 'hardware' | 'hot';

/** Un endroit où sont rangées tes cryptos (plateforme, Ledger, Phantom…). */
export interface Account {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  name: string;
  kind: AccountKind;
  /** Wallets suivis (adresses publiques) dont la blockchain fait foi pour ce compte. */
  walletIds: string[];
  createdAt: string;
}

export interface DcaPlan extends CoinRef {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  amount: number;
  frequency: Frequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  strategy: DcaStrategy;
  startDate: string;
  active: boolean;
  reminder: boolean;
  exchange?: string;
  createdAt: string;
}

export interface DcaExecution {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  planId: string;
  periodKey: string;
  date: string;
  amount: number;
  price: number;
  quantity: number;
  multiplier: number;
  skipped?: boolean;
  /** Transactions créées par cette échéance : les supprimer avec elle évite des achats « orphelins » comptés dans les plus-values. */
  txIds?: string[];
}

export interface TradeEntry {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  coinId: string;
  symbol: string;
  side: 'long' | 'short';
  status: 'open' | 'closed';
  entryDate: string;
  entryPrice: number;
  quantity: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage: number;
  exitDate?: string;
  exitPrice?: number;
  fees: number;
  setup?: string;
  emotion?: string;
  notes?: string;
}

export interface PriceAlert {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  condition: 'above' | 'below';
  priceUsd: number;
  createdAt: string;
  triggeredAt?: string;
  active: boolean;
}

export interface AirdropTask {
  id: string;
  label: string;
  done: boolean;
  recurring?: 'daily' | 'weekly';
  lastDone?: string;
}

export type AirdropStatus = 'idee' | 'farming' | 'eligible' | 'claimable' | 'claimed' | 'abandoned';

export interface AirdropItem {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  name: string;
  ecosystem: string;
  status: AirdropStatus;
  tasks: AirdropTask[];
  wallet: string;
  costSpent: number;
  estimatedValue?: number;
  deadline?: string;
  url?: string;
  notes?: string;
  potential: 1 | 2 | 3 | 4 | 5;
  createdAt: string;
}

export interface ThesisHypothesis {
  id: string;
  label: string;
  status: 'ok' | 'weak' | 'broken' | 'dead';
}

export interface Thesis extends CoinRef {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  createdAt: string;
  buyPrice?: number;
  sentences: string[]; // phrases de la thèse, une par ligne (longueur libre)
  hypotheses: ThesisHypothesis[];
  redLines: string[];
  sellPlan: { multiple: number; pct: number }[];
  lastCheck?: { date: string; verdict: string; reportId?: string };
}

export type AiReportKind = 'briefing' | 'committee' | 'quick' | 'pulse' | 'airdrops' | 'journal' | 'thesis' | 'gem';

// ------------------------------------------------------------------ Portefeuille papier (expérimentations)

/** Ordre fictif au prix réel du marché : tester une stratégie sans risquer un euro. */
export interface PaperTrade extends CoinRef {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  /** Dates ISO : le jour (tris/affichage) et l'instant précis si connu. */
  date: string;
  time?: string;
  type: 'buy' | 'sell';
  quantity: number;
  /** Prix réel unitaire au moment de l'ordre ( USD — le papier est libellé en USDC). */
  priceUsd: number;
  /** Frais simulés (USDC) : les vraies plateformes en prennent, le papier aussi. */
  feeUsd?: number;
  note?: string;
  /** Thèse fantôme : « j'aurais acheté ici » — comptée à part, jamais dans le cash ni laPosition papier. */
  ghost?: true;
}

/** Réglages du portefeuille papier : solde de départ et date du dernier reset. */
export interface PaperConfig {
  enabled: boolean;
  startingUsd: number;
  resetAt?: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  searches: number;
  costUsd: number;
  /** Faux quand le fournisseur ne renvoie pas le coût (on n'affiche alors aucun montant). */
  costKnown?: boolean;
}

export interface AiSource {
  url: string;
  title: string;
}

export interface AiReport {
  id: string;
  kind: AiReportKind;
  title: string;
  coinId?: string;
  createdAt: string;
  day: string;
  model: string;
  markdown: string;
  data?: Record<string, unknown> | null;
  usage?: AiUsage;
  sources?: AiSource[];
  parts?: { title: string; markdown: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  usage?: AiUsage;
}

export interface WatchedToken {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string; // chainId:address
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  image?: string;
  addedAt: string;
  priceAtAdd?: number;
}

// ---------------------------------------------------------------- Smart money : wallets publics suivis

export interface SmartWallet {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  /** Nom libre (« Fonds X », « KOL Y ») : c'est ce qui s'affiche dans les alertes. */
  label: string;
  /** Chaîne lue : Solana (RPC public) ou Ethereum/Base (Blockscout). Aucune clé API nécessaire. */
  chain: 'solana' | 'base' | 'eth';
  /** Adresse publique du wallet — jamais un secret, c'est une donnée de blockchain. */
  address: string;
  /** Pourquoi tu le suis : fonds, initié, KOL, autre. */
  kind: 'fund' | 'insider' | 'kol' | 'other';
  addedAt: string;
}

// ---------------------------------------------------------------- Panier DCA (plusieurs cryptos par échéance, en USDC)

export interface BasketCoin extends CoinRef {
  /** Poids visé dans le cœur du panier (en %, relatif aux autres lignes du cœur). */
  weight: number;
}

export interface BasketPlan {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  name: string;
  active: boolean;
  /** Budget de chaque échéance, en USDC. */
  amountUsd: number;
  /** Jours d'achat : 1 = lundi … 7 = dimanche. */
  daysOfWeek: number[];
  startDate: string;
  /** Part maximale du budget qui peut aller à la ligne « découverte » (en %). */
  discoveryMaxPct: number;
  /** « manual » : tu choisis ta liste (à la barre de recherche) ; « auto » : Boussole choisit pour toi. */
  discoveryMode?: 'manual' | 'auto';
  /**
   * « auto » : tu ne règles que le montant, les jours et la part base/découverte ; Boussole choisit jusqu'à 3 cryptos
   * du top 20 (hors stablecoins) et jusqu'à 3 découvertes. Absent ou « custom » : panier personnalisé (cœur + liste).
   */
  mode?: 'auto' | 'custom';
  /** Mode auto : part du budget pour la base (0 à 100), le reste va à la découverte. */
  basePct?: number;
  /** Mode auto : nombre maximal de cryptos de base par échéance (1 à 3). */
  maxBaseLines?: number;
  /** Mode auto : nombre maximal de découvertes par échéance (0 à 3). */
  maxDiscoveryLines?: number;
  /** Mode auto : où chercher les découvertes — pépites (petites capis), milieu de classement (rangs 21-250), ou les deux. */
  discoverySource?: 'gems' | 'mid' | 'both';
  core: BasketCoin[];
  /** Liste « découverte » : 5 cryptos au plus, une seule achetée par échéance. */
  discovery: CoinRef[];
  /** USDC mis de côté : alimenté quand le marché est chaud, puisé quand il a peur. */
  reserveUsd: number;
  /** Aucun ordre en dessous de ce montant (USDC). */
  minOrderUsd: number;
  accountId?: string;
  reminder: boolean;
  createdAt: string;
}

export interface BasketOrderLog extends CoinRef {
  usd: number;
  quantity: number;
  price: number;
  kind: 'core' | 'discovery';
}

export interface BasketExecution {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  basketId: string;
  /** AAAA-MM-JJ de l'échéance concernée. */
  periodKey: string;
  date: string;
  orders: BasketOrderLog[];
  investedUsd: number;
  /** Variation de la réserve : + quand une partie du budget n'est pas investie, − quand la réserve est puisée. */
  reserveDeltaUsd: number;
  skipped?: boolean;
  /** Transactions créées par cette échéance (achats et sorties d'USDC). */
  txIds?: string[];
}

// ---------------------------------------------------------------- Enveloppe DeFi (petits paris sur Solana, compte Phantom séparé)

export interface DefiEnvelope {
  enabled: boolean;
  /** Part maximale du portefeuille engagée dans l'enveloppe (en %). */
  capPct: number;
  /** Montant maximal d'un achat (USD). */
  maxPerBuyUsd: number;
  /** À ce multiple de la mise, on retire la mise de départ. */
  takeProfitMultiple: number;
  /** Perte de l'enveloppe (en %) qui déclenche une pause. */
  pauseDrawdownPct: number;
  /** Pas d'achat avant cette date (AAAA-MM-JJ) : pause d'un mois après une perte de 50 %. */
  pausedUntil?: string;
  /** Les paris antérieurs à cette date ne comptent plus dans le calcul de perte (remise à zéro après la pause). */
  windowStart?: string;
}

export interface DefiBet {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  date: string;
  symbol: string;
  name: string;
  mint?: string;
  /** Mise de départ (USD). */
  costUsd: number;
  /** Valeur actuelle de ce qu'il reste (USD) ; la mise si elle n'est pas renseignée. */
  valueUsd?: number;
  /** Argent déjà ressorti (mise retirée, vente partielle ou totale). */
  realizedUsd?: number;
  status: 'open' | 'closed';
  /** La mise de départ a déjà été retirée. */
  recovered?: boolean;
  note?: string;
  /** Noté alors qu'une règle de l'enveloppe n'était pas respectée (plafond, pause, mise maximale). */
  outsideRules?: string[];
}
