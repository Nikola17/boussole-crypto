// Types du Labo : contrat d'une stratégie, ordres, exécutions et portefeuille simulé.
// Le même contrat sert au banc d'essai (historique) et à l'autopilote (direct) : une stratégie lit des bougies
// journalières closes et rend des ordres ; elle ne lit ni l'horloge ni le réseau.

import type { Candle } from '../indicators';
import type { CgMarket } from '../../api/coingecko';
import type { ProfileRules } from '../../types';
import type { AssetMetrics } from './features';
import type { RegimeSnapshot } from './regime';

/** Frais et écart de prix, par côté, en %. */
export interface CostModel { feePct: number; spreadPct: number; /** Frais maker optionnel pour les ordres limites (défaut : feePct). */ makerFeePct?: number }

/** Préréglages : plateforme d'échange (ordre au marché) et application grand public (achat instantané). */
export const COSTS = {
  exchange: { feePct: 0.1, spreadPct: 0.05 },
  app: { feePct: 0, spreadPct: 1.5 },
} as const satisfies Record<string, CostModel>;

/** Palier de prise de profit partielle attaché à une position. */
export interface TakeProfitLeg {
  /** Multiple de R (risque initial) à atteindre, ex. 1.5 puis 3.0. */
  rMultiple: number;
  /** Part de la position INITIALE à vendre sur ce palier (0..1, ex. 0.5 = 50 %). */
  fraction: number;
  /** Remonte le stop au prix d'entrée (frais compris) une fois ce palier exécuté. */
  moveStopToBe?: boolean;
  done?: boolean;
}

/** Stop suiveur dynamique : suit le plus haut atteint, ne redescend jamais. */
export interface TrailingConfig {
  mode: 'atr' | 'pct';
  /** Distance en multiples d'ATR (mode 'atr') ou en % (mode 'pct'). */
  value: number;
  /** Multiple de R à atteindre avant d'activer le trailing (0 ou absent = actif dès l'entrée). */
  activateAfterR?: number;
  /** ATR figé à l'entrée (mode 'atr'). */
  atr?: number;
}

/** Garde-fous portefeuille optionnels (Risk Overlay) appliqués avant l'exécution des achats. */
export interface RiskOverlayConfig {
  /** Risque cumulé maximal de toutes les positions ouvertes (% de l'équité, défaut 5 %). */
  maxHeatPct?: number;
  /** Nombre max de positions fortement corrélées au BTC (> 0,85) à pleine taille (défaut 2). */
  maxHighCorrPositions?: number;
  /** Réduit automatiquement la taille de mise en drawdown (−8 % → ×0,5 ; −15 % → ×0,25). */
  drawdownScaling?: boolean;
}

export interface Intent {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  /** Achat : montant fixe, risque fixe au stop, ou dimensionnement par volatilité cible. */
  sizing?: { usd: number } | { riskUsd: number; maxUsd: number } | { targetVolPct: number; assetVolAnnPct: number; equityUsd: number; maxUsd: number };
  /** Vente : part de la position, de 0 (exclu) à 1 (tout). */
  fraction?: number;
  /** Type d'ordre : au marché (défaut) ou limite maker (exécuté si le prix touche limitPrice). */
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  /** Durée de validité d'un ordre limite en heures (défaut 24 h). */
  expiresAfterHours?: number;
  /** Ordres attachés à un achat, posés à son exécution. `targetR` se calcule sur le prix réellement obtenu. */
  stop?: number; targetR?: number;
  /** Paliers de prise de profit partiels (prioritaires sur targetR unique). */
  tpLegs?: TakeProfitLeg[];
  /** Stop suiveur dynamique attaché à la position. */
  trailing?: TrailingConfig;
  /** Le stop se juge à la clôture par la stratégie (pas d'ordre stop en séance) ; il sert aussi à la taille. */
  stopOnClose?: boolean;
  /** L'ordre est abandonné si le prix d'exécution sort de ces bornes (le marché a trop bougé depuis la clôture). */
  skipAbove?: number; skipBelow?: number;
  /** Une phrase, affichée et envoyée telle quelle. */
  reason: string;
  tag?: string;
}

export interface Fill {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  kind: 'market' | 'stop' | 'target' | 'limit' | 'delist';
  quantity: number;
  /** Prix du marché au moment de l'exécution. */
  marketUsd: number;
  /** Prix obtenu, écart compris. */
  priceUsd: number;
  feeUsd: number;
  at: string;
  reason: string; tag?: string;
  /** Ordres attachés créés par cet achat. */
  stop?: number; target?: number;
  stopOnClose?: boolean;
  tpLegs?: TakeProfitLeg[];
  trailing?: TrailingConfig;
  entryPriceUsd?: number;
  initialRiskPerUnit?: number;
}

