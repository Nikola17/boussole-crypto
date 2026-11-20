// Types partagés (données persistées localement sur l'appareil)

import type { Currency } from './lib/format';
import type { DcaStrategy, Frequency } from './lib/dca';
import type { BtcScriptChoice } from './lib/xpub';

export type ThemeMode = 'system' | 'dark' | 'light';
export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
/** `compat` = API compatible OpenAI (Nous Portal par défaut) ; `anthropic` = Claude en direct ; `mistral` = Mistral AI (La Plateforme). */
export type AiProvider = 'compat' | 'anthropic' | 'mistral';

export interface Settings {
  currency: Currency;
  theme: ThemeMode;
  /** Langue de l'interface : 'auto' = langue de l'appareil (FR si navigateur FR, EN sinon). */
  locale: 'auto' | 'fr' | 'en';
  aiProvider: AiProvider;
  anthropicKey: string;
  aiModel: AiModel;
  aiWebSearch: boolean;
  /** Anonymiser le dossier envoyé à l'IA : pas de prénom, des pourcentages à la place des montants. */
  aiAnonymous: boolean;
  compatKey: string;
  compatBaseUrl: string;
  compatModel: string;
  /** Clé API Mistral (console.mistral.ai) : chiffrée par le système, jamais synchronisée ni exportée. */
  mistralKey: string;
  /** Modèle Mistral choisi (catalogue lu en direct avec la clé). */
  mistralModel: string;
  briefingAuto: boolean;
  coingeckoKey: string;
  notifications: boolean;
  /** Webhook HTTPS optionnel : reçoit un POST JSON à chaque alerte déclenchée par l'app. */
  webhookUrl: string;
  /** Windows : fermer la fenêtre garde Boussole actif dans la zone de notification (alertes). */
  closeToTray: boolean;
  /** Windows : démarrer avec la session. */
  autoStart: boolean;
  /** Android : demander l'empreinte/le code de l'appareil à l'ouverture (réglage de CET appareil, jamais synchronisé). */
  appLock: boolean;
  disclaimerAccepted: boolean;
  taxRatePct: number;
  scanSize: 50 | 100 | 250 | 500;
  /** Clé API Binance en LECTURE SEULE (solde spot) : chiffrée par le système, jamais synchronisée ni exportée. */
  binanceApiKey: string;
  /** Secret de la clé API Binance (signe les requêtes) : idem. */
  binanceApiSecret: string;
  /** Niveau VIP Binance (0-9) : calibre les frais taker du paper trading « plateforme ». */
  binanceVip: number;
  /** Paiement des frais en BNB (−25 %) : idem. */
  bnbFeeDiscount: boolean;
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
  /** Seuils du verdict de confiance des autopilotes (Labo → Règles de confiance) ; absents : valeurs par défaut. */
  trustRules?: Partial<{ minDays: number; minTrades: number; minDeposits: number; maxDrawdownPct: number; maxExtraDrawdownPts: number; bootstrapDraws: number; minWindowWinPct: number; withdrawGapPts: number; copyPct: number; copyPctTrusted: number }>;
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
/** Un déblocage de tokens suivi manuellement (J-7 / J-1) : aucun agrégateur gratuit fiable, saisi à la main. */
/** Événement de lancement Binance (Launchpool / Launchpad / Megadrop) saisi manuellement : alertes J-7/J-1/J-0. */
export interface LaunchEvent {
  updatedAt?: UpdatedAt;
  id: string;
  /** Nom de l'événement (ex : « Launchpool — TOKEN »). */
  name: string;
  /** AAAA-MM-JJ : date de début. */
  date: string;
  /** AAAA-MM-JJ : date de fin (optionnel). */
  endDate?: string;
  note?: string;
}

/** Trader de copy trading suivi en watchlist (statistiques publiques uniquement, jamais de copie automatique). */
export interface CopyTrader {
  updatedAt?: UpdatedAt;
  id: string;
  name: string;
  /** Identifiant public du portefeuille sur Binance (si connu) : permet de lire ses stats publiques. */
  portfolioId?: string;
  note?: string;
}

export interface TokenUnlock {
  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
  updatedAt?: UpdatedAt;
  id: string;
  symbol: string;
  coinId?: string;
  /** AAAA-MM-JJ : date du déblocage. */
  date: string;
  /** Quantité débloquée (optionnel). */
  amount?: number;
  /** Part de l'offre totale (%) si connue. */
  pctSupply?: number;
  note?: string;
}

export interface HotNote {  // Synchronisation : date de la dernière modification de cet élément (ISO 8601).
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
  /** 'buy' (défaut) : anti-FOMO sur un achat qui a trop monté. 'sell' : circuit breaker anti-panique en krach. */
  side?: 'buy' | 'sell';
  /** La variation 7 jours constatée au moment de l'attente (en %) — pour ne rien inventer plus tard. */
  change7dPct?: number;
  /** Fear & Greed constaté pour une attente de vente (circuit breaker). */
  fngAt?: number;
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
  /** Copie en réel d'un ordre d'autopilote (portefeuille papier, jour de l'ordre, crypto). */
  copyOf?: { portfolioId: string; day: string; coinId: string };
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
  /** Plateforme connectée en lecture seule (ses soldes font foi pour ce compte, comme un wallet). */
  exchangePlatform?: 'binance';
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
  /** Copie en réel d'un ordre d'autopilote (portefeuille papier, jour de l'ordre, crypto). */
  copyOf?: { portfolioId: string; day: string; coinId: string };
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
  /** Portefeuille papier de l'ordre (absent pour un achat fantôme). */
  portfolioId?: string;
  orderType?: 'market' | 'limit' | 'stop' | 'target';
  /** Ordre en attente qui a produit cette exécution. */
  orderId?: string;
  /** Prix du marché à l'exécution (le prix payé inclut l'écart). */
  marketUsd?: number;
  reason?: string;
}

/** Frais et écart par côté (en %), avec le préréglage d'où ils viennent. */
export interface PaperCosts { feePct: number; spreadPct: number; preset: 'exchange' | 'app' | 'measured' | 'custom' }

/** Un portefeuille papier : manuel (tes ordres) ou en autopilote (une stratégie de Boussole). */
export interface PaperPortfolio {
  updatedAt?: UpdatedAt;
  id: string;
  name: string;
  kind: 'manual' | 'auto';
  startingUsd: number;
  createdAt: string;
  costs: PaperCosts;
  archived?: boolean;
  paused?: boolean;
  // Autopilote seulement
  strategyId?: string;
  /** Empreinte des règles, figée à la création : si elle change, le portefeuille est archivé et un neuf démarre. */
  rules?: string;
  params?: Record<string, number | string | boolean | number[] | string[]>;
  /** Premier jour d'exécution en direct (AAAA-MM-JJ). */
  liveSince?: string;
  /** Début de la partie simulée, si demandée. */
  backfillFrom?: string;
  executionHour?: number;
  /** Créneaux horaires locaux multiples (ex. [8, 12, 16, 20] pour une stratégie 4H). */
  executionHours?: number[];
  timeZone?: string;
  /** Dernier jour d'exécution traité. */
  cursorDay?: string;
  /** Dernier créneau horaire traité (ex. « 2026-11-20@16 ») pour les stratégies multi-créneaux. */
  cursorSlot?: string;
  /** Jusqu'où les ordres en attente ont été contrôlés (ISO). */
  settledTo?: string;
  universe?: { coinId: string; symbol: string; name: string; rank: number | null; available?: boolean | null }[];
  universeWeek?: string;
}

/** Ordre en attente d'un portefeuille papier manuel. */
export interface PaperOrder {
  updatedAt?: UpdatedAt;
  id: string;
  portfolioId: string;
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop' | 'target';
  price: number;
  usd?: number;
  /** Vente sans quantité : toute la position. */
  quantity?: number;
  ocoGroup?: string;
  /** Achat limite : stop et objectif posés à son exécution. */
  attachStop?: number;
  attachTarget?: number;
  createdAt: string;
  expiresAt: string;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  filledAt?: string;
}

/** Une exécution d'autopilote, telle qu'enregistrée dans son journal du jour. */
export interface PaperFill {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  kind: 'market' | 'stop' | 'target' | 'limit' | 'delist';
  quantity: number;
  marketUsd: number;
  priceUsd: number;
  feeUsd: number;
  at: string;
  reason: string;
  tag?: string;
  stop?: number;
  target?: number;
  /** Stop jugé à la clôture par la stratégie (pas d'ordre stop en séance). */
  stopOnClose?: boolean;
  /** Paliers de prise de profit partielle attachés à cet achat. */
  tpLegs?: { rMultiple: number; fraction: number; moveStopToBe?: boolean; done?: boolean }[];
  /** Stop suiveur dynamique attaché à cet achat. */
  trailing?: { mode: 'atr' | 'pct'; value: number; activateAfterR?: number; atr?: number };
  entryPriceUsd?: number;
  initialRiskPerUnit?: number;
}

/** Relevé quotidien de la valeur du vrai portefeuille (identifiant = jour). */
export interface PortfolioSnapshot { updatedAt?: UpdatedAt; id: string; day: string; valueUsd: number; byBucket: Record<string, number>; complete: boolean }

/** Mouvement d'un wallet suivi, noté ensuite sur ce que le prix a fait (identifiant = clé du mouvement). */
export interface SmartMove {
  updatedAt?: UpdatedAt; id: string; walletId: string; chain?: string; coinId?: string; mint?: string; symbol: string | null; side: 'buy' | 'sell'; priceUsd: number; at: string;
  /** Prix relevés 7 et 30 jours après (0 : introuvable, non jugé). */
  p7?: number; p30?: number;
}

/** Relevé hebdomadaire des pépites proposées (identifiant = semaine ISO), suivi en avant à 30 et 90 jours. */
export interface PickSnapshot {
  updatedAt?: UpdatedAt; id: string; week: string;
  /** Jour du relevé et prix de Bitcoin ce jour-là ; puis Bitcoin 30 et 90 jours après (0 : fenêtre manquée). */
  day: string; btcUsd: number; btc30?: number; btc90?: number;
  picks: { coinId: string; symbol: string; source: 'gems' | 'basket'; score: number | null; priceUsd: number; p30?: number; p90?: number }[];
}

/** Journal d'un jour d'exécution d'un autopilote : l'état du portefeuille se rejoue à partir de ces journaux. */
export interface PaperDayLog {
  /** `${portfolioId}:${day}` */
  id: string;
  updatedAt?: UpdatedAt;
  portfolioId: string;
  day: string;
  decidedOn: string;
  rules: string;
  depositUsd: number;
  fills: PaperFill[];
  skipped: { symbol: string; why: string }[];
  /** Stratégie non rejouable exécutée en retard (jours). */
  lateDays?: number;
  by: string;
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
  /** Mode auto : règle de la base (absente : « top3 », la règle d'avant la mesure du banc d'essai). */
  baseMode?: 'top3' | 'cap' | 'anchor' | 'equal' | 'btc';
  /** Règle « anchor » : part de la base en Bitcoin et Ethereum (75/25), 70 % par défaut. */
  anchorPct?: number;
  /** Mode auto : l'IA relit et affine l'ordre du jour dès qu'une échéance arrive (sans jamais changer les montants). */
  aiOptimize?: boolean;
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
