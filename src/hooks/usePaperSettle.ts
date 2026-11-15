// Règle les ordres en attente des portefeuilles papier manuels : au lancement, puis toutes les 15 minutes tant
// que l'application est ouverte (le serveur veilleur fait de même application fermée, avec les mêmes identifiants).

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useMarkets } from './useMarket';
import { binanceSymbolFor, getAllPrices, getKlines } from '../api/binance';
import { settleOrders } from '../lib/lab/settle';
import type { Candle } from '../lib/indicators';

const HOUR = 3600_000;

/** Bougies 1 heure d'une paire depuis `fromMs` (12 pages de 1000 heures au plus). */
export async function hourlySince(symbol: string, fromMs: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let cursor = Math.floor(fromMs / HOUR) * HOUR;
  for (let page = 0; page < 12; page++) {
    const chunk = await getKlines(symbol, '1h', 1000, cursor);
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < 1000) break;
    cursor = (chunk[chunk.length - 1].time + 3600) * 1000;
  }
  return out;
}

/** Paire Binance d'une crypto : contrôlée par le prix quand il est connu, sinon par le seul symbole. */
export function pairOf(coin: { coinId: string; symbol: string }, prices: Map<string, number>, priceUsd: number | null): string | null {
  if (priceUsd) return binanceSymbolFor({ id: coin.coinId, symbol: coin.symbol, priceUsd }, prices);
  const sym = `${coin.symbol.toUpperCase()}USDT`;
  return prices.has(sym) ? sym : null;
}

export function usePaperSettle(): void {
  const markets = useMarkets();
  const marketsRef = useRef(markets.data);
  marketsRef.current = markets.data;
  useEffect(() => {
    let stopped = false;
    const run = async () => {
      const s = useStore.getState();
      const open = s.paperOrders.filter((o) => o.status === 'open');
      if (!open.length) return;
      try {
        const prices = await getAllPrices();
        const hourly = new Map<string, Candle[]>();
        for (const coinId of [...new Set(open.map((o) => o.coinId))]) {
          const o = open.find((x) => x.coinId === coinId)!;
          const price = marketsRef.current?.find((m) => m.id === coinId)?.current_price ?? null;
          const sym = pairOf(o, prices, price);
          if (!sym) continue;
          const from = Math.min(...open.filter((x) => x.coinId === coinId).map((x) => Date.parse(x.createdAt)));
          hourly.set(coinId, await hourlySince(sym, from));
        }
        if (stopped) return;
        for (const portfolio of useStore.getState().paperPortfolios.filter((p) => p.kind === 'manual')) {
          const st = useStore.getState();
          const r = settleOrders({ portfolio, orders: st.paperOrders, trades: st.paperTrades.filter((t) => t.portfolioId === portfolio.id), hourly, nowMs: Date.now() });
          for (const t of r.trades) st.upsertPaperTrade(t);
          for (const o of r.orders) st.upsertPaperOrder(o);
        }
      } catch {
        /* réseau indisponible : on réessaiera au prochain passage, rien n'est inventé */
      }
    };
    void run();
    const timer = setInterval(() => void run(), 15 * 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
}
