// Règle les ordres en attente des portefeuilles papier manuels : au lancement, puis toutes les 15 minutes tant
// que l'application est ouverte (le serveur veilleur fait de même application fermée, avec les mêmes identifiants).

import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { useMarkets } from './useMarket';
import { getAllPrices } from '../api/binance';
import { hourlyBetween, pairOf } from '../lib/lab/pairs';
import { settleOrders } from '../lib/lab/settle';
import type { Candle } from '../lib/indicators';

export { pairOf } from '../lib/lab/pairs';

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
          hourly.set(coinId, await hourlyBetween(sym, from));
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
