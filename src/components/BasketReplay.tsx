// « Rejouer mon panier » : la base du panier (ses réglages, ses frais) simulée sur l'historique depuis 2023,
// face au DCA Bitcoin simple aux mêmes jours et montants. Même moteur que le banc d'essai et les autopilotes.

import { useState } from 'react';
import { History } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useMarkets } from '../hooks/useMarket';
import { useCryptoComListing } from '../hooks/useCryptoCom';
import { appSources } from '../hooks/useAutopilot';
import { rulesOf } from '../lib/profile';
import { STRATEGIES } from '../lib/lab/strategies';
import { simulate } from '../lib/lab/sim';
import { makeAsset, toSymbol, type Asset } from '../lib/lab/universe';
import { COSTS } from '../lib/lab/types';
import { maxDrawdownPct, twr, type DayPoint } from '../lib/lab/metrics';
import { BASE_MODE_LABEL } from '../lib/autoBasket';
import { fmtNum, isoDay } from '../lib/format';
import { LineChart } from './LineChart';
import { Button, Card, ErrorNote, Segmented, Stat } from './ui';
import type { BasketPlan } from '../types';

const FROM = '2023-01-01';
const t = (day: string) => Date.parse(`${day}T00:00:00Z`) / 1000;
const pct = (x: number) => `${x >= 0 ? '+' : ''}${fmtNum(x)} %`;

interface Replay { mine: DayPoint[]; btc: DayPoint[] }

export function BasketReplay({ bk }: { bk: BasketPlan }) {
  const markets = useMarkets();
  const cdc = useCryptoComListing();
  const profile = useStore((s) => s.profile);
  const [costs, setCosts] = useState<'app' | 'exchange'>('app');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [r, setR] = useState<Replay | null>(null);
  if (bk.mode !== 'auto') return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const src = await appSources(markets.data ?? [], cdc.data ?? null, rulesOf(profile));
      const uni = await src.universe();
      const assets: Asset[] = [];
      for (const u of [...uni, { coinId: 'bitcoin' }]) {
        const cs = await src.daily(u.coinId);
        if (cs.length) assets.push(makeAsset(toSymbol(u.coinId), cs));
      }
      const unique = [...new Map(assets.map((a) => [a.id, a])).values()];
      const btc = unique.find((a) => a.id === 'BTC');
      if (!btc) throw new Error('Historique de Bitcoin indisponible.');
      const temperature = new Map([...btc.dayIndex.keys()].map((d) => [d, src.temperatureAt(d)] as const).filter((x): x is [string, number] => x[1] != null));
      const to = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      const cfg = { startCashUsd: 0, costs: COSTS[costs], fill: 'nextOpen' as const, from: FROM, to, minOrderUsd: bk.minOrderUsd || 5 };
      const data = { assets: unique, temperature, btcId: 'BTC' };
      const boussole = STRATEGIES['dca-boussole'];
      const mine = simulate(boussole, { ...boussole.defaults, amountUsd: bk.amountUsd, daysOfWeek: bk.daysOfWeek, baseMode: bk.baseMode ?? 'top3', anchorPct: bk.anchorPct ?? 70, minOrderUsd: bk.minOrderUsd || 5, maxBaseLines: bk.maxBaseLines ?? 3 }, data, cfg);
      const dcaBtc = STRATEGIES['dca-btc'];
      const ref = simulate(dcaBtc, { ...dcaBtc.defaults, amountUsd: bk.amountUsd, daysOfWeek: bk.daysOfWeek }, data, cfg);
      setR({ mine: mine.series.filter((p) => p.valueUsd > 0 || p.flowUsd > 0), btc: ref.series.filter((p) => p.valueUsd > 0 || p.flowUsd > 0) });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const invested = (s: DayPoint[]) => s.reduce((sum, p) => sum + p.flowUsd, 0);
  return (
    <Card title={<span className="inline-flex items-center gap-2"><History className="size-4 text-accent" />Rejouer mon panier</span>}
      subtitle={`La base de ton panier (règle « ${BASE_MODE_LABEL[bk.baseMode ?? 'top3']} », ${fmtNum(bk.amountUsd, 0)} USDC par échéance, température et réserve) depuis le 1er janvier 2023, face au DCA Bitcoin simple`}
      actions={<Button size="sm" loading={busy} onClick={() => void run()}>{r ? 'Recalculer' : 'Rejouer'}</Button>}>
      <div className="mb-3"><Segmented value={costs} onChange={(v) => { setCosts(v); setR(null); }} options={[{ value: 'app', label: 'Frais d’une application (1,5 %)' }, { value: 'exchange', label: 'Plateforme d’échange (0,15 %)' }]} /></div>
      {error != null && <ErrorNote error={error} onRetry={() => void run()} />}
      {!r && !busy && error == null && <p className="text-sm text-muted">La simulation télécharge l’historique des 20 premières cryptos (une fois, ensuite gardé sur l’appareil). La découverte n’est pas rejouée : son score lit des données qu’on ne peut pas remonter dans le temps.</p>}
      {r && r.mine.length > 1 && (
        <>
          <LineChart height={220} yFormat={(v) => `${fmtNum(v, 0)} $`} series={[
            { key: 'mine', label: 'Mon panier (base)', color: 'var(--series-1)', area: true, points: r.mine.map((p) => ({ t: t(p.day), v: p.valueUsd })) },
            { key: 'btc', label: 'DCA Bitcoin simple', color: 'var(--series-2)', dashed: true, points: r.btc.map((p) => ({ t: t(p.day), v: p.valueUsd })) },
          ]} />
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Mon panier" value={pct(twr(r.mine) * 100)} hint={`pire baisse ${fmtNum(maxDrawdownPct(r.mine))} %`} />
            <Stat label="DCA Bitcoin simple" value={pct(twr(r.btc) * 100)} hint={`pire baisse ${fmtNum(maxDrawdownPct(r.btc))} %`} />
            <Stat label="Versé (panier)" value={`${fmtNum(invested(r.mine), 0)} $`} hint="le reste attend en réserve" />
            <Stat label="Valeur finale" value={`${fmtNum(r.mine[r.mine.length - 1].valueUsd, 0)} $`} hint={`Bitcoin : ${fmtNum(r.btc[r.btc.length - 1].valueUsd, 0)} $`} />
          </div>
          <p className="mt-2 text-xs text-muted">Performance pondérée par le temps, réserve comprise, au {isoDay()}. Une simulation flatte toujours un peu : elle connaît les 20 premières cryptos d’aujourd’hui.</p>
        </>
      )}
    </Card>
  );
}
