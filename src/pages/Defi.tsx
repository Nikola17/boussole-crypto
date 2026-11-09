// Rendement (staking, prêt de stablecoins) et enveloppe DeFi (petits paris bornés sur Solana).

import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { useFx } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useYields } from '../hooks/useYields';
import { YIELD_OPTIONS, yieldRows, type YieldRow } from '../lib/staking';
import { fmtMoney, fmtNum } from '../lib/format';
import { openExternal } from '../lib/platform';
import { setQuery, useHashPath } from '../router';
import { Badge, Banner, Card, ErrorNote, PageHeader, Segmented, Spinner } from '../components/ui';
import { Envelope } from '../components/Envelope';

type Tab = 'rendement' | 'enveloppe';
const RISK_LABEL = { 1: 'Classique', 2: 'Modéré', 3: 'Élevé' } as const;
const RISK_TONE = { 1: 'up', 2: 'warn', 3: 'down' } as const;
const ASSETS: { coinId: string; label: string }[] = [
  { coinId: 'ethereum', label: 'Ethereum (ETH)' }, { coinId: 'solana', label: 'Solana (SOL)' },
  { coinId: 'hyperliquid', label: 'Hyperliquid (HYPE)' }, { coinId: 'usd-coin', label: 'USDC (stablecoin)' },
];
/** En dessous de ce gain annuel (en euros), le rendement ne vaut pas le risque supplémentaire. */
const MIN_GAIN_EUR = 10;

export default function Defi() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'rendement';
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Rendement & DeFi" subtitle="Ce que rapporte vraiment le staking à ta taille, et un cadre strict pour les paris sur Solana." />
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[{ value: 'rendement', label: 'Rendement' }, { value: 'enveloppe', label: 'Enveloppe DeFi' }]} />
      {tab === 'rendement' ? <Yields /> : <Envelope />}
    </div>
  );
}

function Yields() {
  const pf = usePortfolio();
  const fx = useFx();
  const { quotes, loading, failed } = useYields();
  const currency = pf.currency;
  const positions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of pf.holdings) if (h.coinId) out[h.coinId] = (out[h.coinId] ?? 0) + h.valueUsd;
    return out;
  }, [pf.holdings]);
  const rows = useMemo(() => yieldRows(YIELD_OPTIONS, quotes, positions, MIN_GAIN_EUR / (fx || 0.9)), [quotes, positions, fx]);
  const eur = (usd: number) => fmtMoney(usd * pf.rate, currency, usd * pf.rate < 100 ? 2 : 0);

  // Meilleur rendement raisonnable (risque 1 ou 2) par actif : sert à estimer ce que tout le staking possible rapporterait.
  const best = ASSETS.map((a) => {
    const list = rows.filter((r) => r.option.coinId === a.coinId && r.option.risk <= 2 && r.quote?.apy != null && r.positionUsd > 0).sort((x, y) => (y.quote?.apy ?? 0) - (x.quote?.apy ?? 0));
    return list[0];
  }).filter((r): r is YieldRow => !!r);
  const potential = best.reduce((s, r) => s + (r.gainYearUsd ?? 0), 0);

  return (
    <div className="space-y-4">
      <Banner tone="info" title="À ta taille, le rendement est une petite cerise, pas un gâteau">
        Règle : <b>n’achète jamais un jeton pour son rendement</b>. Le staking ajoute des risques (contrat intelligent, jeton dérivé qui s’écarte de son sous-jacent, délais de retrait) pour quelques euros par an. Bitcoin n’a pas de staking natif : les « rendements Bitcoin » ajoutent un risque de contrepartie.
      </Banner>
      {loading && <Spinner label="Lecture des rendements (DefiLlama)…" />}
      {failed && <ErrorNote error={new Error('Rendements indisponibles pour le moment (DefiLlama).')} />}
      {!loading && best.length > 0 && (
        <Card title="Ce que le staking pourrait te rapporter" subtitle="Meilleure option de risque classique ou modéré pour chaque actif que tu détiens, toutes lignes confondues">
          <p className="text-2xl font-semibold text-ink">≈ {eur(potential)} <span className="text-sm font-normal text-muted">par an</span></p>
          <p className="mt-1 text-sm text-ink-2">{potential * pf.rate < MIN_GAIN_EUR * 3 ? 'C’est peu : ne complique pas ta vie pour ça. Concentre-toi sur ton DCA et sur la réduction de l’éparpillement.' : 'Cela peut valoir la peine pour tes plus grosses lignes, une à la fois, en commençant par la plus simple.'}</p>
        </Card>
      )}
      {ASSETS.map((a) => {
        const list = rows.filter((r) => r.option.coinId === a.coinId).sort((x, y) => x.option.risk - y.option.risk || (y.quote?.apy ?? 0) - (x.quote?.apy ?? 0));
        const pos = positions[a.coinId] ?? 0;
        return (
          <Card key={a.coinId} title={a.label} subtitle={pos > 0 ? `Tu en détiens pour ${eur(pos)}` : 'Tu n’en détiens pas pour l’instant'}>
            <ul className="divide-y divide-line">
              {list.map((r) => <YieldItem key={r.option.id} r={r} eur={eur} minGain={MIN_GAIN_EUR} />)}
            </ul>
          </Card>
        );
      })}
      <p className="text-xs text-muted">Rendements annuels lus sur DefiLlama, variables et non garantis. Aucune de ces options n’est un conseil : vérifie toujours l’adresse du site officiel avant de connecter ton wallet.</p>
    </div>
  );
}

function YieldItem({ r, eur, minGain }: { r: YieldRow; eur: (usd: number) => string; minGain: number }) {
  const o = r.option;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{o.label} <span className="text-xs font-normal text-muted">{o.chain}</span></span>
        <Badge tone={RISK_TONE[o.risk]}>Risque {RISK_LABEL[o.risk].toLowerCase()}</Badge>
        <span className="tnum text-lg font-semibold text-ink">{r.quote?.apy != null ? `${fmtNum(r.quote.apy, 2)} %` : '—'}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-2">
        {r.verdict === 'unknown' && 'Rendement indisponible pour le moment.'}
        {r.verdict === 'none' && `Tu ne détiens pas de ${o.symbol}.`}
        {r.verdict === 'skip' && <>À ta taille : ≈ {eur(r.gainYearUsd ?? 0)} par an. <b className="text-ink">Pas la peine</b> (moins de {minGain} €) : le risque ne se justifie pas.</>}
        {r.verdict === 'ok' && <>À ta taille : ≈ <b className="text-ink">{eur(r.gainYearUsd ?? 0)}</b> par an sur {eur(r.positionUsd)}.</>}
        {r.quote?.tvlUsd != null && <span className="text-muted"> · {fmtNum(r.quote.tvlUsd / 1e6, 0)} M$ déposés</span>}
      </p>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer">Risques et mode d’emploi</summary>
        <ul className="mt-1 list-disc pl-5">{o.risks.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="mt-1">{o.howTo}</p>
        <button type="button" className="mt-1 inline-flex items-center gap-1 text-accent hover:underline" onClick={() => openExternal(`https://defillama.com/yields/pool/${o.id}`)}>Fiche DefiLlama <ExternalLink className="size-3" /></button>
      </details>
    </li>
  );
}

