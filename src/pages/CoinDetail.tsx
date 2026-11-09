import {
  ArrowLeft, Bell, BookOpenCheck, CandlestickChart, CheckCircle2, CircleAlert, ExternalLink, MinusCircle, Plus, Repeat,
  Sparkles, Star, Users, XCircle, Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { useCoin, useCoinCandles, useCycle, useFx, useMarkets } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { analyze, type Factor, type SignalResult } from '../lib/signals';
import { bucketOf } from '../lib/portfolio';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtQty } from '../lib/format';
import { openExternal } from '../lib/platform';
import { navigate } from '../router';
import type { Interval } from '../api/binance';
import {
  Badge, Banner, Button, Card, CoinIcon, Delta, ErrorNote, InfoTip, PageHeader, Segmented, SignalBadge, Spinner, Stars,
} from '../components/ui';
import { PriceChart, type ChartLevel } from '../components/PriceChart';
import { AlertModal, DcaPlanModal, ThesisModal, TradeModal, TransactionModal } from '../components/forms';
import { CdcBadge } from '../components/CdcBadge';
import { CriteriaCard } from '../components/CriteriaCard';
import { useCryptoCom } from '../hooks/useCryptoCom';
import { AiProgress, CostHint, NeedKey, ReportView, useAiConfig, useAiRunner } from '../components/AiBlocks';
import { summarizeAnalysis, useAiContext } from '../ai/context';
import { runCommittee, runPulse, runQuick, runThesisCheck } from '../ai/tasks';
import type { CoinRef } from '../types';

function VoteIcon({ vote }: { vote: number }) {
  if (vote >= 1) return <CheckCircle2 className="size-4 shrink-0 text-up" aria-label="Favorable" />;
  if (vote <= -1) return <XCircle className="size-4 shrink-0 text-down" aria-label="Défavorable" />;
  return <MinusCircle className="size-4 shrink-0 text-muted" aria-label="Neutre" />;
}

