// Backtest d'un bot grid sur l'historique réel (BTC ou ETH, bougies journalières Binance publiques).
// Pedagogique : montre quand une grille gagne (range) et quand elle perd (tendance forte).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDailyHistory } from '../api/binance';
import { binanceMakerPct, clampVip } from '../lib/binanceFees';
import { gridBacktest } from '../lib/lab/grid';
import { fmtMoney, fmtNum } from '../lib/format';
import { useStore } from '../store/useStore';
import { useFx } from '../hooks/useMarket';
import { Badge, Card, Field, NumberInput, Select, Spinner } from './ui';

const SYMBOLS = [{ v: 'BTCUSDT', l: 'Bitcoin (BTC)' }, { v: 'ETHUSDT', l: 'Ethereum (ETH)' }];

export function GridBacktestCard() {
  const currency = useStore((s) => s.settings.currency);
  const vip = useStore((s) => s.settings.binanceVip);
  const bnb = useStore((s) => s.settings.bnbFeeDiscount);
  const makerFeePct = binanceMakerPct(vip, bnb);
  const fx = useFx();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [amount, setAmount] = useState<number | ''>(1000);
  const [grids, setGrids] = useState<number | ''>(10);
  const [spanPct, setSpanPct] = useState<number | ''>(20); // ±10 % autour du prix actuel par défaut

  const hist = useQuery({
    queryKey: ['gridHist', symbol],
    queryFn: () => getDailyHistory(symbol, Date.UTC(2021, 0, 1)),
    staleTime: 60 * 60_000,
    retry: 1,
  });

  const result = useMemo(() => {
    const closes = (hist.data ?? []).map((c) => c.close);
    if (closes.length < 2 || amount === '' || grids === '' || spanPct === '' || !(Number(amount) > 0) || !(Number(grids) >= 1) || !(Number(spanPct) > 0)) return null;
    const last = closes[closes.length - 1];
    const half = Number(spanPct) / 2;
    return gridBacktest(closes, { amountUsd: Number(amount), lower: last * (1 - half / 100), upper: last * (1 + half / 100), grids: Math.round(Number(grids)), feePct: makerFeePct, spreadPct: 0 });
  }, [hist.data, amount, grids, spanPct, makerFeePct]);

  const money = (usd: number) => fmtMoney(usd * (currency === 'EUR' ? fx : 1), currency, 0);

  return (
    <Card title="Backtest d’un bot grid" subtitle={`Grille d’achat/vente testée sur l’historique réel (frais maker Binance VIP ${clampVip(vip)}${bnb ? ' + BNB −25 %' : ''} : ${fmtNum(makerFeePct, 3)} %) — le grid gagne en range, perd en tendance forte`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Actif"><Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SYMBOLS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</Select></Field>
        <Field label="Capital ($)"><NumberInput value={amount} onChange={setAmount} /></Field>
        <Field label="Nombre de lignes"><NumberInput value={grids} onChange={setGrids} /></Field>
        <Field label="Amplitude de la grille (± %)"><NumberInput value={spanPct} onChange={setSpanPct} /></Field>
      </div>
      {hist.isLoading && <div className="mt-3"><Spinner label="Chargement de l’historique…" /></div>}
      {hist.data && result && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">Trades exécutés</dt><dd className="tnum text-lg font-semibold text-ink">{result.trades} <span className="text-xs font-normal text-muted">(frais {money(result.feesUsd)})</span></dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">P&amp;L net de la grille</dt><dd className={`tnum text-lg font-semibold ${result.pnlPct >= 0 ? 'text-up' : 'text-down'}`}>{result.pnlPct >= 0 ? '+' : ''}{fmtNum(result.pnlPct, 1)} % <span className="text-xs font-normal text-muted">({money(result.pnlUsd)})</span></dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">Buy &amp; hold sur la période</dt><dd className={`tnum text-lg font-semibold ${result.hodlPct >= 0 ? 'text-up' : 'text-down'}`}>{result.hodlPct >= 0 ? '+' : ''}{fmtNum(result.hodlPct, 1)} %</dd></div>
          <div className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-muted">Grid vs HODL</dt><dd className={`tnum text-lg font-semibold ${result.vsHodlPts >= 0 ? 'text-up' : 'text-down'}`}>{result.vsHodlPts >= 0 ? '+' : ''}{fmtNum(result.vsHodlPts, 1)} pts {result.inRange ? <Badge tone="neutral">dans la grille</Badge> : <Badge tone="warn">sorti de la grille</Badge>}</dd></div>
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">
        Règle apprise : une grille placée autour du prix actuel gagne si le marché oscille (range) et perd si la tendance est forte dans un sens — elle vend tes hausses et rachète tes baisses. Hors de la grille, plus aucun ordre n’est passé. Les frais maker Binance (selon ton réglage VIP/BNB) sont déduits à chaque aller-retour.
      </p>
    </Card>
  );
}
