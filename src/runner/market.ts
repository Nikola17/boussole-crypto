// Prix du marché pour le runner (CoinGecko « simple/price », comme le script d'arrière-plan Android)
// et indice Fear & Greed (alternative.me). Le client HTTP complet de l'application (file d'attente par hôte)
// vit côté navigateur : ici, requête unique, frais, et une erreur explicite — jamais un prix inventé.

export interface CoinPrice {
  usd?: number;
  eur?: number;
  /** Variation 24 h (en %) telle que CoinGecko la donne. */
  change?: number;
}

const TIMEOUT_MS = 20_000;

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      if (res.status === 429) throw new Error('CoinGecko : limite de requêtes atteinte (ajoute une clé « Demo » gratuite dans la configuration).');
      throw new Error(`CoinGecko a répondu ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prix en USD et EUR (+ variation 24 h) d'une liste d'identifiants CoinGecko.
 * Erreur → exception : l'appelant ne consommera rien ce cycle-ci.
 */
export async function fetchPrices(ids: string[], coingeckoKey: string | null): Promise<Record<string, CoinPrice>> {
  const uniq = [...new Set(ids)].filter(Boolean).slice(0, 90); // même plafond de prudence que le script Android
  if (!uniq.length) return {};
  const headers: Record<string, string> = {};
  if (coingeckoKey) headers['x-cg-demo-api-key'] = coingeckoKey;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniq.join(','))}&vs_currencies=usd,eur&include_24h_change=true`;
  const raw = await getJson<Record<string, { usd?: number; eur?: number; usd_24h_change?: number; eur_24h_change?: number }>>(url, headers);
  const out: Record<string, CoinPrice> = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p || typeof p !== 'object') continue;
    const change = typeof p.usd_24h_change === 'number' ? p.usd_24h_change : p.eur_24h_change;
    out[id] = { usd: typeof p.usd === 'number' ? p.usd : undefined, eur: typeof p.eur === 'number' ? p.eur : undefined, change: typeof change === 'number' ? change : undefined };
  }
  return out;
}

/** Indice Fear & Greed du jour (null : indisponible, sans bloquer le reste). Mêmes libellés que l'application. */
export async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const raw = await getJson<{ data?: { value?: string; value_classification?: string }[] }>('https://api.alternative.me/fng/?limit=1&format=json', {});
    const d = raw.data?.[0];
    if (!d || d.value == null) return null;
    const value = Number(d.value);
    if (!Number.isFinite(value)) return null;
    const LABELS: Record<string, string> = { 'Extreme Fear': 'Peur extrême', Fear: 'Peur', Neutral: 'Neutre', Greed: 'Avidité', 'Extreme Greed': 'Avidité extrême' };
    return { value, label: LABELS[d.value_classification ?? ''] ?? d.value_classification ?? '' };
  } catch {
    return null; // le brief n'a pas besoin du Fear & Greed pour exister
  }
}