function SignalCard({ title, help, result }: { title: string; help: string; result: SignalResult }) {
  return (
    <Card title={<span className="inline-flex items-center gap-1">{title}<InfoTip>{help}</InfoTip></span>} actions={<SignalBadge label={result.label} tone={result.tone} strength={result.strength} score={result.score} />}>
      <p className="mb-2 text-xs text-muted">Score {result.score > 0 ? '+' : ''}{result.score} sur ±100 · confiance {result.confidence}</p>
      <ul className="space-y-2.5">
        {result.factors.map((f: Factor) => (
          <li key={f.key} className="flex gap-2.5">
            <VoteIcon vote={f.vote} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{f.label}</div>
              <div className="text-xs text-ink-2">{f.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function CoinDetail({ id }: { id: string }) {
  const currency = useStore((s) => s.settings.currency);
  const theme = useStore((s) => s.settings.theme);
  const watchlist = useStore((s) => s.watchlist);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const cdcSeen = useStore((s) => s.cdcSeen);
  const toggleCdcSeen = useStore((s) => s.toggleCdcSeen);
  const profile = useStore((s) => s.profile);
  const reports = useStore((s) => s.reports);
  const removeReport = useStore((s) => s.removeReport);
  const theses = useStore((s) => s.theses);
  const upsertThesis = useStore((s) => s.upsertThesis);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const markets = useMarkets();
  const coinQ = useCoin(id);
  const cycle = useCycle();
  const pf = usePortfolio();
  const ctx = useAiContext();
  const cfg = useAiConfig();
  const runner = useAiRunner();
  const [tf, setTf] = useState<Interval>('1d');
  const [modal, setModal] = useState<null | 'tx' | 'dca' | 'alert' | 'trade' | 'thesis'>(null);

  const m = markets.data?.find((x) => x.id === id);
  const c = coinQ.data;
  const priceUsd = m?.current_price ?? c?.market_data.current_price.usd ?? 0;
  const symbol = (m?.symbol ?? c?.symbol ?? '').toUpperCase();
  const name = m?.name ?? c?.name ?? id;
  const selfCoin = useMemo(() => [{ id, symbol: symbol.toLowerCase(), market_cap_rank: m?.market_cap_rank ?? c?.market_cap_rank ?? null }], [id, symbol, m?.market_cap_rank, c?.market_cap_rank]);
  const cdc = useCryptoCom(selfCoin);
  const image = m?.image ?? c?.image.large;
  const coinRef: CoinRef = { coinId: id, symbol: symbol.toLowerCase(), name, image };
  const athChange = m?.ath_change_percentage ?? c?.market_data.ath_change_percentage.usd;

  const candlesQ = useCoinCandles(priceUsd ? { id, symbol: symbol.toLowerCase(), priceUsd } : null, tf);
  const dailyQ = useCoinCandles(priceUsd ? { id, symbol: symbol.toLowerCase(), priceUsd } : null, '1d');
  const analysis = useMemo(() => (dailyQ.data?.candles.length ? analyze(dailyQ.data.candles, { temperature: cycle.data?.temperature, athChangePct: athChange }) : null), [dailyQ.data, cycle.data, athChange]);

  const levels: ChartLevel[] = useMemo(() => {
    if (!analysis?.plan) return [];
    const out: ChartLevel[] = [];
    if (analysis.plan.support) out.push({ price: analysis.plan.support, label: 'Support', tone: 'up' });
    if (analysis.plan.resistance) out.push({ price: analysis.plan.resistance, label: 'Résistance', tone: 'down' });
    return out;
  }, [analysis]);

  // L'IA ne doit travailler que sur des données complètes (sinon une position peut apparaître à 0 €).
  const dataReady = !!markets.data && !!analysis && !!cycle.data && !pf.loading;
  // Toutes les lignes de cette crypto (journal et wallets), regroupées en une seule position.
  const holding = useMemo(() => {
    const rows = pf.holdings.filter((h) => h.coinId === id);
    if (!rows.length) return null;
    const withCost = rows.filter((h) => h.cost != null && h.pnl != null);
    const cost = withCost.reduce((s, h) => s + (h.cost ?? 0), 0);
    const pnl = withCost.reduce((s, h) => s + (h.pnl ?? 0), 0);
    return {
      quantity: rows.reduce((s, h) => s + h.quantity, 0),
      value: rows.reduce((s, h) => s + h.value, 0),
      pnlPct: cost > 0 ? (pnl / cost) * 100 : undefined,
    };
  }, [pf.holdings, id]);
  const thesis = theses.find((t) => t.coinId === id) ?? null;
  const coinReports = reports.filter((r) => r.coinId === id);
  const bucket = bucketOf(id, symbol, m?.market_cap_rank ?? c?.market_cap_rank);
  const maxPct = bucket === 'small' ? profile.rules.maxPerGemPct : bucket === 'btc' || bucket === 'eth' ? 100 : profile.rules.maxPerAltPct;
  const portfolioValue = pf.totals.value;
  const maxPosition = portfolioValue > 0 ? (portfolioValue * maxPct) / 100 : (profile.capital * maxPct) / 100;
  const riskSized = analysis?.plan ? ((portfolioValue || profile.capital) * profile.rules.riskPerTradePct) / 100 / ((analysis.plan.entry - analysis.plan.stop) / analysis.plan.entry) : null;

  const coinCtx = () => ({
    nom: name,
    symbole: symbol,
    rang: m?.market_cap_rank ?? c?.market_cap_rank ?? null,
    prixUsd: priceUsd,
    capitalisationUsd: m?.market_cap ?? c?.market_data.market_cap.usd ?? null,
    fdvUsd: m?.fully_diluted_valuation ?? c?.market_data.fully_diluted_valuation.usd ?? null,
    volume24hUsd: m?.total_volume ?? c?.market_data.total_volume.usd ?? null,
    offreCirculante: m?.circulating_supply ?? c?.market_data.circulating_supply ?? null,
    offreTotale: m?.total_supply ?? c?.market_data.total_supply ?? null,
    offreMax: m?.max_supply ?? c?.market_data.max_supply ?? null,
    plusHautHistoriqueUsd: m?.ath ?? c?.market_data.ath.usd ?? null,
    distanceAthPct: athChange ?? null,
    variation24hPct: m?.price_change_percentage_24h ?? c?.market_data.price_change_percentage_24h ?? null,
    variation7jPct: m?.price_change_percentage_7d_in_currency ?? c?.market_data.price_change_percentage_7d ?? null,
    variation30jPct: m?.price_change_percentage_30d_in_currency ?? c?.market_data.price_change_percentage_30d ?? null,
    variation200jPct: m?.price_change_percentage_200d_in_currency ?? null,
    variation1anPct: m?.price_change_percentage_1y_in_currency ?? c?.market_data.price_change_percentage_1y ?? null,
    categories: c?.categories ?? [],
    siteWeb: c?.links.homepage?.[0] ?? null,
    description: (c?.description.fr || c?.description.en || '').replace(/<[^>]+>/g, '').slice(0, 600),
    positionUtilisateur: holding ? { quantite: holding.quantity, valeur: Math.round(holding.value), plusValuePct: holding.pnlPct ?? null } : null,
  });
  const techCtx = () => ({ ...summarizeAnalysis(analysis), facteursInvestisseur: analysis?.investor.factors.map((f) => f.detail), facteursTrader: analysis?.trader.factors.map((f) => f.detail) });
  const label = `${name} (${symbol})`;

  const run = (kind: 'quick' | 'committee' | 'pulse' | 'thesis') => {
    if (!cfg) return;
    void runner.run(async (onP, signal) => {
      const base = { coin: coinCtx(), technical: techCtx(), market: ctx.market(), portfolio: ctx.portfolio(), profile: ctx.profile() };
      if (kind === 'committee') return runCommittee(cfg, label, id, base, onP, signal);
      if (kind === 'pulse') {
        const move = `${fmtPct(m?.price_change_percentage_24h ?? 0)} sur 24 h, ${fmtPct(m?.price_change_percentage_7d_in_currency ?? 0)} sur 7 jours`;
        return runPulse(cfg, label, id, move, { coin: base.coin, market: base.market }, onP, signal);
      }
      if (kind === 'thesis' && thesis) {
        const report = await runThesisCheck(cfg, label, id, { thesis: { phrases: thesis.sentences, hypotheses: thesis.hypotheses.map((h) => h.label), lignesRouges: thesis.redLines, prixDeReference: thesis.buyPrice }, coin: base.coin, technical: base.technical }, onP, signal);
        const statuses = (report.data?.statuses as string[] | undefined) ?? [];
        upsertThesis({
          ...thesis,
          hypotheses: thesis.hypotheses.map((h, i) => ({ ...h, status: (['ok', 'weak', 'broken', 'dead'].includes(statuses[i]) ? statuses[i] : h.status) as typeof h.status })),
          lastCheck: { date: new Date().toISOString(), verdict: String(report.data?.verdict ?? 'vérifiée'), reportId: report.id },
        });
        return report;
      }
      return runQuick(cfg, label, id, base, onP, signal);
    });
  };

  if (coinQ.isLoading && !m) return <Spinner label="Chargement…" />;
  if (!m && !c) return <div className="space-y-4"><Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => history.back()}>Retour</Button><ErrorNote error={coinQ.error ?? new Error('Crypto introuvable.')} /></div>;

  const md = c?.market_data;
  const mcap = m?.market_cap ?? md?.market_cap.usd ?? 0;
  const fdv = m?.fully_diluted_valuation ?? md?.fully_diluted_valuation.usd ?? null;
  const circ = m?.circulating_supply ?? md?.circulating_supply ?? null;
  const maxS = m?.max_supply ?? md?.max_supply ?? m?.total_supply ?? md?.total_supply ?? null;
  const desc = (c?.description.fr || c?.description.en || '').replace(/<[^>]+>/g, '');

  return (
    <div className="space-y-4 sm:space-y-6">
      <button type="button" onClick={() => history.back()} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Retour</button>
      <PageHeader
        title={<span className="flex items-center gap-3"><CoinIcon src={image} symbol={symbol} size={36} />{name}<span className="text-base font-normal text-muted">{symbol}</span>{(m?.market_cap_rank ?? c?.market_cap_rank) && <Badge>#{m?.market_cap_rank ?? c?.market_cap_rank}</Badge>}<CdcBadge status={cdc.status(id)} ready={cdc.ready} /></span>}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-2xl font-semibold text-ink">{fmtPrice(priceUsd * rate, currency)}</span><Delta value={m?.price_change_percentage_24h ?? md?.price_change_percentage_24h} suffix="24 h" /><Delta value={m?.price_change_percentage_7d_in_currency ?? md?.price_change_percentage_7d} suffix="7 j" /></span>}
        actions={
          <>
            <Button size="sm" icon={<Star className={clsx('size-4', watchlist.includes(id) && 'fill-warn text-warn')} />} onClick={() => toggleWatch(id)}>{watchlist.includes(id) ? 'Suivie' : 'Suivre'}</Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setModal('tx')}>Transaction</Button>
            <Button size="sm" icon={<Repeat className="size-4" />} onClick={() => setModal('dca')}>Plan DCA</Button>
            <Button size="sm" icon={<Bell className="size-4" />} onClick={() => setModal('alert')}>Alerte</Button>
            <Button size="sm" icon={<CandlestickChart className="size-4" />} onClick={() => setModal('trade')}>Trade</Button>
          </>
        }
      />

      <label className="-mt-2 flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={cdcSeen.includes(id)} onChange={() => toggleCdcSeen(id)} className="size-4 accent-[var(--accent)]" />
        Je la vois dans l’application Crypto.com (confirmation manuelle, prioritaire sur la liste publique)
      </label>

      <Card title="Graphique" actions={<Segmented value={tf} onChange={setTf} options={[{ value: '4h', label: '4 h' }, { value: '1d', label: '1 jour' }, { value: '1w', label: '1 semaine' }]} />}>
        {candlesQ.isLoading && <Spinner label="Chargement des bougies…" />}
        {candlesQ.data && candlesQ.data.candles.length > 1 && <PriceChart candles={candlesQ.data.candles} levels={levels} themeKey={theme} height={440} />}
        {candlesQ.data && candlesQ.data.candles.length <= 1 && <p className="text-sm text-muted">Pas de bougies disponibles sur cette période pour cette crypto (paire absente de Binance).</p>}
        <p className="mt-2 text-xs text-muted">Prix en dollars · source {candlesQ.data?.source === 'binance' ? `Binance (${candlesQ.data.symbol})` : 'CoinGecko'} · lignes : MM50 (jaune), MM200 (violet), volume, RSI 14.</p>
      </Card>

      {analysis ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SignalCard title="Signal investisseur" help="Horizon de plusieurs mois : tendance de fond, valorisation par rapport à la moyenne 200 jours, cycle de marché. Sert à décider quand accumuler ou prendre des profits." result={analysis.investor} />
          <SignalCard title="Signal trader" help="Horizon de quelques jours à quelques semaines : momentum, excès, cassures. Sert au timing d’une entrée ou d’une sortie." result={analysis.trader} />
        </div>
      ) : dailyQ.isLoading ? <Spinner label="Calcul des signaux…" /> : <Banner tone="info">Pas assez d’historique pour calculer des signaux fiables sur cette crypto.</Banner>}

      {analysis && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Plan d’action technique" subtitle="Niveaux calculés automatiquement (ATR, supports, moyennes). À adapter à ton analyse.">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {analysis.accumulation && (
                <div className="col-span-2 rounded-lg bg-surface-2 p-3">
                  <div className="text-xs text-muted">Zone d’accumulation long terme (autour de la MM200)</div>
                  <div className="tnum font-medium text-ink">{fmtPrice(analysis.accumulation.low * rate, currency)} – {fmtPrice(analysis.accumulation.high * rate, currency)}</div>
                  <div className="text-xs text-ink-2">{analysis.price <= analysis.accumulation.high ? 'Le prix est dans ou sous la zone : DCA renforcé pertinent si la thèse tient.' : `Le prix est ${fmtPct(((analysis.price / analysis.accumulation.high) - 1) * 100)} au-dessus de la zone.`}</div>
                </div>
              )}
              {analysis.plan && (
                <>
                  <div><div className="text-xs text-muted">Entrée (cours actuel)</div><div className="tnum font-medium text-ink">{fmtPrice(analysis.plan.entry * rate, currency)}</div></div>
                  <div><div className="text-xs text-muted">Stop suggéré</div><div className="tnum font-medium text-down">{fmtPrice(analysis.plan.stop * rate, currency)} <span className="text-xs text-muted">(−{fmtNum(analysis.plan.riskPct, 1)} %)</span></div></div>
                  <div><div className="text-xs text-muted">Objectif 1 (1,5 R)</div><div className="tnum font-medium text-up">{fmtPrice(analysis.plan.tp1 * rate, currency)}</div></div>
                  <div><div className="text-xs text-muted">Objectif 2 (3 R)</div><div className="tnum font-medium text-up">{fmtPrice(analysis.plan.tp2 * rate, currency)}</div></div>
                </>
              )}
              {analysis.profitZone && <div className="col-span-2 text-xs text-ink-2">Zone de prises de profits historique (multiple de Mayer ≥ 2) : au-dessus de <span className="tnum font-medium text-ink">{fmtPrice(analysis.profitZone * rate, currency)}</span>.</div>}
            </div>
          </Card>
          <Card title="Pour toi" subtitle={`Profil ${profile.archetype} · poche « ${bucket === 'small' ? 'petites capis & pépites' : bucket === 'btc' || bucket === 'eth' ? 'cœur' : 'altcoins'} »`}>
            <ul className="space-y-2.5 text-sm text-ink-2">
              <li>Taille maximale conseillée : <span className="font-medium text-ink">{maxPct >= 100 ? 'pas de limite stricte (actif cœur)' : `${maxPct} % du portefeuille ≈ ${fmtMoney(maxPosition, currency, 0)}`}</span>.</li>
              {riskSized != null && Number.isFinite(riskSized) && (
                <li>Pour un trade avec le stop suggéré, risquer {profile.rules.riskPerTradePct} % de ton capital = position de <span className="font-medium text-ink">{fmtMoney(Math.min(riskSized, maxPosition || riskSized), currency, 0)}</span>.</li>
              )}
              {holding && (
                <li>Ta position : {fmtQty(holding.quantity)} {symbol} = <span className="font-medium text-ink">{fmtMoney(holding.value, currency, 0)}</span> {holding.pnlPct != null && <>(<Delta value={holding.pnlPct} />)</>} · {portfolioValue > 0 ? `${fmtNum((holding.value / portfolioValue) * 100, 1)} % du portefeuille` : ''}</li>
              )}
              {(m?.price_change_percentage_7d_in_currency ?? 0) > 50 && <li><Banner tone="warn">+{Math.round(m!.price_change_percentage_7d_in_currency!)} % en 7 jours : risque de FOMO. Attends un repli ou réduis la taille.</Banner></li>}
              <li className="flex flex-wrap gap-2 pt-1">
                {thesis ? (
                  <Badge tone="accent" icon={<BookOpenCheck className="size-3.5" />}>Thèse écrite{thesis.lastCheck ? ` · ${thesis.lastCheck.verdict}` : ''}</Badge>
                ) : <Badge tone="warn">Pas encore de thèse écrite</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setModal('thesis')}>{thesis ? 'Modifier ma thèse' : 'Écrire ma thèse'}</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate('/guide?tab=checklist')}>Checklist avant achat</Button>
              </li>
            </ul>
          </Card>
        </div>
      )}

      <CriteriaCard coinId={id} symbol={symbol} market={m} coin={c} />

      <Card title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />Analyse IA</span>} subtitle="Méthode des 4 sages : produit (Duan Yongping), valorisation (Buffett), inversion (Munger), risques (Li Lu).">
        {!cfg ? <NeedKey compact /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Zap className="size-4" />} disabled={runner.running || !dataReady} onClick={() => run('quick')}>Analyse rapide</Button>
              <Button icon={<Users className="size-4" />} disabled={runner.running || !dataReady} onClick={() => run('committee')}>Comité des 4 sages</Button>
              <Button icon={<CircleAlert className="size-4" />} disabled={runner.running || !dataReady} onClick={() => run('pulse')}>Pourquoi ça bouge ?</Button>
              {thesis && <Button icon={<BookOpenCheck className="size-4" />} disabled={runner.running || !dataReady} onClick={() => run('thesis')}>Vérifier ma thèse</Button>}
            </div>
            {!dataReady && <p className="text-xs text-muted">Chargement des données de marché et de ton portefeuille… les analyses seront disponibles dans un instant.</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-xs text-muted">Rapide : <CostHint calls={1} searches={4} /></span>
              <span className="text-xs text-muted">Comité : <CostHint calls={5} searches={16} /></span>
            </div>
            {runner.running && <AiProgress progress={runner.progress} onCancel={runner.cancel} />}
            {runner.error && <Banner tone="warn" title="Analyse impossible">{runner.error}</Banner>}
          </div>
        )}
      </Card>

      {coinReports.map((r) => <ReportView key={r.id} report={r} onDelete={() => removeReport(r.id)} />)}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Fondamentaux" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Capitalisation</dt><dd className="tnum font-medium text-ink">{fmtCompact(mcap * rate, currency)}</dd></div>
            <div><dt className="text-xs text-muted">FDV <InfoTip>Valorisation si toute l’offre était en circulation. Un FDV très supérieur à la capitalisation signale des déblocages à venir (pression vendeuse).</InfoTip></dt><dd className="tnum font-medium text-ink">{fdv ? `${fmtCompact(fdv * rate, currency)} (${fmtNum(fdv / (mcap || 1), 1)}×)` : '—'}</dd></div>
            <div><dt className="text-xs text-muted">Volume 24 h</dt><dd className="tnum font-medium text-ink">{fmtCompact((m?.total_volume ?? md?.total_volume.usd ?? 0) * rate, currency)}</dd></div>
            <div><dt className="text-xs text-muted">Offre en circulation</dt><dd className="tnum font-medium text-ink">{circ ? fmtCompact(circ) : '—'}{circ && maxS ? ` (${Math.round((circ / maxS) * 100)} %)` : ''}</dd></div>
            <div><dt className="text-xs text-muted">Plus haut historique</dt><dd className="tnum font-medium text-ink">{fmtPrice((m?.ath ?? md?.ath.usd ?? 0) * rate, currency)} <span className="text-xs text-muted">{m?.ath_date ? fmtDate(m.ath_date) : ''}</span></dd></div>
            <div><dt className="text-xs text-muted">Distance à l’ATH</dt><dd><Delta value={athChange} /></dd></div>
            <div><dt className="text-xs text-muted">Variation 1 an</dt><dd><Delta value={m?.price_change_percentage_1y_in_currency ?? md?.price_change_percentage_1y} /></dd></div>
            <div><dt className="text-xs text-muted">RSI 14 j / hebdo</dt><dd className="tnum font-medium text-ink">{analysis ? `${Math.round(analysis.rsi14)} / ${Number.isFinite(analysis.rsiWeekly) ? Math.round(analysis.rsiWeekly) : '—'}` : '—'}</dd></div>
            <div><dt className="text-xs text-muted">Multiple de Mayer</dt><dd className="tnum font-medium text-ink">{analysis && Number.isFinite(analysis.mayer) ? fmtNum(analysis.mayer, 2) : '—'}</dd></div>
          </dl>
          {c?.categories?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{c.categories.slice(0, 8).map((cat) => <Badge key={cat}>{cat}</Badge>)}</div> : null}
          {desc && <details className="mt-4 text-sm text-ink-2"><summary className="cursor-pointer text-ink">Description du projet</summary><p className="mt-2 whitespace-pre-line">{desc.slice(0, 1800)}</p></details>}
        </Card>
        <Card title="Liens">
          <ul className="space-y-2 text-sm">
            {c?.links.homepage?.filter(Boolean).slice(0, 1).map((u) => <li key={u}><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(u)}><ExternalLink className="size-3.5" />Site officiel</button></li>)}
            {c?.links.twitter_screen_name && <li><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(`https://x.com/${c.links.twitter_screen_name}`)}><ExternalLink className="size-3.5" />X / Twitter</button></li>}
            {c?.links.blockchain_site?.filter(Boolean).slice(0, 2).map((u) => <li key={u}><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(u)}><ExternalLink className="size-3.5" />Explorateur</button></li>)}
            <li><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(`https://www.coingecko.com/fr/pi%C3%A8ces/${id}`)}><ExternalLink className="size-3.5" />CoinGecko</button></li>
            <li><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(`https://tokenomist.ai/${id}`)}><ExternalLink className="size-3.5" />Déblocages de tokens</button></li>
            <li><button type="button" className="inline-flex items-center gap-1.5 text-accent hover:underline" onClick={() => openExternal(`https://www.tradingview.com/symbols/${symbol}USD/`)}><ExternalLink className="size-3.5" />TradingView</button></li>
          </ul>
          {thesis && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium text-ink">Ma thèse</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-ink-2">{thesis.sentences.filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}</ol>
              {thesis.hypotheses.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {thesis.hypotheses.map((h) => <li key={h.id} className="flex items-center gap-1.5 text-ink-2"><span>{h.status === 'ok' ? '🟢' : h.status === 'weak' ? '🟡' : h.status === 'broken' ? '🔴' : '⚫'}</span>{h.label}</li>)}
                </ul>
              )}
              {thesis.lastCheck && <p className="mt-2 text-xs text-muted">Dernier contrôle : {fmtDate(thesis.lastCheck.date)} — thèse {thesis.lastCheck.verdict}</p>}
            </div>
          )}
          <div className="mt-4"><Stars value={analysis ? Math.round((analysis.investor.score + 100) / 40) : 0} /> <span className="text-xs text-muted">note technique long terme</span></div>
        </Card>
      </div>

      <TransactionModal open={modal === 'tx'} onClose={() => setModal(null)} presetCoin={coinRef} />
      <DcaPlanModal open={modal === 'dca'} onClose={() => setModal(null)} presetCoin={coinRef} />
      <AlertModal open={modal === 'alert'} onClose={() => setModal(null)} presetCoin={coinRef} />
      <TradeModal open={modal === 'trade'} onClose={() => setModal(null)} preset={analysis?.plan ? { coinId: id, symbol: symbol.toLowerCase(), entryPrice: Math.round(analysis.plan.entry * 1e6) / 1e6, stopLoss: Math.round(analysis.plan.stop * 1e6) / 1e6, takeProfit: Math.round(analysis.plan.tp1 * 1e6) / 1e6 } : { coinId: id, symbol: symbol.toLowerCase() }} />
      <ThesisModal open={modal === 'thesis'} onClose={() => setModal(null)} coin={coinRef} initial={thesis} />
    </div>
  );
}
