// Onglet « Banc d'essai » : la fiabilité mesurée de chaque signal sur l'historique, et le rejeu sur une crypto.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RELIABILITY, reliabilityFromYear, type ReliabilityEntry } from '../../lib/lab/reliability';
import { studySignals, type KeyStats } from '../../lib/lab/events';
import { makeAsset } from '../../lib/lab/universe';
import { temperatureSeries } from '../../lib/lab/replayTemp';
import { useDailyHistory } from '../../api/history';
import { binanceSymbolFor, getAllPrices } from '../../api/binance';
import { getFearGreed } from '../../api/feargreed';
import { useMarkets, usePrices } from '../../hooks/useMarket';
import { useStore } from '../../store/useStore';
import { evaluateAiTrackRecord } from '../../lib/aiTrackRecord';
import { CoinPicker } from '../../components/CoinPicker';
import { Badge, Banner, Card, Field, Spinner } from '../../components/ui';
import type { CoinRef } from '../../types';

const ORDER = ['validé', 'prometteur', 'sans effet', 'inversé', 'trop peu de cas'];
const tone = (v: string) => (v === 'validé' ? 'up' : v === 'inversé' ? 'down' : v === 'prometteur' ? 'accent' : 'neutral') as 'up' | 'down' | 'accent' | 'neutral';
const n0 = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${Math.round(x)} %` : '—');
const s1 = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x > 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')} %` : '—');
const r2 = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? `${x > 0 ? '+' : ''}${x.toFixed(2).replace('.', ',')} R` : '—');

function Row({ label, e }: { label: string; e: Pick<ReliabilityEntry, 'horizon' | 'episodes' | 'frequencyPct' | 'hitPct' | 'baselineHitPct' | 'medianPct' | 'verdict' | 'expectancyR'> & { control?: { episodes: number; hitPct: number; baselineHitPct: number } } }) {
  return (
    <li className="grid grid-cols-2 gap-x-3 gap-y-1 py-2.5 text-sm md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))_auto] md:items-center">
      <span className="col-span-2 font-medium text-ink md:col-span-1">{label} <span className="text-xs font-normal text-muted">· {e.horizon} j</span></span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">Fréquence </span>{n0(e.frequencyPct)}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">Épisodes </span>{e.episodes}</span>
      <span className="text-ink"><span className="text-xs text-muted md:hidden">Hausse </span>{e.expectancyR != null ? r2(e.expectancyR) : `${n0(e.hitPct)} / ${n0(e.baselineHitPct)}`}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">Médiane </span>{e.expectancyR != null ? '—' : s1(e.medianPct)}</span>
      <span className="text-ink-2"><span className="text-xs text-muted md:hidden">Contrôle </span>{e.control ? (e.expectancyR != null ? `${e.control.episodes} ép.` : `${n0(e.control.hitPct)} / ${n0(e.control.baselineHitPct)}`) : '—'}</span>
      <span><Badge tone={tone(e.verdict)}>{e.verdict}</Badge></span>
    </li>
  );
}

function Header() {
  return (
    <div className="hidden border-b border-line pb-1 text-xs text-muted md:grid md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))_auto] md:gap-x-3">
      <span>Signal</span><span>Fréquence</span><span>Épisodes</span><span>Hausse / réf.</span><span>Médiane</span><span>Contrôle (hausse / réf.)</span><span>Verdict</span>
    </div>
  );
}

