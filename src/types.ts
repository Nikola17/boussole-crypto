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
  disclaimerAccepted: boolean;
  taxRatePct: number;
  scanSize: 50 | 100;
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
}

export interface CoinRef {
  coinId: string; // id CoinGecko
  symbol: string;
  name: string;
  image?: string;
}

export type TxType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'reward' | 'transfer';

export interface Transaction extends CoinRef {
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
  id: string;
  name: string;
  kind: AccountKind;
  /** Wallets suivis (adresses publiques) dont la blockchain fait foi pour ce compte. */
  walletIds: string[];
  createdAt: string;
}

export interface DcaPlan extends CoinRef {
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
  id: string;
  createdAt: string;
  buyPrice?: number;
  sentences: string[]; // 5 phrases (test du miroir)
  hypotheses: ThesisHypothesis[];
  redLines: string[];
  sellPlan: { multiple: number; pct: number }[];
  lastCheck?: { date: string; verdict: string; reportId?: string };
}

export type AiReportKind = 'briefing' | 'committee' | 'quick' | 'pulse' | 'airdrops' | 'journal' | 'thesis' | 'gem';

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
  id: string; // chainId:address
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  image?: string;
  addedAt: string;
  priceAtAdd?: number;
}

// ---------------------------------------------------------------- Panier DCA (plusieurs cryptos par échéance, en USDC)

export interface BasketCoin extends CoinRef {
  /** Poids visé dans le cœur du panier (en %, relatif aux autres lignes du cœur). */
  weight: number;
}

export interface BasketPlan {
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
