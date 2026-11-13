import { ArrowRight, Flame, Gauge, RefreshCw, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useAltSeason, useCategories, useCycle, useFearGreed, useGlobal, useMarkets, useScan, useTrending } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useFocusCoins, useGuidance } from '../hooks/useGuidance';
import { useBriefing } from '../hooks/useBriefing';
import { fmtCompact, fmtMoney, fmtNum, fmtPrice } from '../lib/format';
import { Link, navigate } from '../router';
import { readBriefActions } from '../lib/reportData';
import { BackupReminder } from '../components/StatusBanners';
import { MacroCard } from '../components/MacroCard';
import {
  Badge, Banner, Button, Card, CoinIcon, Delta, ErrorNote, InfoTip, PageHeader, SignalBadge, Sparkline, Spinner, Stat,
  TemperatureMeter,
} from '../components/ui';
import { AiProgress, CostHint, NeedKey } from '../components/AiBlocks';
import { Markdown } from '../components/Markdown';
import { fngLabel } from '../api/feargreed';
import { WeeklyCard } from '../components/WeeklyCard';

function greeting(name: string) {
  const h = new Date().getHours();
  const g = h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  return name ? `${g} ${name}` : g;
}

export default function Dashboard() {
  const name = useStore((s) => s.profile.name);
  const currency = useStore((s) => s.settings.currency);
  const qc = useQueryClient();
  const cycle = useCycle();
  const fng = useFearGreed(60);
  const global = useGlobal();
  const markets = useMarkets();
  const alt = useAltSeason();
  const pf = usePortfolio();
  const guidance = useGuidance();
  const briefing = useBriefing();
  const focus = useFocusCoins();
  const scan = useScan(focus, cycle.data?.temperature);
  const [showWhy, setShowWhy] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

  const btc = markets.data?.find((m) => m.id === 'bitcoin');
  const fngNow = fng.data?.[fng.data.length - 1];
  const fngWeek = fng.data?.[fng.data.length - 8];
  const rate = pf.rate;

  const signals = useMemo(() => {
    const rows = focus.map((c) => ({ coin: c, a: scan.data?.get(c.id) ?? null })).filter((r) => r.a);
    return rows.sort((x, y) => (y.a!.investor.score + y.a!.trader.score) - (x.a!.investor.score + x.a!.trader.score));
  }, [focus, scan.data]);

  // Le JSON de l'IA est remis en forme : une réponse mal formée ne peut plus faire planter le Cockpit.
  const briefActionList = readBriefActions(briefing.todays?.data?.actions);
  const briefActions = briefActionList.length ? briefActionList : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={greeting(name)}
        subtitle={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} onClick={() => void qc.invalidateQueries()}>Actualiser</Button>}
      />

      <BackupReminder />

      {markets.error && <ErrorNote error={markets.error} onRetry={() => markets.refetch()} />}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Température du marché — chiffre héros */}
        <Card className="lg:col-span-3" title={<span className="inline-flex items-center gap-2"><Gauge className="size-4 text-accent" />Température du marché <InfoTip>Indice Boussole de 0 à 100 combinant le Fear &amp; Greed, le multiple de Mayer, le prix vs moyenne 200 semaines, le RSI hebdo, le Pi Cycle, le taux de financement, le MVRV et la part des stablecoins. Froid = opportunités, chaud = prudence.</InfoTip></span>}>
          {cycle.isLoading && <Spinner label="Calcul du cycle (historique Bitcoin)…" />}
          {cycle.data && (
            <div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <span className="text-5xl font-semibold leading-none text-ink sm:text-6xl">{Math.round(cycle.data.temperature)}</span>
                <div className="pb-1">
                  <div className="text-lg font-semibold text-ink">{cycle.data.zone.label}</div>
                  <div className="text-xs text-muted">sur 100 · DCA conseillé ×{fmtNum(cycle.data.zone.dcaMultiplier, 2)}</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-2">{cycle.data.zone.action}</p>
              <div className="mt-4"><TemperatureMeter value={cycle.data.temperature} /></div>
              <button type="button" className="mt-3 text-xs font-medium text-accent hover:underline" onClick={() => setShowWhy((v) => !v)}>
                {showWhy ? 'Masquer le détail' : 'Pourquoi ce chiffre ?'}
              </button>
              {showWhy && (
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {cycle.data.components.map((c) => (
                    <li key={c.key} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="text-ink">{c.label}</div>
                        <div className="text-xs text-muted">{c.explain}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum font-medium text-ink">{c.value}</div>
                        <div className="tnum text-xs text-muted">{Math.round(c.heat)}/100</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {cycle.error && <ErrorNote error={cycle.error} />}
        </Card>

        {/* Que faire aujourd'hui : toujours calculé par tes règles ; l'avis de l'IA vient après, séparément. */}
        <Card className="lg:col-span-2" title="Que faire aujourd’hui ?" subtitle="Selon tes règles, ton DCA et le cycle du marché">
          <ul className="space-y-2.5">
            {guidance.map((g) => (
              <li key={g.key}>
                <button type="button" disabled={!g.to} onClick={() => g.to && navigate(g.to)} className="w-full rounded-lg bg-surface-2 p-3 text-left enabled:hover:bg-surface-3">
                  <div className="flex items-start gap-2">
                    <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', g.tone === 'up' && 'bg-good', g.tone === 'down' && 'bg-critical', g.tone === 'warn' && 'bg-warn', g.tone === 'neutral' && 'bg-axis')} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{g.title}</div>
                      <div className="mt-0.5 text-xs text-ink-2">{g.detail}</div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {briefActions && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs font-medium text-ink-2">Avis de l’IA (brief du jour) — à comparer avec ta liste ci-dessus : en cas de désaccord, ce sont tes règles qui font foi.</p>
              <ul className="mt-2 space-y-2">
                {briefActions.slice(0, 5).map((a, i) => (
                  <li key={i} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={/ACHAT|DCA/.test(a.type) ? 'up' : /VENTE|PROFITS/.test(a.type) ? 'down' : 'neutral'}>{a.type || 'AVIS'}</Badge>
                      <span className="text-sm font-medium text-ink">{a.asset}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-2">{a.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <MacroCard />

      {/* Indicateurs clés */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Mon portefeuille" value={fmtMoney(pf.totals.value, currency, 0)} delta={<Delta value={pf.totals.change24hPct} />} hint="24 h" />
        <Stat label="Plus-value latente" value={fmtMoney(pf.totals.unrealized, currency, 0)} delta={<Delta value={pf.totals.unrealizedPct} />} hint="vs investi" />
        <Stat label="Bitcoin" value={btc ? fmtPrice(btc.current_price * rate, currency) : '—'} delta={<Delta value={btc?.price_change_percentage_24h} />} hint="24 h" trend={btc?.sparkline_in_7d ? <Sparkline values={btc.sparkline_in_7d.price} width={110} /> : undefined} />
        <Stat label="Fear & Greed" value={fngNow ? `${fngNow.value} · ${fngLabel(fngNow.value)}` : '—'} hint={fngWeek ? `il y a 7 j : ${fngWeek.value}` : undefined} trend={fng.data ? <Sparkline values={fng.data.slice(-30).map((f) => f.value)} width={110} tone="neutral" /> : undefined} />
        <Stat label="Dominance Bitcoin" value={global.data ? `${fmtNum(global.data.data.market_cap_percentage.btc, 1)} %` : '—'} hint={global.data ? `Capi totale ${fmtCompact(global.data.data.total_market_cap.usd * rate, currency)}` : undefined} />
        <Stat label="Saison des altcoins" value={alt != null ? `${alt}/100` : '—'} hint={alt == null ? undefined : alt >= 75 ? 'Altseason' : alt <= 25 ? 'Saison Bitcoin' : 'Mixte'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Brief IA */}
        <Card className="lg:col-span-3" title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />Brief IA du jour</span>} actions={briefing.todays ? <Link to="/ia" className="text-xs font-medium text-accent hover:underline">Tout lire</Link> : undefined}>
          {!briefing.cfg && <NeedKey />}
          {briefing.cfg && briefing.running && <AiProgress progress={briefing.progress} onCancel={briefing.cancel} />}
          {briefing.cfg && !briefing.running && briefing.error && <Banner tone="warn" title="Le brief n’a pas pu être généré">{briefing.error}</Banner>}
          {briefing.cfg && !briefing.running && briefing.todays && (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <Markdown>{briefing.todays.markdown.split('## 💼')[0]}</Markdown>
              <Link to="/ia" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">Lire le brief complet <ArrowRight className="size-3.5" /></Link>
            </div>
          )}
          {briefing.cfg && !briefing.running && !briefing.todays && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 p-4">
              <div>
                <p className="text-sm font-medium text-ink">Ton analyse quotidienne t’attend</p>
                <p className="text-xs text-muted">Marché, actualités, ton portefeuille, ton DCA : ce qu’il faut faire aujourd’hui.</p>
                <CostHint calls={1} searches={6} />
              </div>
              <Button variant="primary" icon={<Sparkles className="size-4" />} disabled={!briefing.ready} onClick={() => void briefing.generate()}>
                {briefing.ready ? 'Générer le brief' : briefing.loadError ? 'Données indisponibles' : 'Chargement des données…'}
              </Button>
            </div>
          )}
        </Card>

        {/* Signaux de mes cryptos */}
        <Card className="lg:col-span-2" title={<span className="inline-flex items-center gap-2"><TrendingUp className="size-4 text-accent" />Signaux de mes cryptos</span>} subtitle="Watchlist, positions et plans DCA" actions={<Link to="/marche" className="text-xs font-medium text-accent hover:underline">Tous les signaux</Link>}>
          {scan.isLoading && <Spinner label="Analyse technique en cours…" />}
          {scan.error && !scan.data && <ErrorNote error={scan.error} onRetry={() => void scan.refetch()} />}
          <ul className="divide-y divide-line">
            {signals.slice(0, 8).map(({ coin, a }) => (
              <li key={coin.id}>
                <Link to={`/coin/${coin.id}`} className="flex items-center gap-3 py-2.5">
                  <CoinIcon src={coin.image} symbol={coin.symbol} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{coin.name}</div>
                    <div className="text-xs"><Delta value={coin.price_change_percentage_24h} /></div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <SignalBadge label={a!.investor.label} tone={a!.investor.tone} strength={a!.investor.strength} confidence={a!.investor.confidence} limited={a!.investor.limitedBy} compact />
                    <span className="text-[0.65rem] text-muted">Trader : {a!.trader.label}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {!scan.isLoading && !scan.error && !signals.length && <p className="text-sm text-muted">Ajoute des cryptos à ta watchlist (étoile) pour suivre leurs signaux.</p>}
          {!!scan.data?.failed && <p className="mt-2 text-xs text-warn">Données partielles : {scan.data.failed} analyse{scan.data.failed > 1 ? 's' : ''} n’ont pas pu être faites (réseau ou limite de requêtes).</p>}
        </Card>
      </div>

      <WeeklyCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Narratives />
        <TrendingCard />
      </div>
    </div>
  );
}

function Narratives() {
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

function TrendingCard() {
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
