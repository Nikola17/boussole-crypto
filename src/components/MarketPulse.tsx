// Pouls du marché (Pépites → Narratives) : secteurs qui attirent l'argent sur 24 h et cryptos les plus recherchées.

import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useCategories, useTrending } from '../hooks/useMarket';
import { fmtNum } from '../lib/format';
import { Link } from '../router';
import { Card, CoinIcon, Delta, ErrorNote, Spinner } from './ui';

export function NarrativesCard() {
  const cats = useCategories();
  const top = useMemo(() => (cats.data ?? [])
    .filter((c) => (c.market_cap ?? 0) > 2e8 && c.market_cap_change_24h != null)
    .sort((a, b) => (b.market_cap_change_24h ?? 0) - (a.market_cap_change_24h ?? 0)), [cats.data]);
  const hot = top.slice(0, 6);
  const cold = top.slice(-3).reverse();
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Flame className="size-4 text-accent" />Narratives du jour</span>} subtitle="Secteurs qui attirent (ou font fuir) l’argent sur 24 h">
      {cats.isLoading && <Spinner />}
      {cats.error && <ErrorNote error={cats.error} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {hot.map((c) => (
          <Link key={c.id} to={`/pepites?tab=narratives&cat=${encodeURIComponent(c.id)}`} className="rounded-lg border border-line bg-surface-2 p-2.5 hover:bg-surface-3">
            <div className="truncate text-xs font-medium text-ink">{c.name}</div>
            <div className="mt-1 flex items-center justify-between">
              <Delta value={c.market_cap_change_24h} className="text-sm" />
              <div className="flex -space-x-1.5">
                {c.top_3_coins.slice(0, 3).map((src, i) => <img key={i} src={src} alt="" className="size-4 rounded-full ring-2 ring-surface-2" />)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {cold.length > 0 && (
        <p className="mt-3 text-xs text-muted">En retrait : {cold.map((c) => `${c.name} (${fmtNum(c.market_cap_change_24h ?? 0, 1)} %)`).join(' · ')}</p>
      )}
    </Card>
  );
}

export function TrendingCard() {
  const trending = useTrending();
  return (
    <Card title="Les plus recherchées" subtitle="Tendances de recherche CoinGecko (indicateur d’attention, pas de qualité)">
      {trending.isLoading && <Spinner />}
      <ul className="divide-y divide-line">
        {(trending.data?.coins ?? []).slice(0, 7).map(({ item }) => (
          <li key={item.id}>
            <Link to={`/coin/${item.id}`} className="flex items-center gap-3 py-2">
              <CoinIcon src={item.small || item.thumb} symbol={item.symbol} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.name} <span className="text-muted">{item.symbol}</span></span>
              <span className="text-xs text-muted">{item.market_cap_rank ? `#${item.market_cap_rank}` : '—'}</span>
              <Delta value={item.data?.price_change_percentage_24h?.usd ?? null} className="w-20 justify-end text-xs" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
