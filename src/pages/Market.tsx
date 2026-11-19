import { TrendingCard } from '../components/TrendingCard';
import { Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { useCycle, useFx, useMarkets, useScan } from '../hooks/useMarket';
import { isStable, isWrappedOrStaked } from '../lib/portfolio';
import { fmtCompact, fmtPrice } from '../lib/format';
import { Link, setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Card, CoinIcon, Delta, ErrorNote, Input, PageHeader, Segmented, SignalBadge, Sparkline, Spinner, Table, Td, Toggle,
} from '../components/ui';
import { CdcBadge } from '../components/CdcBadge';
import { useCryptoCom } from '../hooks/useCryptoCom';
import type { Analysis, Setup } from '../lib/signals';
import { isUnreliable, reliabilityOf } from '../lib/lab/reliability';
import { setupExpectancy } from '../lib/lab/tradeCheck';
import { COSTS } from '../lib/lab/types';

const breakoutR = setupExpectancy('setup:breakout', COSTS.exchange).expectancyR;

const VERDICT_RANK: Record<string, number> = { 'validé': 3, prometteur: 2 };
/** Fiabilité du meilleur setup détecté : verdict d'abord, puis taux de réussite mesuré. */
function setupScore(setups: Setup[]): number {
  return Math.max(-1, ...setups.map((s) => { const r = reliabilityOf(`setup:${s.key}`); return r ? (VERDICT_RANK[r.verdict] ?? 0) * 1000 + r.hitPct : 0; }));
}

type Universe = 'top' | 'watch' | 'mine' | 'setups';
type Horizon = 'investor' | 'trader';

export default function Market() {
  const { query } = useHashPath();
  const universe = (query.get('u') as Universe) || 'top';
  const horizon = (query.get('h') as Horizon) || 'investor';
  const [q, setQ] = useState('');
  const [onlyCdc, setOnlyCdc] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const cdc = useCryptoCom();
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const transactions = useStore((s) => s.transactions);
  const scanSize = useStore((s) => s.settings.scanSize);
  const currency = useStore((s) => s.settings.currency);
  const markets = useMarkets();
  const cycle = useCycle();
  const fxv = useFx();
  const rate = currency === 'EUR' ? fxv : 1;

  const base = useMemo(() => (markets.data ?? []).filter((m) => !isStable(m.symbol, m.id) && !isWrappedOrStaked(m.symbol, m.name, m.id)), [markets.data]);
  const mine = useMemo(() => new Set(transactions.map((t) => t.coinId)), [transactions]);

  const scanList = useMemo(() => {
    const ids = new Set([...base.slice(0, scanSize).map((m) => m.id), ...watchlist, ...mine]);
    return base.filter((m) => ids.has(m.id));
  }, [base, scanSize, watchlist, mine]);
  const scan = useScan(scanList, cycle.data?.temperature);
  const regime = useMemo(() => {
    const b = scan.data?.get('bitcoin');
    const trend = b ? (b.price >= b.sma200 ? 'Bitcoin au-dessus de sa moyenne 200 jours' : 'Bitcoin sous sa moyenne 200 jours') : 'tendance de Bitcoin inconnue';
    const z = cycle.data?.zone;
    return `${trend}${cycle.data?.temperature != null ? ` · température ${Math.round(cycle.data.temperature)}/100${z ? ` (${z.label})` : ''}` : ''}`;
  }, [scan.data, cycle.data]);

  const rows = useMemo(() => {
    let list = scanList;
    if (universe === 'top') list = base.slice(0, scanSize);
    if (universe === 'watch') list = scanList.filter((m) => watchlist.includes(m.id));
    if (universe === 'mine') list = scanList.filter((m) => mine.has(m.id));
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((m) => m.name.toLowerCase().includes(s) || m.symbol.toLowerCase().includes(s));
    if (onlyCdc && cdc.ready) list = list.filter((m) => cdc.status(m.id) !== 'unknown');
    const withA = list.map((m) => ({ m, a: scan.data?.get(m.id) ?? null }));
    if (universe === 'setups') {
      // Setups triés par fiabilité mesurée ; ceux que l'historique ne valide pas sont masqués par défaut.
      const keep = (s: Setup) => showWeak || reliabilityOf(`setup:${s.key}`)?.verdict === 'validé';
      return withA
        .filter((r) => r.a && r.a.setups.some(keep))
        .sort((x, y) => setupScore(y.a!.setups.filter(keep)) - setupScore(x.a!.setups.filter(keep)) || (y.a!.trader.score - x.a!.trader.score));
    }
    return withA.sort((x, y) => {
      const sx = x.a ? (horizon === 'investor' ? x.a.investor.score : x.a.trader.score) : -999;
      const sy = y.a ? (horizon === 'investor' ? y.a.investor.score : y.a.trader.score) : -999;
      return sy - sx;
    });
  }, [scanList, base, universe, watchlist, mine, q, scan.data, horizon, scanSize, onlyCdc, cdc, showWeak]);

  const sig = (a: Analysis | null, h: Horizon) => {
    if (!a) return <span className="text-xs text-muted">—</span>;
    const r = h === 'investor' ? a.investor : a.trader;
    return <SignalBadge label={r.label} tone={r.tone} strength={r.strength} score={r.score} confidence={r.confidence} limited={r.limitedBy} reliabilityKey={`${h === 'investor' ? 'inv' : 'tr'}:${r.label}`} />;
  };
  /** Setups soutenus par l'historique d'abord ; les autres sont seulement comptés (« peu fiables »). */
  const setupBadges = (setups: Setup[], max = 9) => {
    const ok = setups.filter((s) => !isUnreliable(`setup:${s.key}`));
    const weak = setups.length - ok.length;
    return (
      <>
        {ok.slice(0, max).map((s) => <Badge key={s.key} tone={s.bias === 'bull' ? 'up' : s.bias === 'bear' ? 'down' : 'neutral'}>{s.label}</Badge>)}
        {weak > 0 && <span className="text-[0.7rem] text-muted" title="Setups que l’historique ne soutient pas : voir la fiche de la crypto ou le banc d’essai (Labo).">+{weak} peu fiable{weak > 1 ? 's' : ''}</span>}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Signaux d’achat & de vente"
        subtitle="Chaque crypto reçoit deux signaux expliqués : Investisseur (tendance de fond, valorisation, cycle — horizon de plusieurs mois) et Trader (momentum, excès, cassures — quelques jours à semaines)."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={universe}
          onChange={(v) => setQuery({ u: v })}
          options={[
            { value: 'top', label: `Top ${scanSize}` },
            { value: 'watch', label: `Watchlist (${watchlist.length})` },
            { value: 'mine', label: 'Mes positions' },
            { value: 'setups', label: 'Setups détectés' },
          ]}
        />
        <Segmented value={horizon} onChange={(v) => setQuery({ h: v })} options={[{ value: 'investor', label: 'Tri investisseur' }, { value: 'trader', label: 'Tri trader' }]} />
        <Toggle checked={onlyCdc} onChange={setOnlyCdc} label={cdc.ready ? 'Seulement Crypto.com' : 'Seulement Crypto.com (liste en chargement)'} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {universe === 'setups' && (
        <Banner tone="info" title={`Régime du moment : ${regime}`}>
          Setups triés par fiabilité mesurée (validés d’abord, puis par taux de réussite sur l’historique). La cassure avec volume est le seul setup validé : son plan (stop à la clôture, objectif 3 R) a fait {breakoutR != null ? `${breakoutR >= 0 ? '+' : '−'}${Math.abs(breakoutR).toFixed(2).replace('.', ',')} R` : '—'} par trade sur l’historique, frais d’une plateforme d’échange compris.
          <span className="mt-2 block"><Toggle checked={showWeak} onChange={setShowWeak} label="Montrer aussi les setups non validés" /></span>
        </Banner>
      )}
      {markets.error && <ErrorNote error={markets.error} onRetry={() => markets.refetch()} />}
      {(markets.isLoading || scan.isLoading) && <Spinner label="Récupération des bougies et calcul des indicateurs…" />}

      {/* Mobile : cartes */}
      <div className={clsx('space-y-2 md:hidden', scan.isFetching && 'opacity-80')}>
        {rows.map(({ m, a }) => (
          <Link key={m.id} to={`/coin/${m.id}`} className="block rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <CoinIcon src={m.image} symbol={m.symbol} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{m.name} <span className="text-muted">{m.symbol.toUpperCase()}</span></div>
                <div className="tnum text-xs text-ink-2">{fmtPrice(m.current_price * rate, currency)} · <Delta value={m.price_change_percentage_24h} /></div>
              </div>
              <button type="button" aria-label="Watchlist" onClick={(e) => { e.preventDefault(); toggleWatch(m.id); }} className="p-1">
                <Star className={clsx('size-4', watchlist.includes(m.id) ? 'fill-warn text-warn' : 'text-muted')} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Invest.</span>{sig(a, 'investor')}
              <span>Trader</span>{sig(a, 'trader')}
              <CdcBadge status={cdc.status(m.id)} ready={cdc.ready} />
            </div>
            {a && a.setups.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1">{setupBadges(a.setups)}</div>}
          </Link>
        ))}
      </div>

      {/* Ordinateur : tableau */}
      <Card padded={false} className={clsx('hidden md:block', scan.isFetching && 'opacity-80')}>
        <Table head={['Crypto', 'Prix', '24 h', '7 j', '30 j', '7 jours', 'Investisseur', 'Trader', 'RSI', 'Capi', '']}>
          {rows.map(({ m, a }) => (
            <tr key={m.id} className="hover:bg-surface-2">
              <Td left>
                <Link to={`/coin/${m.id}`} className="flex items-center gap-2.5">
                  <span className="w-6 text-right text-xs text-muted">{m.market_cap_rank}</span>
                  <CoinIcon src={m.image} symbol={m.symbol} size={24} />
                  <span className="max-w-[180px] truncate font-medium text-ink">{m.name}</span>
                  <span className="text-xs text-muted">{m.symbol.toUpperCase()}</span>
                </Link>
                <div className="mt-1 flex flex-wrap gap-1 pl-[3.6rem]">
                  <CdcBadge status={cdc.status(m.id)} ready={cdc.ready} />
                  {a && setupBadges(a.setups, 2)}
                </div>
              </Td>
              <Td className="text-ink">{fmtPrice(m.current_price * rate, currency)}</Td>
              <Td><Delta value={m.price_change_percentage_24h} /></Td>
              <Td><Delta value={m.price_change_percentage_7d_in_currency} /></Td>
              <Td><Delta value={m.price_change_percentage_30d_in_currency} /></Td>
              <Td><div className="flex justify-end">{m.sparkline_in_7d && <Sparkline values={m.sparkline_in_7d.price} />}</div></Td>
              <Td>{sig(a, 'investor')}</Td>
              <Td>{sig(a, 'trader')}</Td>
              <Td className={clsx(a && a.rsi14 > 70 && 'text-down', a && a.rsi14 < 30 && 'text-up')}>{a ? Math.round(a.rsi14) : '—'}</Td>
              <Td className="text-ink-2">{fmtCompact(m.market_cap * rate, currency)}</Td>
              <Td>
                <button type="button" aria-label={watchlist.includes(m.id) ? 'Retirer de la watchlist' : 'Ajouter à la watchlist'} onClick={() => toggleWatch(m.id)} className="p-1">
                  <Star className={clsx('size-4', watchlist.includes(m.id) ? 'fill-warn text-warn' : 'text-muted hover:text-ink')} />
                </button>
              </Td>
            </tr>
          ))}
        </Table>
        {!rows.length && !scan.isLoading && <p className="p-5 text-sm text-muted">Aucune crypto dans cette sélection.</p>}
      </Card>

      <Card title="Comment lire ces signaux ?">
        <div className="grid gap-4 text-sm text-ink-2 md:grid-cols-3">
          <div>
            <p className="font-medium text-ink">Investisseur</p>
            <p className="mt-1">Seules des conditions mesurées sur l’historique décident du libellé : « Accumuler » quand la température du marché est sous 40 ou quand tendance, valorisation et cycle sont alignés, « Alléger » sur un excès (RSI hebdomadaire au-dessus de 80, prix à plus de 2 fois sa moyenne 200 jours) ou pour une altcoin en marché chaud, « Prendre des profits » en euphorie. Le score sert au tri.</p>
          </div>
          <div>
            <p className="font-medium text-ink">Trader</p>
            <p className="mt-1">Un seul signal d’achat est validé : la cassure des plus hauts 20 jours avec du volume (« Achat », et « Achat fort » avec un volume double). Aucun signal de vente ne l’est : le trader reste « Neutre » le reste du temps. Plan associé : stop jugé à la clôture, objectif à 3 R.</p>
          </div>
          <div>
            <p className="font-medium text-ink">Les limites</p>
            <p className="mt-1">Aucun indicateur ne prédit l’avenir : ce sont des probabilités. Combine toujours le signal avec ta taille de position et un niveau d’invalidation. Ouvre une crypto pour voir le détail de chaque facteur. Chaque libellé affiche sa fiabilité mesurée sur l’historique (au survol, et dans Labo → Banc d’essai).</p>
          </div>
        </div>
      </Card>
      <TrendingCard />
    </div>
  );
}
