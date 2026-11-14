// Découverte automatique : tu règles juste la part « découverte » de ton panier DCA, et Boussole choisit
// LA crypto à acheter — plus de liste à remplir à la main, plus de choix à faire. Fonction pure, testée.
//
// Le choix n'est pas un dé : les candidates sont les petites capitalisations du scan (celles de l'onglet
// « Petites capis », mêmes critères, mêmes scores), débarrassées de ce que tu détiens déjà et du cœur,
// triées par score Boussole. La lib basket.ts garde TOUS ses garde-fous (FOMO 7 j, plafond par pépite,
// finir une ligne ouverte avant d'en ouvrir une autre, disponibilité sur ta plateforme d'achat).

import type { CoinRef } from '../types';
import { DEFAULT_SMALLCAP_FILTER, isSmallCapCandidate, scoreSmallCap, type SmallCapInput } from './gems';

export interface AutoPick {
  coin: CoinRef;
  /** Score du scan (0-100) : le classement se fait dessus, la raison l'explique. */
  score: number;
  /** Pourquoi cette candidate est arrivée là (affichée dans le plan du jour). */
  reason: string;
}

export interface AutoDiscoveryOptions {
  /** Identifiants (CoinGecko) à exclure : cœur du panier, autres lignes du plan, stablecoins détenus… */
  excluded: ReadonlySet<string>;
  /** Symboles du cœur (BTC, ETH…) : jamais des lignes de découverte, même en cas d'homonyme. */
  excludedSymbols: ReadonlySet<string>;
  /** Nombre de candidates pré-sélectionnées (le plan n'en achète qu'une). */
  max?: number;
}

/** Les candidates du jour : pépites du scan, filtrées, classées — la porte reste ouverte à toutes les autres. */
export function autoDiscoveryCandidates(rows: SmallCapInput[], opts: AutoDiscoveryOptions): AutoPick[] {
  const max = opts.max ?? 5;
  const seen = new Set<string>();
  return rows
    .filter((c) => isSmallCapCandidate(c, DEFAULT_SMALLCAP_FILTER))
    .filter((c) => !opts.excluded.has(c.id) && !opts.excludedSymbols.has(c.symbol.toUpperCase()))
    .map((c) => ({ c, s: scoreSmallCap(c) }))
    .sort((a, b) => b.s.score - a.s.score)
    .map(({ c, s }) => ({ coin: { coinId: c.id, symbol: c.symbol, name: c.name }, score: s.score, reason: `Pépite du scan, score ${s.score}/100` }))
    .filter((p) => (seen.has(p.coin.coinId) ? false : (seen.add(p.coin.coinId), true)))
    .slice(0, max);
}
