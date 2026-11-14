// Fiche « 12 critères » d'une crypto : données réelles, sourcées, avec « non vérifié » quand elles manquent.

import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCoinDeveloper, getCoinTickers, type CgCoin, type CgMarket, type CgTicker } from '../api/coingecko';
import { scanEvm, scanSolana } from '../api/security';
import { useDefi } from '../hooks/useMarket';
import { evaluateCriteria, MAJOR_EXCHANGES, type CriterionStatus } from '../lib/criteria';
import { Badge, Banner, Button, Card, Spinner } from './ui';

const EVM_CHAINS: Record<string, string> = { ethereum: '1', base: '8453', 'binance-smart-chain': '56', 'arbitrum-one': '42161' };
const TONE: Record<CriterionStatus, 'up' | 'warn' | 'down' | 'neutral'> = { ok: 'up', warn: 'warn', bad: 'down', unknown: 'neutral' };
const LABEL: Record<CriterionStatus, string> = { ok: 'OK', warn: 'Attention', bad: 'Risque', unknown: 'Non vérifié' };

/** Profondeur à ±2 % : Crypto.com d'abord (c'est là que tu achètes), sinon la plateforme la plus liquide. */
function depthOf(tickers: CgTicker[]): { usd: number; where: string } | null {
  const usable = tickers.filter((t) => !t.is_anomaly && !t.is_stale && t.cost_to_move_up_usd != null && t.cost_to_move_down_usd != null);
  const best = (list: CgTicker[]) => [...list].sort((a, b) => b.converted_volume.usd - a.converted_volume.usd)[0];
  const t = best(usable.filter((x) => x.market.identifier === 'crypto_com')) ?? best(usable);
  if (!t) return null;
  return { usd: Math.min(t.cost_to_move_up_usd ?? Infinity, t.cost_to_move_down_usd ?? Infinity), where: `${t.market.name} ${t.base}/${t.target}` };
}

