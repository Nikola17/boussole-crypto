// Copy trading Binance — statistiques PUBLIQUES uniquement (leaderboard, détail d'un portefeuille public).
// Boussole ne copie jamais automatiquement et n'a jamais besoin de clé API pour ça.
// L'API web de Binance peut refuser selon les régions/IP (403) : tout renvoie null, l'UI affiche « indisponible ».

import { getJson } from './http';
import type { TraderStats } from '../lib/copyWatch';

const BAPI = 'https://www.binance.com/bapi/copyTrading/v1/public/v1/spot';

interface RawTrader {
  portfolioId?: string | number;
  nickName?: string;
  roi30d?: string | number;
  maxDrawdown30d?: string | number;
  followerCount?: string | number;
}

/** Stats publiques d'un portefeuille de copy trading, ou null si illisible. */
export async function getTraderStats(portfolioId: string): Promise<(TraderStats & { name: string }) | null> {
  try {
    const r = await getJson<{ data?: RawTrader }>(`${BAPI}/trader/detail?portfolioId=${encodeURIComponent(portfolioId)}`, { timeoutMs: 12000, retries: 0 });
    const d = r.data;
    if (!d) return null;
    const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      name: String(d.nickName ?? portfolioId),
      roi30dPct: num(d.roi30d),
      maxDrawdown30dPct: num(d.maxDrawdown30d),
      followers: num(d.followerCount) ?? undefined,
    };
  } catch {
    return null;
  }
}

/** Top du leaderboard public (30 j) — liste de départ pour constituer sa watchlist. */
export async function getLeaderboard(timeRange = '30d', pageSize = 20): Promise<(TraderStats & { portfolioId: string; name: string })[]> {
  try {
    const r = await getJson<{ data?: { list?: RawTrader[] } }>(`${BAPI}/leaderboard?timeRange=${timeRange}&pageNo=1&pageSize=${pageSize}`, { timeoutMs: 12000, retries: 0 });
    const list = r.data?.list;
    if (!Array.isArray(list)) return [];
    const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    return list
      .filter((t) => t.portfolioId != null)
      .map((t) => ({
        portfolioId: String(t.portfolioId),
        name: String(t.nickName ?? t.portfolioId),
        roi30dPct: num(t.roi30d),
        maxDrawdown30dPct: num(t.maxDrawdown30d),
        followers: num(t.followerCount) ?? undefined,
      }));
  } catch {
    return [];
  }
}
