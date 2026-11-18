// Rendement (staking, prêt de stablecoins) et enveloppe DeFi (petits paris bornés sur Solana).

import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useFx } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useYields } from '../hooks/useYields';
import { YIELD_OPTIONS, yieldRows, type YieldRow } from '../lib/staking';
import { fmtMoney, fmtNum } from '../lib/format';
import { openExternal } from '../lib/platform';
import { getBinanceFlexibleEarn } from '../api/binanceAccount';
import { getProjectTopPools } from '../api/yields';
import { Link, setQuery, useHashPath } from '../router';
import { Badge, Banner, Card, ErrorNote, PageHeader, Segmented, Spinner } from '../components/ui';
import { Envelope } from '../components/Envelope';
import { FALLBACK_EUR_PER_USD } from '../lib/fx';

type Tab = 'rendement' | 'enveloppe' | 'earn';
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
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[{ value: 'rendement', label: 'Rendement' }, { value: 'enveloppe', label: 'Enveloppe DeFi' }, { value: 'earn', label: 'Earn & plateformes' }]} />
      {tab === 'rendement' ? <Yields /> : tab === 'enveloppe' ? <Envelope /> : <Earn />}
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
  const rows = useMemo(() => yieldRows(YIELD_OPTIONS, quotes, positions, MIN_GAIN_EUR / (fx || FALLBACK_EUR_PER_USD)), [quotes, positions, fx]);
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

/** Onglet « Earn & plateformes » : Simple Earn Binance, pools DeFi (Jupiter, Orca, Raydium, Hyperliquid) et
 *  correspondance entre les fonctions Binance et ce que Boussole fait déjà (ou où le faire). */
const DEFI_PROJECTS: { slug: string; label: string; url: string }[] = [
  { slug: 'jupiter', label: 'Jupiter (Solana)', url: 'https://jup.ag' },
  { slug: 'orca', label: 'Orca (Solana)', url: 'https://www.orca.so' },
  { slug: 'raydium', label: 'Raydium (Solana)', url: 'https://raydium.io' },
  { slug: 'hyperliquid', label: 'Hyperliquid (HYPE)', url: 'https://app.hyperliquid.xyz' },
];

const BINANCE_MAP: { binance: string; boussole: string; to?: string }[] = [
  { binance: 'Spot', boussole: 'Signaux, DCA et portefeuille suivis ici', to: '/marche' },
  { binance: 'Earn / Advanced Earn', boussole: 'Cet onglet : rendements lus en direct (Binance + DefiLlama)' },
  { binance: 'Démo de trading', boussole: 'Labo → Papier : portefeuille fictif aux prix réels, autopilotes testés en direct', to: '/labo' },
  { binance: 'Bots de trading', boussole: 'Labo → Autopilotes : stratégies de Boussole exécutées seules, avec verdict de confiance mesuré', to: '/labo' },
  { binance: 'Copy trading', boussole: 'Pépites → Smart money : wallets suivis, mouvements notés gagnant/perdant à 7 et 30 jours', to: '/pepites' },
  { binance: 'API', boussole: 'Réglages → Plateformes : ta clé Binance en lecture seule alimente ton portefeuille', to: '/reglages' },
  { binance: 'DEX (Binance Wallet) & Alpha', boussole: 'Pépites → Émergentes : jeunes paires Solana/Base avec scan de sécurité', to: '/pepites' },
  { binance: 'Marge (levier)', boussole: 'Trading → calculateur : taille avec levier, prix de liquidation et avertissements', to: '/trading' },
  { binance: 'Convert & P2P', boussole: 'Wallet → Fiscalité : chaque échange crypto→crypto est une cession imposable en France, calculée pour toi', to: '/portefeuille' },
];

function Earn() {
  const binanceKey = useStore((s) => s.settings.binanceApiKey);
  const earn = useQuery({ queryKey: ['binanceEarn', binanceKey.slice(-6)], queryFn: () => getBinanceFlexibleEarn(binanceKey || undefined), staleTime: 30 * 60_000, retry: 1 });
  const projects = useQuery({
    queryKey: ['defiProjects'],
    queryFn: async () => {
      const out: { slug: string; label: string; url: string; pools: Awaited<ReturnType<typeof getProjectTopPools>> }[] = [];
      for (const p of DEFI_PROJECTS) out.push({ ...p, pools: await getProjectTopPools(p.slug) });
      return out;
    },
    staleTime: 30 * 60_000,
    retry: 1,
  });

  return (
    <div className="space-y-4">
      <Banner tone="info" title="Lecture seule : Boussole ne passe aucun ordre">
        Ces rendements sont lus sur des API publiques (Binance, DefiLlama) et affichés pour t’aider à choisir — tout ordre se passe sur le site officiel du protocole, après vérification de l’adresse. N’achète jamais un jeton uniquement pour son rendement.
      </Banner>

      <Card title="Binance Simple Earn (flexible)" subtitle="Taux du moment lus sur l’API publique Binance — retirable à tout moment" actions={<button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => openExternal('https://www.binance.com/fr/earn/simple-earn')}>binance.com/earn <ExternalLink className="size-3" /></button>}>
        {earn.isLoading && <Spinner label="Lecture des produits Earn…" />}
        {earn.data == null && !earn.isLoading && <p className="text-sm text-muted">Données indisponibles pour le moment.</p>}
        {earn.data && earn.data.length > 0 && (
          <ul className="divide-y divide-line">
            {earn.data.slice(0, 12).map((p) => (
              <li key={p.asset} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-ink">{p.asset}</span>
                <span className="tnum text-ink-2">{p.apy != null ? `${fmtNum(p.apy, 2)} %/an` : '—'}{p.minAmount != null ? <span className="text-xs text-muted"> · min {fmtNum(p.minAmount, 2)} {p.asset}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="DeFi — protocoles suivis (DefiLlama)" subtitle="Top pools par TVL ; l’APY est variable et non garanti">
        {projects.isLoading && <Spinner label="Lecture des pools…" />}
        {projects.data?.map((p) => (
          <div key={p.slug} className="mb-3 last:mb-0">
            <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline" onClick={() => openExternal(p.url)}>{p.label} <ExternalLink className="size-3 text-muted" /></button>
            {!p.pools && <p className="mt-1 text-xs text-muted">Données indisponibles.</p>}
            {p.pools && p.pools.length > 0 && (
              <ul className="mt-1 divide-y divide-line">
                {p.pools.map((pool) => (
                  <li key={pool.pool} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-ink-2">{pool.symbol} <span className="text-xs text-muted">{pool.chain}</span></span>
                    <span className="tnum shrink-0 text-ink">{pool.apy != null ? `${fmtNum(pool.apy, 2)} %` : '—'}<span className="text-xs text-muted"> · {pool.tvlUsd != null ? `${fmtNum(pool.tvlUsd / 1e6, 1)} M$` : ''}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Card>

      <Card title="Binance ↔ Boussole : à quoi servent tes fonctions Binance ici ?" subtitle="Boussole ne remplace pas Binance : elle t’évite de devoir y aller pour décider">
        <ul className="divide-y divide-line">
          {BINANCE_MAP.map((m) => (
            <li key={m.binance} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="shrink-0 font-medium text-ink">{m.binance}</span>
              <span className="text-right text-xs text-ink-2">
                {m.to ? <Link to={m.to} className="hover:underline">{m.boussole}</Link> : m.boussole}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function YieldItem({ r, eur, minGain }: { r: YieldRow; eur: (usd: number) => string; minGain: number }) {  const o = r.option;
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

