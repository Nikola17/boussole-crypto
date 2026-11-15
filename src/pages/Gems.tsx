import { AlertTriangle, ExternalLink, Gem, Plus, ShieldCheck, Sparkles, Star, Trash2 } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { NarrativesCard, TrendingCard } from '../components/MarketPulse';
import { clsx } from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { CdcBadge } from '../components/CdcBadge';
import { useCryptoCom } from '../hooks/useCryptoCom';
import { useCategories, useDefi, useDexPools, useFx, useMarkets, useSmallCaps, useTrending } from '../hooks/useMarket';
import {
  DEFAULT_POOL_FILTER, DEFAULT_SMALLCAP_FILTER, isDefiCandidate, isSmallCapCandidate, looksLikeNonGem, scoreDefi, scorePool, scoreSmallCap, smallCapInputOf, type GemFlag,
} from '../lib/gems';
import { isStable, isWrappedOrStaked } from '../lib/portfolio';
import { NETWORKS, getTokenPairs, networkByKey, poolLinks, type DexPair, type DexPool } from '../api/dex';
import { scanEvm, scanSolana, type SecurityReport } from '../api/security';
import { walletHoldings } from '../api/smartmoney';
import { emergingCandidates } from '../lib/emerging';
import { getMarkets } from '../api/coingecko';
import { pickPerformance, PICK_CARD_MIN_WEEKS } from '../lib/pickTracking';
import { fmtAge, fmtCompact, fmtNum, fmtPct, fmtPrice } from '../lib/format';
import { openExternal } from '../lib/platform';
import { Link, setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Button, Card, CoinIcon, Delta, ErrorNote, Field, Modal, NumberInput, PageHeader, ScoreBar, Segmented, Spinner, Toggle,
  Table, Td,
} from '../components/ui';
import { AiProgress, NeedKey, ReportView, useAiConfig, useAiRunner } from '../components/AiBlocks';
import { useAiContext } from '../ai/context';
import { runGem } from '../ai/tasks';

type Tab = 'smallcaps' | 'emerging' | 'dex' | 'defi' | 'narratives' | 'suivis' | 'smart' | 'airdrops';

function Flags({ flags }: { flags: GemFlag[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.slice(0, 4).map((f, i) => <Badge key={i} tone={f.tone === 'good' ? 'up' : f.tone === 'bad' ? 'down' : 'warn'}>{f.label}</Badge>)}
    </div>
  );
}

export default function Gems({ initialTab }: { initialTab?: Tab } = {}) {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || initialTab || 'smallcaps';
  const rules = useStore((s) => s.profile.rules);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Détecteur de pépites"
        subtitle="Petites capitalisations prometteuses, tokens on-chain en pleine traction et protocoles DeFi sous-évalués. Plus le potentiel est grand, plus le risque l’est aussi."
      />
      <Banner tone="warn" title={`Règle d’or : ${rules.maxPerGemPct} % maximum par pépite`}>
        La majorité des petites cryptos perdent 80 à 100 % de leur valeur. Une pépite se joue avec de l’argent que tu peux perdre en totalité, une taille de position limitée et un plan de sortie (récupérer ta mise à ×2).
      </Banner>
      <Segmented
        value={tab}
        onChange={(v) => setQuery({ tab: v, cat: null })}
        options={[
          { value: 'smallcaps', label: 'Petites capis' },
          { value: 'emerging', label: 'Émergentes' },
          { value: 'dex', label: 'On-chain (DEX)' },
          { value: 'defi', label: 'DeFi sous-évaluée' },
          { value: 'narratives', label: 'Narratives' },
          { value: 'suivis', label: 'Mes tokens suivis' },
          { value: 'smart', label: 'Smart money' },
          { value: 'airdrops', label: 'Airdrops' },
        ]}
      />
      {tab === 'smallcaps' && <PicksTrackCard />}
      {tab === 'smallcaps' && <SmallCaps />}
      {tab === 'emerging' && <EmergingGems />}
      {tab === 'dex' && <DexGems />}
      {tab === 'defi' && <DefiGems />}
      {tab === 'narratives' && <NarrativesTab />}
      {tab === 'suivis' && <WatchedTokens />}
      {tab === 'smart' && <Suspense fallback={<Spinner />}><Smart embedded /></Suspense>}
      {tab === 'airdrops' && <Suspense fallback={<Spinner />}><Airdrops embedded /></Suspense>}
    </div>
  );
}