export function CriteriaCard({ coinId, symbol, market, coin }: { coinId: string; symbol: string; market?: CgMarket; coin?: CgCoin }) {
  const [go, setGo] = useState(false);
  const [wantSecurity, setWantSecurity] = useState(false);
  const [wantDefi, setWantDefi] = useState(false);

  const base = useQuery({
    queryKey: ['criteria', coinId],
    enabled: go,
    staleTime: 30 * 60_000,
    retry: 0,
    queryFn: async () => {
      let tickers = await getCoinTickers(coinId, { depth: true });
      if (!tickers.some((t) => t.market.identifier === 'crypto_com')) {
        try { tickers = [...tickers, ...(await getCoinTickers(coinId, { exchangeId: 'crypto_com', depth: true }))]; } catch { /* facultatif */ }
      }
      let dev = null;
      try { dev = await getCoinDeveloper(coinId); } catch { /* facultatif */ }
      return { tickers, dev };
    },
  });

  const contract = useMemo(() => {
    const p = Object.entries(coin?.platforms ?? {}).filter(([, a]) => !!a);
    const sol = p.find(([k]) => k === 'solana');
    if (sol) return { kind: 'solana' as const, chain: '', address: sol[1] };
    const evm = p.find(([k]) => EVM_CHAINS[k]);
    return evm ? { kind: 'evm' as const, chain: EVM_CHAINS[evm[0]], address: evm[1] } : null;
  }, [coin?.platforms]);
  const nativeCoin = !!coin && !Object.values(coin.platforms ?? {}).some((a) => !!a);

  const security = useQuery({
    queryKey: ['criteria-security', coinId],
    enabled: wantSecurity && !!contract,
    staleTime: 60 * 60_000,
    retry: 0,
    queryFn: () => (contract?.kind === 'solana' ? scanSolana(contract.address) : scanEvm(contract?.chain ?? '1', contract?.address ?? '')),
  });
  const defi = useDefi(wantDefi);

  const protocol = useMemo(() => {
    if (!defi.data) return null;
    const p = defi.data.protocols.find((x) => x.gecko_id === coinId);
    if (!p) return null;
    return { tvlUsd: p.tvl, fees30dUsd: defi.data.fees.get(p.id)?.total30d ?? null, revenue30dUsd: defi.data.revenue.get(p.id)?.total30d ?? null };
  }, [defi.data, coinId]);

  const rows = useMemo(() => {
    if (!base.data) return null;
    const depth = depthOf(base.data.tickers);
    const names = [...new Set(base.data.tickers.filter((t) => !t.is_anomaly).map((t) => t.market.name.toLowerCase()))];
    const md = coin?.market_data;
    return evaluateCriteria({
      symbol,
      rank: market?.market_cap_rank ?? coin?.market_cap_rank ?? null,
      marketCapUsd: market?.market_cap ?? md?.market_cap.usd ?? null,
      volume24hUsd: market?.total_volume ?? md?.total_volume.usd ?? null,
      fdvUsd: market?.fully_diluted_valuation ?? md?.fully_diluted_valuation.usd ?? null,
      changes: {
        d1: market?.price_change_percentage_24h ?? md?.price_change_percentage_24h ?? null,
        d7: market?.price_change_percentage_7d_in_currency ?? md?.price_change_percentage_7d ?? null,
        d30: market?.price_change_percentage_30d_in_currency ?? md?.price_change_percentage_30d ?? null,
        d200: market?.price_change_percentage_200d_in_currency ?? null,
        y1: market?.price_change_percentage_1y_in_currency ?? md?.price_change_percentage_1y ?? null,
      },
      depth2pctUsd: depth?.usd ?? null,
      depthWhere: depth?.where ?? null,
      majorListings: MAJOR_EXCHANGES.filter((m) => names.some((n) => n.includes(m.toLowerCase()))),
      protocol,
      top10HoldersPct: security.data?.top10HoldersPct ?? null,
      nativeCoin,
      dev: base.data.dev ? { commits4w: base.data.dev.commit_count_4_weeks, stars: base.data.dev.stars } : null,
    });
  }, [base.data, market, coin, symbol, protocol, security.data, nativeCoin]);

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><ListChecks className="size-4 text-accent" />Fiche des 12 critères</span>}
      actions={!go ? <Button size="sm" variant="primary" onClick={() => setGo(true)}>Charger la fiche</Button> : undefined}
    >
      {!go && <p className="text-sm text-muted">Quelques requêtes vers CoinGecko (carnet d’ordres, plateformes, code) : environ 15 secondes.</p>}
      {go && base.isLoading && <Spinner label="Lecture du carnet d’ordres et des plateformes (CoinGecko)…" />}
      {base.error && <Banner tone="warn">{(base.error as Error).message}</Banner>}
      {rows && (
        <div className="space-y-3">
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.key} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="w-5 text-xs text-muted">{c.n}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">{c.label}</span>
                  <Badge tone={TONE[c.status]}>{LABEL[c.status]}</Badge>
                </div>
                <p className="mt-0.5 pl-8 text-sm text-ink">{c.value}</p>
                <p className="pl-8 text-xs text-muted">{c.detail} <span className="opacity-70">· {c.source}</span></p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {contract && !security.data && <Button size="sm" loading={security.isFetching} onClick={() => setWantSecurity(true)}>Analyser les gros détenteurs</Button>}
            {!defi.data && <Button size="sm" loading={defi.isFetching} onClick={() => setWantDefi(true)}>Charger revenus et TVL (DefiLlama, ~10 Mo)</Button>}
          </div>
          {security.error && <p className="text-xs text-down">{(security.error as Error).message}</p>}
          {defi.data && !protocol && <p className="text-xs text-muted">Cette crypto n’est pas un protocole suivi par DefiLlama.</p>}
        </div>
      )}
    </Card>
  );
}
