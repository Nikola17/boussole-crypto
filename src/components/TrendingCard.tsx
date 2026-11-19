// Radar « attention du moment » : tendances CoinGecko (recherches) — pour repérer tôt ce qui monte en intérêt,
// avec l'avertissement de rigueur sur les jeunes/nouveaux tokens. Aucune recommandation d'achat.

import { useTrending } from '../hooks/useMarket';
import { Link } from '../router';
import { Badge, Card, Spinner } from './ui';
import { fmtNum } from '../lib/format';
import { useT } from '../hooks/useT';

export function TrendingCard() {
  const t = useT();
  const trending = useTrending();
  const items = (trending.data?.coins ?? []).slice(0, 8);

  return (
    <Card title={t('Radar — attention du moment')} subtitle={t('Les cryptos les plus recherchées en ce moment (CoinGecko). Repérer tôt ≠ acheter : vérifie le projet, l’âge du token et le scan de sécurité.')}>
      {trending.isLoading && <Spinner label="Lecture des tendances…" />}
      {trending.data && items.length === 0 && <p className="text-sm text-muted">{t('Tendances indisponibles pour le moment.')}</p>}
      <ul className="divide-y divide-line">
        {items.map(({ item: c }) => {
          const chg = c.data?.price_change_percentage_24h?.usd;
          const isNew = c.market_cap_rank == null;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link to={`/coin/${c.id}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                <img src={c.thumb} alt="" className="size-5 rounded-full" loading="lazy" />
                <span className="truncate font-medium text-ink">{c.name}</span>
                <span className="text-xs uppercase text-muted">{c.symbol}</span>
              </Link>
              <span className="flex items-center gap-2">
                {isNew && <Badge tone="warn">{t('nouveau')}</Badge>}
                {c.market_cap_rank != null && <span className="hidden text-xs text-muted sm:inline">#{c.market_cap_rank}</span>}
                {chg != null && <span className={`tnum text-xs ${chg >= 0 ? 'text-up' : 'text-down'}`}>{fmtNum(chg, 1)} %</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">
        {t('Rappel : 98,6 % des tokens lancés sur les plateformes de memecoins sont des arnaques. Un token « tendance » de moins de 7 jours est un signal de spéculation, pas d’investissement.')}
      </p>
    </Card>
  );
}
