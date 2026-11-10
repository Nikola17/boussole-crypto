// Liens écrits par l'IA : on montre toujours le VRAI domaine, et on demande confirmation avant d'ouvrir un site inconnu
// (faux sites de « claim » d'airdrop, faux supports, drainers de wallet).

/** Sites que l'application cite elle-même (données, actualités, outils de sécurité) : ouverts sans confirmation. */
export const TRUSTED_HOSTS = [
  'coingecko.com', 'coindesk.com', 'cointelegraph.com', 'decrypt.co', 'theblock.co', 'defillama.com', 'dexscreener.com', 'geckoterminal.com',
  'etherscan.io', 'solscan.io', 'mempool.space', 'rugcheck.xyz', 'gopluslabs.io', 'revoke.cash', 'github.com', 'crypto.com', 'binance.com',
  'ledger.com', 'amf-france.org', 'impots.gouv.fr', 'portal.nousresearch.com', 'anthropic.com', 'alternative.me', 'tradingview.com',
];

export interface LinkInfo {
  /** Faux pour tout ce qui n'est pas du https bien formé (javascript:, file:, http en clair, adresse illisible). */
  ok: boolean;
  host: string;
  trusted: boolean;
}

export function linkInfo(href: string | undefined | null): LinkInfo {
  try {
    const u = new URL(href ?? '');
    if (u.protocol !== 'https:') return { ok: false, host: u.host || u.protocol, trusted: false };
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    // Un nom de domaine qui contient « xn-- » (caractères imitant d'autres lettres) n'est jamais considéré comme sûr.
    const trusted = !host.includes('xn--') && TRUSTED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
    return { ok: true, host, trusted };
  } catch {
    return { ok: false, host: '', trusted: false };
  }
}