export interface Position {
  coinId: string; symbol: string; name: string;
  quantity: number;
  /** Quantité initiale à l'ouverture (sert au calcul des fractions de TP partiels). */
  initialQuantity?: number;
  /** Coût total (frais compris) de la quantité détenue. */
  costUsd: number;
  openedOn: string;
  entryPriceUsd?: number;
  initialRiskPerUnit?: number;
  stop?: number; target?: number;
  /** Stop jugé à la clôture par la stratégie : settleBar ne l'exécute pas en séance. */
  stopOnClose?: boolean;
  tpLegs?: TakeProfitLeg[];
  trailing?: TrailingConfig;
  /** Plus haut prix atteint depuis l'entrée (pilotage du trailing stop). */
  highWaterMark?: number;
}

export interface Book { cashUsd: number; positions: Record<string, Position> }

export interface UniverseEntry { coinId: string; symbol: string; name: string; rank: number | null; available: boolean | null }

export interface StrategyContext {
  /** Jour de décision D : jour UTC dont la bougie est close ; les décisions ne lisent que des bougies ≤ D. */
  decidedOn: string;
  /** Jour d'exécution E. */
  execDay: string;
  /** E est-il un jour prévu ? (1 = lundi … 7 = dimanche) */
  scheduled: (daysOfWeek: number[]) => boolean;
  universe: UniverseEntry[];
  /** Les 400 dernières bougies journalières closes ≤ D (tableau vide si inconnue). */
  candles: (coinId: string) => Candle[];
  temperature: number | null;
  btcAboveSma200: boolean | null;
  /** Cadence du tick ('1d' par défaut, ou '4h' sur les créneaux intraday). */
  timeframe?: '1d' | '4h';
  /** Instant ISO du créneau en cours. */
  slotIso?: string;
  /** Régime de marché détecté au jour de décision D. */
  regime?: RegimeSnapshot | null;
  /** Indicateurs quantitatifs pré-calculés par actif (Feature Store causal). */
  metrics?: (coinId: string) => AssetMetrics | null;
  /** Bougies 4H closes (si la stratégie tourne sur créneaux 4H et que la source les fournit). */
  candles4h?: (coinId: string) => Candle[];
  /** Taux de financement perpétuel 8 h (Binance fapi) si disponible. */
  fundingAt?: (coinId: string) => number | null;
  portfolio: {
    cashUsd: number; equityUsd: number; peakEquityUsd: number;
    /** Plus basse valeur atteinte depuis le dernier sommet (pause et reprise de « Trader »). */
    minSincePeakUsd: number;
    positions: Position[];
    /** Dernier jour où une exécution porte ce tag (et cette crypto, si précisée) ; null si jamais. */
    lastFillOn: (tag: string, coinId?: string) => string | null;
  };
  /** Données non rejouables, présentes en direct seulement (undefined au banc d'essai). */
  live?: { markets: CgMarket[]; smallCaps: CgMarket[] | null; rules: ProfileRules };
}

export type ParamValue = number | string | boolean | number[] | string[];

export interface Strategy<P extends Record<string, ParamValue> = Record<string, ParamValue>> {
  id: string;
  version: number;
  label: string;
  describe: string;
  defaults: P;
  /** Composants dont la version entre dans l'empreinte des règles. */
  uses: ('signals' | 'cycle' | 'autoBasket' | 'regime')[];
  replayable: boolean;
  /** Taille de l'univers transmis à la stratégie au banc d'essai (défaut : AUTOPILOT_UNIVERSE_TOP = 500). */
  universeTop?: number;
  /** Heures locales d'exécution par jour (défaut : [executionHour ?? 8] ; ex. [8, 12, 16, 20] pour 4H). */
  executionHours?: number[];
  /** Garde-fous portefeuille (Heat Cap, corrélation, drawdown scaling) appliqués avant exécution. */
  riskOverlay?: RiskOverlayConfig;
  /** Stratégies à trades (`trader`) ou à échéances (DCA) : le verdict de confiance n'emploie pas les mêmes critères. */
  kind: 'trades' | 'deposits';
  deposit(ctx: Pick<StrategyContext, 'execDay' | 'scheduled'>, p: P): number;
  decide(ctx: StrategyContext, p: P): Intent[];
}
