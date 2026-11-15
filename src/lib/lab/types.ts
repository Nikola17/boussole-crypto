// Types du Labo : contrat d'une stratégie, ordres, exécutions et portefeuille simulé.
// Le même contrat sert au banc d'essai (historique) et à l'autopilote (direct) : une stratégie lit des bougies
// journalières closes et rend des ordres ; elle ne lit ni l'horloge ni le réseau.

import type { Candle } from '../indicators';
import type { CgMarket } from '../../api/coingecko';
import type { ProfileRules } from '../../types';

/** Frais et écart de prix, par côté, en %. */
export interface CostModel { feePct: number; spreadPct: number }

/** Préréglages : plateforme d'échange (ordre au marché) et application grand public (achat instantané). */
export const COSTS = {
  exchange: { feePct: 0.1, spreadPct: 0.05 },
  app: { feePct: 0, spreadPct: 1.5 },
} as const satisfies Record<string, CostModel>;

export interface Intent {
  coinId: string; symbol: string; name: string;
  side: 'buy' | 'sell';
  /** Achat : montant fixe, ou montant calculé pour risquer `riskUsd` si le stop est touché (plafonné par `maxUsd`). */
  sizing?: { usd: number } | { riskUsd: number; maxUsd: number };
  /** Vente : part de la position, de 0 (exclu) à 1 (tout). */
  fraction?: number;
  /** Ordres attachés à un achat, posés à son exécution. `targetR` se calcule sur le prix réellement obtenu. */
  stop?: number; targetR?: number;
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
}

export interface Position {
  coinId: string; symbol: string; name: string;
  quantity: number;
  /** Coût total (frais compris) de la quantité détenue. */
  costUsd: number;
  openedOn: string;
  stop?: number; target?: number;
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
  uses: ('signals' | 'cycle' | 'autoBasket')[];
  replayable: boolean;
  /** Stratégies à trades (`trader`) ou à échéances (DCA) : le verdict de confiance n'emploie pas les mêmes critères. */
  kind: 'trades' | 'deposits';
  deposit(ctx: Pick<StrategyContext, 'execDay' | 'scheduled'>, p: P): number;
  decide(ctx: StrategyContext, p: P): Intent[];
}
