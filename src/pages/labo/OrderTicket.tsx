// Ticket d'ordre d'un portefeuille papier manuel : au marché, limite (achat), stop ou objectif (vente).

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../../store/useStore';
import { useMarkets } from '../../hooks/useMarket';
import { usePaperPrices } from '../../hooks/usePaperData';
import { pairOf } from '../../hooks/usePaperSettle';
import { getAllPrices } from '../../api/binance';
import { bookOf, marketOrder, ORDER_LIFETIME_DAYS, tradesOf } from '../../lib/lab/paperBook';
import { NO_HOURLY_TEXT } from '../../lib/lab/settle';
import { fmtNum, fmtPrice, uid } from '../../lib/format';
import { CoinPicker } from '../../components/CoinPicker';
import { Button, Card, Field, NumberInput, Segmented } from '../../components/ui';
import type { CoinRef, PaperOrder, PaperPortfolio } from '../../types';

type Kind = 'market' | 'limit' | 'stop' | 'target';

export function OrderTicket({ portfolio }: { portfolio: PaperPortfolio }) {
  const allTrades = useStore((s) => s.paperTrades);
  const upsertTrade = useStore((s) => s.upsertPaperTrade);
  const upsertOrder = useStore((s) => s.upsertPaperOrder);
  const markets = useMarkets();
  const [coin, setCoin] = useState<CoinRef | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [kind, setKind] = useState<Kind>('market');
  const [by, setBy] = useState<'usd' | 'qty'>('usd');
  const [amount, setAmount] = useState<number | ''>('');
  const [level, setLevel] = useState<number | ''>('');
  const [stop, setStop] = useState<number | ''>('');
  const [target, setTarget] = useState<number | ''>('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const prices = usePaperPrices(coin ? [coin.coinId] : []);
  const pairs = useQuery({ queryKey: ['binance-prices'], queryFn: getAllPrices, staleTime: 5 * 60_000 });
  const price = coin ? prices.get(coin.coinId) ?? null : null;
  const trades = tradesOf(allTrades, portfolio.id);
  const book = bookOf(portfolio, trades);
  const held = coin ? book.positions[coin.coinId]?.quantity ?? 0 : 0;
  const s = portfolio.costs.spreadPct / 100;
  const f = portfolio.costs.feePct / 100;
  const kinds: { value: Kind; label: string }[] = side === 'buy' ? [{ value: 'market', label: 'Au marché' }, { value: 'limit', label: 'Limite' }] : [{ value: 'market', label: 'Au marché' }, { value: 'target', label: 'Objectif' }, { value: 'stop', label: 'Stop' }];
  const k = kinds.some((x) => x.value === kind) ? kind : 'market';
  const execPrice = k === 'market' ? price : level === '' ? null : Number(level);
  const usd = amount === '' ? null : by === 'usd' ? Number(amount) : execPrice ? (Number(amount) * execPrice * (1 + s)) / (1 - f) : null;
  const rr = side === 'buy' && stop !== '' && target !== '' && execPrice ? (Number(target) - execPrice) / (execPrice - Number(stop)) : null;

  function submit() {
    setMsg(null);
    if (!coin) return setMsg({ tone: 'err', text: 'Choisis une crypto.' });
    const now = new Date().toISOString();
    if (k === 'market') {
      const r = marketOrder(portfolio, trades, { coin, side, usd: side === 'buy' && by === 'usd' ? Number(amount) || undefined : undefined, quantity: by === 'qty' || side === 'sell' ? (amount === '' ? (side === 'sell' ? undefined : 0) : Number(amount)) : undefined, stop: stop === '' ? undefined : Number(stop), target: target === '' ? undefined : Number(target) }, price ?? 0, now);
      if (r.error || !r.trade) return setMsg({ tone: 'err', text: r.error ?? 'Ordre impossible.' });
      upsertTrade(r.trade);
      for (const o of r.orders) upsertOrder(o);
      setMsg({ tone: 'ok', text: `${side === 'buy' ? 'Achat' : 'Vente'} de ${fmtNum(r.trade.quantity, 6)} ${coin.symbol.toUpperCase()} à ${fmtPrice(r.trade.priceUsd, 'USD')} (frais ${fmtNum(r.trade.feeUsd ?? 0)} USDC).` });
    } else {
      const pair = pairs.data ? pairOf(coin, pairs.data, price) : null;
      if (!pair) return setMsg({ tone: 'err', text: NO_HOURLY_TEXT });
      if (level === '' || !(Number(level) > 0)) return setMsg({ tone: 'err', text: 'Indique le prix de déclenchement.' });
      if (side === 'buy' && !(usd && usd > 0)) return setMsg({ tone: 'err', text: 'Indique un montant.' });
      if (side === 'sell' && !(held > 0)) return setMsg({ tone: 'err', text: 'Aucune position à vendre sur ce portefeuille.' });
      const o: PaperOrder = {
        id: uid(), portfolioId: portfolio.id, coinId: coin.coinId, symbol: coin.symbol, name: coin.name, side, type: k, price: Number(level),
        ...(side === 'buy' ? { usd: Math.round((usd ?? 0) * 100) / 100 } : amount !== '' ? { quantity: Number(amount) } : {}),
        ...(side === 'buy' && stop !== '' ? { attachStop: Number(stop) } : {}), ...(side === 'buy' && target !== '' ? { attachTarget: Number(target) } : {}),
        createdAt: now, expiresAt: new Date(Date.now() + ORDER_LIFETIME_DAYS * 86400_000).toISOString(), status: 'open',
      };
      upsertOrder(o);
      setMsg({ tone: 'ok', text: `Ordre posé : il s’exécutera si le cours ${side === 'buy' || k === 'stop' ? 'descend à' : 'monte à'} ${fmtPrice(o.price, 'USD')} (valable ${ORDER_LIFETIME_DAYS} jours).` });
    }
    setAmount(''); setLevel(''); setStop(''); setTarget('');
  }

  return (
    <Card title="Passer un ordre papier" subtitle={`Frais ${fmtNum(portfolio.costs.feePct, 2)} % + écart ${fmtNum(portfolio.costs.spreadPct, 2)} % par côté · cash ${fmtNum(book.cashUsd)} USDC`}>
      <div className="space-y-3">
        <Field label="Crypto"><CoinPicker value={coin} onChange={setCoin} /></Field>
        <p className="text-sm text-ink-2">{coin ? (price ? `1 ${coin.symbol.toUpperCase()} = ${fmtPrice(price, 'USD')}${held > 0 ? ` · tu en détiens ${fmtNum(held, 6)}` : ''}` : markets.isLoading ? 'Chargement du prix…' : 'Prix inconnu pour cette crypto.') : 'Choisis une crypto pour voir son prix.'}</p>
        <div className="flex flex-wrap gap-2">
          <Segmented value={side} onChange={(v) => setSide(v)} options={[{ value: 'buy', label: 'Acheter' }, { value: 'sell', label: 'Vendre' }]} />
          <Segmented value={k} onChange={setKind} options={kinds} />
        </div>
        {k !== 'market' && <Field label={k === 'limit' ? 'Acheter si le cours descend à ($)' : k === 'stop' ? 'Vendre si le cours descend à ($)' : 'Vendre si le cours monte à ($)'}><NumberInput value={level} onChange={setLevel} /></Field>}
        {side === 'buy' ? (
          <>
            <Segmented value={by} onChange={setBy} options={[{ value: 'usd', label: 'Montant (USDC)' }, { value: 'qty', label: 'Quantité' }]} />
            <Field label={by === 'usd' ? 'Montant (USDC, frais compris)' : `Quantité (${coin?.symbol.toUpperCase() ?? '—'})`}><NumberInput value={amount} onChange={setAmount} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stop ($, facultatif)"><NumberInput value={stop} onChange={setStop} /></Field>
              <Field label="Objectif ($, facultatif)"><NumberInput value={target} onChange={setTarget} /></Field>
            </div>
          </>
        ) : (
          <Field label={`Quantité (vide : toute la position)`}><NumberInput value={amount} onChange={setAmount} /></Field>
        )}
        {usd != null && execPrice != null && side === 'buy' && <p className="text-xs text-muted">≈ {fmtNum((usd * (1 - f)) / (execPrice * (1 + s)), 6)} reçus · frais {fmtNum(usd * f)} USDC · écart {fmtNum(usd * s)} USDC{rr != null && Number.isFinite(rr) ? ` · gain/risque ${fmtNum(rr, 2)} R` : ''}</p>}
        {msg && <p className={msg.tone === 'ok' ? 'text-sm text-good' : 'text-sm text-critical'}>{msg.text}</p>}
        <Button variant="primary" className="w-full" disabled={!coin} onClick={submit}>{k === 'market' ? (side === 'buy' ? 'Acheter (papier)' : 'Vendre (papier)') : 'Poser l’ordre'}</Button>
      </div>
    </Card>
  );
}