function Replay() {
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const markets = useMarkets();
  const extra = usePrices(coin && !(markets.data ?? []).some((m) => m.id === coin.coinId) ? [coin.coinId] : []);
  const priceUsd = coin ? (markets.data ?? []).find((m) => m.id === coin.coinId)?.current_price ?? extra.data?.[coin.coinId]?.usd ?? null : null;
  const pairs = useQuery({ queryKey: ['binance-prices'], queryFn: getAllPrices, staleTime: 5 * 60_000 });
  const symbol = coin && priceUsd && pairs.data ? binanceSymbolFor({ id: coin.coinId, symbol: coin.symbol, priceUsd }, pairs.data) : null;
  const hist = useDailyHistory(symbol);
  const btcHist = useDailyHistory(symbol ? 'BTCUSDT' : null);
  const fng = useQuery({ queryKey: ['fng-all'], queryFn: () => getFearGreed(0), staleTime: 12 * 3600_000, enabled: !!symbol });
  const [result, setResult] = useState<{ keys: KeyStats[]; observations: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(null);
    if (!symbol || !hist.data || !btcHist.data || fng.isLoading) return;
    setBusy(true);
    // Calcul lourd (une analyse par jour) : lancé après l'affichage du sablier.
    const t = setTimeout(() => {
      const asset = makeAsset(symbol === 'BTCUSDT' ? 'BTC' : symbol.replace(/USDT$/, ''), hist.data!);
      const btc = makeAsset('BTC', btcHist.data!);
      const fngMap = new Map((fng.data ?? []).map((p) => [new Date(p.time * 1000).toISOString().slice(0, 10), p.value]));
      const r = studySignals({ assets: [asset], btc, temperature: temperatureSeries(btc.candles, fngMap, new Map()), top: 1 });
      setResult({ keys: r.keys.filter((k) => !k.meta.key.startsWith('temp:') || asset.id === 'BTC'), observations: r.observations });
      setBusy(false);
    }, 50);
    return () => clearTimeout(t);
  }, [symbol, hist.data, btcHist.data, fng.isLoading, fng.data]);

  const noPair = coin && priceUsd && pairs.data && !symbol;
  const keys = result ? [...result.keys].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || b.byHorizon[b.meta.horizon].all.episodes - a.byHorizon[a.meta.horizon].all.episodes) : [];
  const fewCases = result && result.observations > 0 && keys.every((k) => (k.byHorizon[k.meta.horizon]?.all.episodes ?? 0) < 12);

  return (
    <Card title="Rejouer sur une crypto" subtitle="Les mêmes mesures, sur le seul historique de cette crypto (la référence est l’ensemble de ses propres jours)">
      <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
      <div className="mt-3 space-y-2">
        {noPair && <Banner tone="info">Pas assez d’historique pour cette crypto : elle n’a pas de paire cotée sur Binance.</Banner>}
        {(hist.isLoading || btcHist.isLoading || busy) && <Spinner label="Chargement de l’historique et calcul (quelques secondes)…" />}
        {hist.error && <Banner tone="warn">Historique indisponible pour le moment. Réessaie plus tard.</Banner>}
        {result && result.observations === 0 && <Banner tone="info">Pas assez d’historique pour cette crypto (il faut au moins 200 jours de cotation).</Banner>}
        {fewCases && <Banner tone="warn">Trop peu de cas pour conclure : moins de 12 épisodes pour chaque signal.</Banner>}
        {result && result.observations > 0 && (
          <div>
            <p className="text-xs text-muted">{result.observations} jours analysés. Sans température de marché historique complète (MVRV absent).</p>
            <Header />
            <ul className="divide-y divide-line">
              {keys.map((k) => {
                const h = k.byHorizon[k.meta.horizon];
                return <Row key={k.meta.key} label={k.meta.label} e={{ horizon: k.meta.horizon, episodes: h.all.episodes, frequencyPct: k.frequencyPct, hitPct: h.all.hitPct, baselineHitPct: h.all.baselineHitPct, medianPct: h.all.medianPct, verdict: k.verdict, expectancyR: h.all.expectancyR, control: h.control }} />;
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function AiTrackRecordCard() {
  const reports = useStore((s) => s.reports);
  const markets = useMarkets();
  const track = useMemo(() => {
    const byId = new Map((markets.data ?? []).map((m) => [m.id, m.current_price]));
    return evaluateAiTrackRecord(reports, (id) => byId.get(id) ?? null);
  }, [reports, markets.data]);

  if (!track.total) return null;
  return (
    <Card title="Fiabilité mesurée de tes analyses IA (AI Track Record)" subtitle={`${track.wins} verdicts directionnels gagnants sur ${track.total} (${Math.round(track.winRatePct)} %)`}>
      <ul className="divide-y divide-line text-sm">
        {track.byModel.map((m) => (
          <li key={m.model} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="font-medium text-ink">{m.model}</span>
            <span className="tnum text-xs text-ink-2">
              {m.wins}/{m.total} gagnants ({Math.round(m.winRatePct)} %) · rendement directionnel moyen {s1(m.avgReturnPct)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function BenchTab() {
  const entries = useMemo(() => Object.entries(RELIABILITY.entries).sort(([ka, a], [kb, b]) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || ka.localeCompare(kb)), []);
  const from = reliabilityFromYear();
  return (
    <div className="space-y-4">
      <Card title="Ce que valent les signaux de Boussole" subtitle={RELIABILITY.dataThrough ? `Mesuré depuis ${from} sur ${RELIABILITY.universe.assets} cryptos, données jusqu’au ${new Date(RELIABILITY.dataThrough).toLocaleDateString('fr-FR')}` : 'Mesure pas encore disponible'}>
        {entries.length === 0 ? <p className="text-sm text-muted">La table de fiabilité n’a pas encore été produite.</p> : (
          <>
            <Header />
            <ul className="divide-y divide-line">{entries.map(([k, e]) => <Row key={k} label={e.label} e={e} />)}</ul>
            <p className="mt-2 text-xs text-muted">« Hausse » : part des épisodes en gain à l’horizon indiqué, face à un jour quelconque. Plans de trade : espérance en R, frais compris. Le verdict se juge sur la période de contrôle (depuis 2023).</p>
          </>
        )}
      </Card>
      <AiTrackRecordCard />
      <Replay />
      <Card title="Méthode">
        <details className="text-sm text-ink-2">
          <summary className="cursor-pointer text-ink">Comment ces chiffres sont calculés, et leurs limites</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Chaque jour depuis {from}, les signaux sont recalculés comme dans l’application, sur les bougies closes de la veille.</li>
            <li>L’univers : les 50 cryptos les plus échangées sur Binance ce jour-là, paires retirées depuis comprises.</li>
            <li>On achète en théorie à l’ouverture du lendemain du signal et on regarde le prix 7, 14, 30, 90, 180 ou 365 jours après.</li>
            <li>Un signal qui reste allumé plusieurs jours de suite compte une seule fois (un « épisode »).</li>
            <li>La référence est un jour quelconque de la même période : un signal utile fait nettement mieux qu’elle.</li>
            <li>Les règles sont jugées sur 2023 et après, une période qui n’a servi à régler aucun seuil.</li>
            <li>« Validé » exige un écart d’au moins 5 points que la marge d’erreur n’efface pas ; « inversé », un écart de 5 points dans le mauvais sens.</li>
            <li>Limites : classement par volume (pas de capitalisation historique gratuite), cryptos jamais cotées sur Binance absentes.</li>
            <li>Les jours se chevauchent : il y a bien moins de cas indépendants que de jours. Lire les médianes plutôt que les moyennes.</li>
            <li>Un signal validé reste une probabilité, jamais une promesse.</li>
          </ul>
        </details>
      </Card>
    </div>
  );
}
