// Carte « Radar dérivés & réseau » (Cockpit) : open interest, funding, ratio long/short (Binance publics)
// et activité mempool. Seuils heuristiques affichés comme tels ; aucune donnée personnelle envoyée.

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { getDerivsSnapshot } from '../api/derivs';
import { interpretDerivs } from '../lib/derivs';
import { useMarkets } from '../hooks/useMarket';
import { fmtCompact, fmtNum } from '../lib/format';
import { Card, Spinner, Stat } from './ui';

const TONE_DOT = { up: 'bg-good', down: 'bg-critical', warn: 'bg-warn', neutral: 'bg-axis' } as const;

export function DerivativesCard() {
  const q = useQuery({ queryKey: ['derivs'], queryFn: getDerivsSnapshot, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: 1 });
  const markets = useMarkets();
  const btc = markets.data?.find((m) => m.id === 'bitcoin');
  const btcUsd = btc?.current_price ?? null;
  const d = q.data;
  const oiUsd = d?.oiBtc != null && btcUsd ? d.oiBtc * btcUsd : null;
  const notices = d ? interpretDerivs({ ...d, oiUsd }) : [];

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Activity className="size-4 text-accent" />Radar dérivés & réseau Bitcoin</span>} subtitle="Binance (public) + mempool.space — seuils heuristiques, pas des signaux">
      {q.isLoading && <Spinner label="Lecture de l’open interest, du funding et de la mempool…" />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Open interest BTC" value={d.oiBtc != null ? `${fmtCompact(d.oiBtc)} BTC` : '—'} hint={oiUsd != null ? `≈ ${fmtCompact(oiUsd / 1e9)} Md $` : undefined} />
            <Stat label="Funding (8 h)" value={d.fundingLast != null ? `${fmtNum(d.fundingLast * 100, 4)} %` : '—'} hint={d.fundingAprPct != null ? `${fmtNum(d.fundingAprPct, 1)} %/an` : undefined} />
            <Stat label="Ratio long/short" value={d.longShortRatio != null ? d.longShortRatio.toFixed(2) : '—'} hint={d.longPct != null ? `${fmtNum(d.longPct, 0)} % de longs` : 'comptes Binance'} />
            <Stat label="Mempool" value={d.mempoolTx != null ? fmtCompact(d.mempoolTx) : '—'} hint={d.fastestFeeSatVb != null ? `${fmtNum(d.fastestFeeSatVb, 0)} sat/vB · ${d.mempoolVsizeMb != null ? `${fmtNum(d.mempoolVsizeMb, 0)} Mo` : ''}` : undefined} />
          </div>
          {notices.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {notices.map((n) => (
                <li key={n.key} className="flex items-start gap-2 rounded-lg bg-surface-2 p-2.5 text-sm">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE_DOT[n.tone]}`} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{n.title}</div>
                    <div className="text-xs text-ink-2">{n.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!notices.length && <p className="mt-3 text-sm text-muted">Rien d’extrême côté dérivés ou réseau en ce moment.</p>}
        </>
      )}
      {q.error && <p className="text-sm text-muted">Radar indisponible pour le moment.</p>}
    </Card>
  );
}
