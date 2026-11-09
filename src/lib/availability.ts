// Disponibilité d'une crypto sur Crypto.com : la liste publique de l'Exchange donne des tickers, pas des identifiants.
// Quand plusieurs cryptos portent le même ticker, on retient la mieux classée (les imitations sont presque toujours
// des micro-capitalisations). Les stablecoins courants sont toujours disponibles dans l'application.

export type CdcStatus = 'app' | 'exchange' | 'unknown';

const ALWAYS = new Set(['usdc', 'usdt', 'dai']);

export function makeAvailability(
  listed: Iterable<string>,
  coins: { id: string; symbol: string; market_cap_rank: number | null }[],
): Set<string> {
  const symbols = new Set([...listed].map((s) => s.toUpperCase()));
  const best = new Map<string, { id: string; rank: number }>();
  for (const c of coins) {
    const s = c.symbol.toUpperCase();
    if (!symbols.has(s) && !ALWAYS.has(c.symbol.toLowerCase())) continue;
    const rank = c.market_cap_rank && c.market_cap_rank > 0 ? c.market_cap_rank : 1e9;
    const cur = best.get(s);
    if (!cur || rank < cur.rank) best.set(s, { id: c.id, rank });
  }
  return new Set([...best.values()].map((b) => b.id));
}

/** `app` : confirmé par toi dans l'application ; `exchange` : listé sur l'Exchange (très probablement dans l'application). */
export function statusOf(id: string, available: Set<string>, seen: string[]): CdcStatus {
  if (seen.includes(id)) return 'app';
  return available.has(id) ? 'exchange' : 'unknown';
}
