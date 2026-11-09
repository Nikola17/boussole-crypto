// Poussières : les petites lignes sans thèse ni place dans le panier ne rapportent presque rien.
// On propose de les regrouper vers Bitcoin ; celles de la liste « découverte » sont renforcées par le panier.

export interface DustInput {
  key: string;
  coinId?: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  valueUsd: number;
  priceUsd: number | null;
  bucket: string;
  source: 'ledger' | 'wallet';
}

export interface DustLine {
  coinId: string;
  symbol: string;
  name: string;
  image?: string;
  quantity: number;
  valueUsd: number;
  priceUsd: number | null;
  pct: number;
  advice: 'merge' | 'reinforce';
  why: string;
}

export interface DustPlan {
  merge: DustLine[];
  reinforce: DustLine[];
  mergeValueUsd: number;
  totalUsd: number;
}

/**
 * `thesisIds` : cryptos pour lesquelles tu as écrit une thèse ; `coreIds` : cœur du panier ; `discoveryIds` : liste découverte.
 * Seules les lignes du journal sont concernées (un solde sur un wallet lié ne se regroupe pas depuis la plateforme).
 */
export function dustPlan(
  holdings: DustInput[],
  opts: { minLinePct: number; thesisIds: Set<string>; coreIds: Set<string>; discoveryIds: Set<string> },
): DustPlan {
  const totalUsd = holdings.reduce((s, h) => s + h.valueUsd, 0);
  const byCoin = new Map<string, DustInput & { coinId: string }>();
  for (const h of holdings) {
    if (!h.coinId || h.bucket === 'stable' || h.source !== 'ledger') continue;
    const cur = byCoin.get(h.coinId);
    if (cur) { cur.quantity += h.quantity; cur.valueUsd += h.valueUsd; } else byCoin.set(h.coinId, { ...h, coinId: h.coinId });
  }
  const merge: DustLine[] = [];
  const reinforce: DustLine[] = [];
  for (const h of byCoin.values()) {
    // Une ligne détenue ailleurs aussi pèse plus lourd : on juge sur le total de la crypto.
    const whole = holdings.filter((x) => x.coinId === h.coinId).reduce((s, x) => s + x.valueUsd, 0);
    const pct = totalUsd > 0 ? (whole / totalUsd) * 100 : 0;
    if (pct >= opts.minLinePct || opts.coreIds.has(h.coinId) || opts.thesisIds.has(h.coinId) || h.valueUsd <= 0) continue;
    const base = { coinId: h.coinId, symbol: h.symbol, name: h.name, image: h.image, quantity: h.quantity, valueUsd: h.valueUsd, priceUsd: h.priceUsd, pct };
    if (opts.discoveryIds.has(h.coinId)) reinforce.push({ ...base, advice: 'reinforce', why: 'Dans ta liste découverte : le panier la renforce avant d’en ouvrir une autre.' });
    else merge.push({ ...base, advice: 'merge', why: 'Sans thèse ni place dans ton panier : à ce poids, même un ×10 ne change presque rien.' });
  }
  merge.sort((a, b) => b.valueUsd - a.valueUsd);
  reinforce.sort((a, b) => b.valueUsd - a.valueUsd);
  return { merge, reinforce, mergeValueUsd: merge.reduce((s, l) => s + l.valueUsd, 0), totalUsd };
}