const Smart = lazy(() => import('./Smart'));
const Airdrops = lazy(() => import('./Airdrops'));

// ------------------------------------------------------------------ Ce que valaient les scores

/** Suivi en avant : les 10 meilleures pépites et les découvertes du panier de chaque semaine, 30 et 90 jours après. */
function PicksTrackCard() {
  const snaps = useStore((s) => s.pickSnapshots);
  const perf = useMemo(() => pickPerformance(snaps, new Date().toISOString().slice(0, 10)), [snaps]);
  if (perf.weeks < PICK_CARD_MIN_WEEKS) return null;
  const line = (h: string, p: { avgPct: number; vsBtcPts: number; n: number } | null, unknown: number) => p
    ? <li>{h} : en moyenne <span className={p.avgPct >= 0 ? 'text-good' : 'text-critical'}>{fmtPct(p.avgPct)}</span>, soit {fmtNum(p.vsBtcPts)} points {p.vsBtcPts >= 0 ? 'de mieux' : 'de moins'} que Bitcoin ({p.n} relevé{p.n > 1 ? 's' : ''}{unknown ? `, ${unknown} sans prix` : ''}).</li>
    : <li>{h} : pas encore de relevé arrivé à échéance.</li>;
  return (
    <Card title="Ce que valaient les scores" subtitle={`${perf.weeks} semaines de suivi : les 10 meilleures pépites et les découvertes du panier de chaque semaine`}>
      <ul className="space-y-1 text-sm text-ink-2">
        {line('À 30 jours', perf.at30, perf.unknown30)}
        {line('À 90 jours', perf.at90, perf.unknown90)}
      </ul>
      <p className="mt-2 text-xs text-muted">Une crypto sortie du classement CoinGecko n’a plus de prix : elle n’est pas comptée, ce qui flatte un peu le résultat.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Petites capis

function SmallCaps() {
  const currency = useStore((s) => s.settings.currency);
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const markets = useMarkets();
  const small = useSmallCaps(true);
  const trending = useTrending();
  const extraCoins = useMemo(() => small.data ?? [], [small.data]);
  const cdc = useCryptoCom(extraCoins);
  const [onlyCdc, setOnlyCdc] = useState(false);
  const [filter, setFilter] = useState(DEFAULT_SMALLCAP_FILTER);
  const trendingIds = useMemo(() => new Set((trending.data?.coins ?? []).map((c) => c.item.id)), [trending.data]);

  const rows = useMemo(() => {
    const all = [...(markets.data ?? []).slice(100), ...(small.data ?? [])];
    const seen = new Set<string>();
    return all
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .map((m) => ({
        m,
        input: smallCapInputOf(m, trendingIds.has(m.id)),
      }))
      .filter((r) => isSmallCapCandidate(r.input, filter))
      .filter((r) => !onlyCdc || !cdc.ready || cdc.status(r.m.id) !== 'unknown')
      .map((r) => ({ ...r, s: scoreSmallCap(r.input) }))
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, 60);
  }, [markets.data, small.data, filter, trendingIds, onlyCdc, cdc]);

  return (
    <div className="space-y-4">
      <Card title="Filtres" subtitle="Capitalisation en dollars, volume minimum sur 24 h">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Capi min (M$)"><NumberInput value={filter.minCap / 1e6} onChange={(v) => setFilter({ ...filter, minCap: (v || 0) * 1e6 })} /></Field>
          <Field label="Capi max (M$)"><NumberInput value={filter.maxCap / 1e6} onChange={(v) => setFilter({ ...filter, maxCap: (v || 0) * 1e6 })} /></Field>
          <Field label="Volume min (k$)"><NumberInput value={filter.minVolume / 1e3} onChange={(v) => setFilter({ ...filter, minVolume: (v || 0) * 1e3 })} /></Field>
        </div>
        <div className="mt-3"><Toggle checked={onlyCdc} onChange={setOnlyCdc} label="Seulement les cryptos disponibles sur Crypto.com" hint={cdc.ready ? 'Liste publique de Crypto.com Exchange : confirme toujours dans l’application avant d’acheter.' : 'Liste Crypto.com en cours de chargement…'} /></div>
        <p className="mt-3 text-xs text-muted">Score : activité (volume/capi), momentum sain (ni effondrement ni parabole), faible dilution (FDV/capi), taille, rebond depuis l’ATH, tendance de recherche.</p>
      </Card>
      {(small.isLoading || markets.isLoading) && <Spinner label="Analyse de ~1 000 cryptos (CoinGecko)…" />}
      {small.error && <ErrorNote error={small.error} onRetry={() => small.refetch()} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ m, s }) => (
          <div key={m.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <CoinIcon src={m.image} symbol={m.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <Link to={`/coin/${m.id}`} className="block truncate font-medium text-ink hover:underline">{m.name} <span className="text-muted">{m.symbol.toUpperCase()}</span></Link>
                <div className="tnum text-xs text-ink-2">{fmtPrice(m.current_price * rate, currency)} · capi {fmtCompact(m.market_cap * rate, currency)} · #{m.market_cap_rank}</div>
              </div>
              <button type="button" aria-label="Watchlist" onClick={() => toggleWatch(m.id)}><Star className={clsx('size-4', watchlist.includes(m.id) ? 'fill-warn text-warn' : 'text-muted')} /></button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="tnum w-14 text-lg font-semibold text-ink">{s.score}</span>
              <ScoreBar value={s.score} />
            </div>
            <div className="mt-2 flex gap-3 text-xs"><span className="text-muted">7 j</span><Delta value={m.price_change_percentage_7d_in_currency} /><span className="text-muted">30 j</span><Delta value={m.price_change_percentage_30d_in_currency} /></div>
            <div className="mt-2"><Flags flags={s.flags} /></div>
            <div className="mt-2"><CdcBadge status={cdc.status(m.id)} ready={cdc.ready} /></div>
          </div>
        ))}
      </div>
      {!rows.length && !small.isLoading && <p className="text-sm text-muted">Aucune crypto ne correspond aux filtres.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Émergentes (Solana/Base)

function EmergingGems() {
  const wallets = useStore((s) => s.smartWallets);
  const [selected, setSelected] = useState<DexPool | null>(null);
  const pools = useDexPools(['solana', 'base'], true, true);
  const candidates = useMemo(() => emergingCandidates(pools.data ?? []), [pools.data]);
  const mints = useMemo(() => candidates.slice(0, 8).map((c) => c.pool.tokenAddress), [candidates]);

  // « Un wallet suivi y est entré ? » — la seule caution qui compte pour une ligne à quelques heures de vie.
  const walletSig = wallets.map((w) => w.id).join(',') + '|' + mints.join(',');
  const holders = useQuery({
    queryKey: ['sm-holders', walletSig],
    queryFn: async () => {
      const map = new Map<string, string[]>();
      for (const w of wallets.slice(0, 12)) {
        const held = await walletHoldings(w, mints).catch(() => new Set<string>());
        for (const m of held) map.set(m, [...(map.get(m) ?? []), w.label]);
      }
      return map;
    },
    enabled: wallets.length > 0 && mints.length > 0,
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  return (
    <div className="space-y-4">
      <Banner tone="warn" title="Les plus jeunes, donc les plus risquées">
        Des paires de quelques heures à 7 jours, avec assez de liquidité pour sortir, assez de volume pour être
        réelles et une pression acheteuse nette. C'est le terrain des x50 comme des arnaques : le scan de sécurité
        (dans la fiche) est obligatoire avant même d'y penser, et un wallet suivi en position est une piste, pas un feu vert.
      </Banner>
      {pools.isLoading && <Spinner label="Récupération des nouveaux pools Solana/Base…" />}
      {pools.error && <ErrorNote error={pools.error} onRetry={() => pools.refetch()} />}
      <Card padded={false}>
        <Table head={['Token', 'Réseau', 'Âge', 'Traction', 'Volume 24 h', 'Liquidité', '24 h', 'Achats', 'Wallets suivis en position']}>
          {candidates.map((c) => {
            const p = c.pool;
            const total = p.buys24h + p.sells24h;
            const names = holders.data?.get(p.tokenAddress) ?? [];
            const s = scorePool(p);
            return (
              <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(p)}>
                <Td left>
                  <div className="flex items-center gap-2">
                    <CoinIcon src={p.tokenImage} symbol={p.tokenSymbol} size={22} />
                    <span className="max-w-[160px] truncate font-medium text-ink">{p.tokenSymbol}</span>
                    <span className="max-w-[120px] truncate text-xs text-muted">{p.tokenName}</span>
                  </div>
                </Td>
                <Td className="text-ink-2">{networkByKey(p.network)?.label ?? p.network}</Td>
                <Td className="text-ink-2">{fmtAge(p.ageHours)}</Td>
                <Td><span className="font-semibold text-ink">{c.traction}</span><span className="text-xs text-muted"> · risque {s.risk}/100</span></Td>
                <Td>{fmtCompact(p.volume24h, 'USD')}</Td>
                <Td>{fmtCompact(p.liquidityUsd, 'USD')}</Td>
                <Td><Delta value={p.change24h} /></Td>
                <Td className="text-ink-2">{Math.round((p.buys24h / Math.max(1, total)) * 100)} %</Td>
                <Td>{names.length ? <Badge tone="accent">{names.join(', ')}</Badge> : <span className="text-xs text-muted">—</span>}</Td>
              </tr>
            );
          })}
        </Table>
        {!candidates.length && !pools.isLoading && <p className="p-5 text-sm text-muted">Aucune paire émergente ne passe les critères pour le moment (c'est souvent une bonne nouvelle).</p>}
      </Card>
      <PoolModal pool={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ On-chain

function DexGems() {
  const [networks, setNetworks] = useState<string[]>(['solana', 'base', 'eth', 'bsc']);
  const [includeNew, setIncludeNew] = useState(false);
  const [filter, setFilter] = useState(DEFAULT_POOL_FILTER);
  const [selected, setSelected] = useState<DexPool | null>(null);
  const pools = useDexPools(networks, includeNew, true);

  const rows = useMemo(() => (pools.data ?? [])
    .filter((p) => !isWrappedOrStaked(p.tokenSymbol, p.tokenName) && !isStable(p.tokenSymbol) && !looksLikeNonGem(p.tokenName, p.tokenSymbol))
    .filter((p) => p.liquidityUsd >= filter.minLiquidity && p.volume24h >= filter.minVolume && p.ageHours >= filter.minAgeHours && p.ageHours <= filter.maxAgeDays * 24)
    .map((p) => ({ p, s: scorePool(p) }))
    .sort((a, b) => b.s.score - b.s.risk / 3 - (a.s.score - a.s.risk / 3)), [pools.data, filter]);

  return (
    <div className="space-y-4">
      <Card title="Réseaux & filtres" subtitle="Pools tendance sur les DEX (GeckoTerminal), filtrés pour écarter les arnaques les plus grossières">
        <div className="flex flex-wrap gap-2">
          {NETWORKS.map((n) => (
            <button key={n.key} type="button" onClick={() => setNetworks(networks.includes(n.key) ? networks.filter((x) => x !== n.key) : [...networks, n.key])}
              className={clsx('rounded-lg border px-3 py-1.5 text-sm', networks.includes(n.key) ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2')}>
              {n.label}
            </button>
          ))}
          <button type="button" onClick={() => setIncludeNew(!includeNew)} className={clsx('rounded-lg border px-3 py-1.5 text-sm', includeNew ? 'border-warn bg-warn/10 text-ink' : 'border-line text-ink-2')}>
            + Nouveaux pools (très risqué)
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Liquidité min (k$)"><NumberInput value={filter.minLiquidity / 1e3} onChange={(v) => setFilter({ ...filter, minLiquidity: (v || 0) * 1e3 })} /></Field>
          <Field label="Volume 24 h min (k$)"><NumberInput value={filter.minVolume / 1e3} onChange={(v) => setFilter({ ...filter, minVolume: (v || 0) * 1e3 })} /></Field>
          <Field label="Âge min (h)"><NumberInput value={filter.minAgeHours} onChange={(v) => setFilter({ ...filter, minAgeHours: v || 0 })} /></Field>
          <Field label="Âge max (jours)"><NumberInput value={filter.maxAgeDays} onChange={(v) => setFilter({ ...filter, maxAgeDays: v || 1 })} /></Field>
        </div>
      </Card>
      {pools.isLoading && <Spinner label="Récupération des pools on-chain…" />}
      {pools.error && <ErrorNote error={pools.error} onRetry={() => pools.refetch()} />}
      <Card padded={false}>
        <Table head={['Token', 'Réseau', 'Âge', 'Liquidité', 'Volume 24 h', '24 h', 'Acheteurs / vendeurs', 'Potentiel', 'Risque']}>
          {rows.map(({ p, s }) => (
            <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(p)}>
              <Td left>
                <div className="flex items-center gap-2">
                  <CoinIcon src={p.tokenImage} symbol={p.tokenSymbol} size={22} />
                  <span className="max-w-[160px] truncate font-medium text-ink">{p.tokenSymbol}</span>
                  <span className="max-w-[120px] truncate text-xs text-muted">{p.tokenName}</span>
                </div>
              </Td>
              <Td className="text-ink-2">{networkByKey(p.network)?.label ?? p.network}</Td>
              <Td className="text-ink-2">{fmtAge(p.ageHours)}</Td>
              <Td>{fmtCompact(p.liquidityUsd, 'USD')}</Td>
              <Td>{fmtCompact(p.volume24h, 'USD')}</Td>
              <Td><Delta value={p.change24h} /></Td>
              <Td className="text-ink-2">{p.buyers24h ?? '—'} / {p.sellers24h ?? '—'}</Td>
              <Td><span className="font-semibold text-ink">{s.score}</span></Td>
              <Td><Badge tone={s.risk >= 50 ? 'down' : s.risk >= 25 ? 'warn' : 'neutral'}>{s.risk}/100</Badge></Td>
            </tr>
          ))}
        </Table>
        {!rows.length && !pools.isLoading && <p className="p-5 text-sm text-muted">Aucun pool ne passe les filtres pour le moment.</p>}
      </Card>
      <PoolModal pool={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SecurityPanel({ report }: { report: SecurityReport }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink"><ShieldCheck className="size-4" />Scan de sécurité</span>
        <Badge tone={report.verdict === 'Danger' ? 'down' : report.verdict === 'Plutôt sain' ? 'up' : 'warn'}>{report.verdict} · {report.score}/100</Badge>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {report.flags.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden>{f.severity === 'danger' ? '⛔' : f.severity === 'warn' ? '⚠️' : '✅'}</span>
            <span className="text-ink-2">{f.label}{f.detail ? <span className="text-xs text-muted"> — {f.detail}</span> : null}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Sources : {report.sources.join(', ')}. Un scan propre ne garantit pas l’absence d’arnaque.</p>
    </div>
  );
}

function PoolModal({ pool, onClose }: { pool: DexPool | null; onClose: () => void }) {
  const cfg = useAiConfig();
  const ctx = useAiContext();
  const runner = useAiRunner();
  const addWatched = useStore((s) => s.addWatchedToken);
  const reports = useStore((s) => s.reports);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [aiId, setAiId] = useState<string | null>(null);
  if (!pool) return null;
  const s = scorePool(pool);
  const net = networkByKey(pool.network);
  const links = poolLinks(pool);
  const aiReport = aiId ? reports.find((r) => r.id === aiId) : null;

  async function scan() {
    if (!pool) return;
    setScanning(true);
    setScanErr(null);
    try {
      setReport(net?.goplusChainId ? await scanEvm(net.goplusChainId, pool.tokenAddress) : await scanSolana(pool.tokenAddress));
    } catch (e) {
      setScanErr((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <Modal wide open={!!pool} onClose={() => { setReport(null); setAiId(null); onClose(); }} title={`${pool.tokenSymbol} · ${net?.label ?? pool.network}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted">Prix</div><div className="tnum font-medium text-ink">{fmtPrice(pool.priceUsd, 'USD')}</div></div>
          <div><div className="text-xs text-muted">Valorisation (FDV)</div><div className="tnum font-medium text-ink">{fmtCompact(pool.fdvUsd, 'USD')}</div></div>
          <div><div className="text-xs text-muted">Liquidité</div><div className="tnum font-medium text-ink">{fmtCompact(pool.liquidityUsd, 'USD')}</div></div>
          <div><div className="text-xs text-muted">Âge du pool</div><div className="font-medium text-ink">{fmtAge(pool.ageHours)}</div></div>
          <div><div className="text-xs text-muted">Volume 24 h</div><div className="tnum font-medium text-ink">{fmtCompact(pool.volume24h, 'USD')}</div></div>
          <div><div className="text-xs text-muted">Variation 1 h / 24 h</div><div className="flex gap-2"><Delta value={pool.change1h} /><Delta value={pool.change24h} /></div></div>
          <div><div className="text-xs text-muted">Achats / ventes 24 h</div><div className="tnum font-medium text-ink">{pool.buys24h} / {pool.sells24h}</div></div>
          <div><div className="text-xs text-muted">Potentiel / risque</div><div className="font-medium text-ink">{s.score} / {s.risk}</div></div>
        </div>
        <Flags flags={s.flags} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<ShieldCheck className="size-4" />} loading={scanning} onClick={() => void scan()}>Scanner la sécurité</Button>
          <Button icon={<Star className="size-4" />} onClick={() => addWatched({ id: `${pool.network}:${pool.tokenAddress}`, chainId: net?.dexscreener ?? pool.network, address: pool.tokenAddress, symbol: pool.tokenSymbol, name: pool.tokenName, image: pool.tokenImage, addedAt: new Date().toISOString(), priceAtAdd: pool.priceUsd })}>Suivre ce token</Button>
          <Button icon={<ExternalLink className="size-4" />} onClick={() => openExternal(links.dexscreener)}>DexScreener</Button>
          <Button icon={<ExternalLink className="size-4" />} onClick={() => openExternal(links.geckoterminal)}>GeckoTerminal</Button>
        </div>
        {scanErr && <Banner tone="warn">{scanErr}</Banner>}
        {report && <SecurityPanel report={report} />}
        <div className="border-t border-line pt-4">
          {!cfg ? <NeedKey compact /> : (
            <Button icon={<Sparkles className="size-4" />} disabled={runner.running} onClick={() => void runner.run((onP, signal) => runGem(cfg, `${pool.tokenSymbol} (${pool.tokenName}) sur ${net?.label}, contrat ${pool.tokenAddress}`, {
              token: { ...pool, scorePotentiel: s.score, scoreRisque: s.risk, signaux: s.flags.map((f) => f.label) },
              security: report ?? 'non scanné',
              profile: ctx.profile(),
            }, onP, signal)).then((r) => r && setAiId(r.id))}>Avis de l’IA sur ce token</Button>
          )}
          {runner.running && <div className="mt-3"><AiProgress progress={runner.progress} onCancel={runner.cancel} /></div>}
          {runner.error && <div className="mt-3"><Banner tone="warn">{runner.error}</Banner></div>}
          {aiReport && <div className="mt-3"><ReportView report={aiReport} /></div>}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />N’achète jamais un token depuis un lien reçu en message privé. Vérifie l’adresse du contrat sur DexScreener et utilise un wallet dédié aux paris spéculatifs.</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ DeFi

function DefiGems() {
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const [enabled, setEnabled] = useState(false);
  const defi = useDefi(enabled);
  const [maxCap, setMaxCap] = useState<number | ''>(1000);

  const rows = useMemo(() => {
    if (!defi.data) return [];
    const { protocols, fees, revenue } = defi.data;
    return protocols
      .filter((p) => (p.mcap ?? 0) > 3e6 && (p.mcap ?? 0) <= (Number(maxCap) || 1000) * 1e6 && (p.tvl ?? 0) >= 3e6 && p.symbol && p.symbol !== '-' && isDefiCandidate(p.category))
      .map((p) => {
        const f = fees.get(p.id);
        const r = revenue.get(p.id);
        const s = scoreDefi({ name: p.name, symbol: p.symbol ?? '', category: p.category, tvl: p.tvl ?? 0, mcap: p.mcap ?? 0, change7d: p.change_7d, change1d: p.change_1d, fees30d: f?.total30d ?? null, revenue30d: r?.total30d ?? null, chains: p.chains });
        return { p, s, revenue30d: r?.total30d ?? null };
      })
      .sort((a, b) => b.s.score - a.s.score)
      .slice(0, 50);
  }, [defi.data, maxCap]);

  if (!enabled) {
    return (
      <Card title="Protocoles DeFi sous-évalués" subtitle="Compare la capitalisation de chaque protocole à sa TVL (valeur déposée) et aux frais qu’il génère — l’équivalent crypto du PER.">
        <p className="mb-3 text-sm text-ink-2">Les données DefiLlama pèsent environ 15 Mo : elles ne sont chargées qu’à ta demande (évite les données mobiles).</p>
        <Button variant="primary" icon={<Gem className="size-4" />} onClick={() => setEnabled(true)}>Charger l’analyse DeFi</Button>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card title="Filtres">
        <Field label="Capitalisation max (M$)" className="max-w-xs"><NumberInput value={maxCap} onChange={setMaxCap} /></Field>
        <p className="mt-2 text-xs text-muted">Score : capitalisation / TVL (30 %), croissance de la TVL sur 7 jours (25 %), capitalisation / revenus annualisés du protocole (45 %, l’équivalent d’un PER). * = calculé sur les frais faute de revenus publiés. Les catégories où la TVL ne reflète pas la valeur du token (liquid staking, RWA, ponts…) sont exclues.</p>
      </Card>
      {defi.isLoading && <Spinner label="Chargement des ~9 000 protocoles DefiLlama…" />}
      {defi.error && <ErrorNote error={defi.error} onRetry={() => defi.refetch()} />}
      <Card padded={false}>
        <Table head={['Protocole', 'Catégorie', 'TVL', 'Capi', 'Capi/TVL', 'TVL 7 j', 'Revenus 30 j', 'Capi/revenus', 'Score']}>
          {rows.map(({ p, s, revenue30d }) => (
            <tr key={p.id} className="hover:bg-surface-2">
              <Td left>
                <button type="button" className="flex items-center gap-2 text-left" onClick={() => (p.gecko_id ? (window.location.hash = `/coin/${p.gecko_id}`) : p.url && openExternal(p.url))}>
                  <CoinIcon src={p.logo} symbol={p.symbol ?? p.name} size={22} />
                  <span className="max-w-[180px] truncate font-medium text-ink">{p.name}</span>
                  <span className="text-xs text-muted">{p.symbol}</span>
                </button>
              </Td>
              <Td className="text-ink-2">{p.category}</Td>
              <Td>{fmtCompact((p.tvl ?? 0) * rate, currency)}</Td>
              <Td>{fmtCompact((p.mcap ?? 0) * rate, currency)}</Td>
              <Td>{Number.isFinite(s.mcapTvl) ? fmtNum(s.mcapTvl, 2) : '—'}</Td>
              <Td><Delta value={p.change_7d} /></Td>
              <Td>{revenue30d ? fmtCompact(revenue30d * rate, currency) : '—'}</Td>
              <Td>{s.ps != null ? `${fmtNum(s.ps, 1)}${s.psBasis === 'frais' ? '*' : ''}` : '—'}</Td>
              <Td><span className="font-semibold text-ink">{s.score}</span></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Narratives

function NarrativesTab() {
  const { query } = useHashPath();
  const cats = useCategories();
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const selected = query.get('cat');
  const list = useMemo(() => (cats.data ?? []).filter((c) => (c.market_cap ?? 0) > 1e8 && c.market_cap_change_24h != null).sort((a, b) => (b.market_cap_change_24h ?? 0) - (a.market_cap_change_24h ?? 0)), [cats.data]);
  const coins = useQuery({ queryKey: ['category', selected], queryFn: () => getMarkets({ category: selected!, perPage: 30 }), enabled: !!selected, staleTime: 10 * 60_000 });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2"><NarrativesCard /><TrendingCard /></div>
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Secteurs" subtitle="Variation de capitalisation sur 24 h">
        {cats.isLoading && <Spinner />}
        <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setQuery({ cat: c.id })} className={clsx('flex w-full items-center justify-between gap-3 px-2 py-2 text-left text-sm hover:bg-surface-2', selected === c.id && 'bg-surface-2')}>
                <span className="min-w-0 truncate text-ink">{c.name}</span>
                <span className="flex items-center gap-3"><span className="text-xs text-muted">{fmtCompact((c.market_cap ?? 0) * rate, currency)}</span><Delta value={c.market_cap_change_24h} /></span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="lg:col-span-3" title={selected ? list.find((c) => c.id === selected)?.name ?? 'Secteur' : 'Choisis un secteur'} subtitle="Les principales cryptos de la narrative">
        {!selected && <p className="text-sm text-muted">Les narratives (IA, RWA, DePIN, memecoins, L2…) tournent : repérer tôt celle qui attire les capitaux est un avantage.</p>}
        {coins.isLoading && <Spinner />}
        <ul className="divide-y divide-line">
          {(coins.data ?? []).map((m) => (
            <li key={m.id}>
              <Link to={`/coin/${m.id}`} className="flex items-center gap-3 py-2">
                <CoinIcon src={m.image} symbol={m.symbol} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.name} <span className="text-muted">{m.symbol.toUpperCase()}</span></span>
                <span className="text-xs text-muted">{fmtCompact(m.market_cap * rate, currency)}</span>
                <Delta value={m.price_change_percentage_7d_in_currency} className="w-20 justify-end text-xs" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tokens suivis (on-chain)

function WatchedTokens() {
  const tokens = useStore((s) => s.watchedTokens);
  const remove = useStore((s) => s.removeWatchedToken);
  const add = useStore((s) => s.addWatchedToken);
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState('solana');
  const [address, setAddress] = useState('');
  const byChain = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of tokens) m.set(t.chainId, [...(m.get(t.chainId) ?? []), t.address]);
    return m;
  }, [tokens]);
  const prices = useQuery({
    queryKey: ['watched-tokens', tokens.map((t) => t.id).join(',')],
    enabled: tokens.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const out = new Map<string, DexPair>();
      for (const [c, addrs] of byChain) {
        const r = await getTokenPairs(c, addrs);
        for (const [k, v] of r) out.set(`${c}:${k}`, v);
      }
      return out;
    },
  });

  async function addByAddress() {
    const a = address.trim();
    if (!a) return;
    const r = await getTokenPairs(chain, [a]).catch(() => new Map());
    const p = r.get(a.toLowerCase());
    add({ id: `${chain}:${a}`, chainId: chain, address: a, symbol: p?.baseToken.symbol ?? a.slice(0, 6), name: p?.baseToken.name ?? 'Token', image: p?.info?.imageUrl, addedAt: new Date().toISOString(), priceAtAdd: p?.priceUsd ? Number(p.priceUsd) : undefined });
    setOpen(false);
    setAddress('');
  }

  return (
    <Card title="Mes tokens on-chain suivis" subtitle="Prix en direct depuis DexScreener" actions={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Ajouter</Button>}>
      {!tokens.length && <p className="text-sm text-muted">Suis un token depuis l’onglet On-chain ou ajoute une adresse de contrat.</p>}
      <ul className="divide-y divide-line">
        {tokens.map((t) => {
          const p = prices.data?.get(`${t.chainId}:${t.address.toLowerCase()}`);
          const price = p?.priceUsd ? Number(p.priceUsd) : null;
          const perf = price != null && t.priceAtAdd ? (price / t.priceAtAdd - 1) * 100 : null;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <CoinIcon src={t.image} symbol={t.symbol} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{t.symbol} <span className="text-xs text-muted">{t.chainId}</span></div>
                <div className="text-xs text-muted">Liquidité {fmtCompact(p?.liquidity?.usd ?? null, 'USD')} · 24 h <Delta value={p?.priceChange?.h24 ?? null} /></div>
              </div>
              <div className="text-right">
                <div className="tnum text-sm text-ink">{fmtPrice(price, 'USD')}</div>
                <div className="text-xs">{perf != null ? <>depuis l’ajout <span className={perf >= 0 ? 'text-up' : 'text-down'}>{fmtPct(perf, 0)}</span></> : '—'}</div>
              </div>
              {p?.url && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} aria-label="Ouvrir" onClick={() => openExternal(p.url)} />}
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Retirer" onClick={() => remove(t.id)} />
            </li>
          );
        })}
      </ul>
      <Modal open={open} onClose={() => setOpen(false)} title="Suivre un token par son contrat" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" onClick={() => void addByAddress()}>Ajouter</Button></>}>
        <div className="space-y-3">
          <Field label="Réseau">
            <select className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink" value={chain} onChange={(e) => setChain(e.target.value)}>
              {NETWORKS.map((n) => <option key={n.key} value={n.dexscreener}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="Adresse du contrat"><input className="h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… ou adresse Solana" /></Field>
        </div>
      </Modal>
    </Card>
  );
}
