// Regrouper les poussières : convertir les petites lignes sans thèse vers Bitcoin, puis l'enregistrer au journal.

import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { newId, useStore } from '../store/useStore';
import { usePortfolio } from '../hooks/usePortfolio';
import { dustPlan } from '../lib/consolidate';
import { rulesOf } from '../lib/profile';
import { fmtMoney, fmtNum, isoDay } from '../lib/format';
import type { Transaction } from '../types';
import { Badge, Button, Card, CoinIcon, Field, Modal, NumberInput } from './ui';

export function ConsolidateCard() {
  const pf = usePortfolio();
  const profile = useStore((s) => s.profile);
  const theses = useStore((s) => s.theses);
  const basket = useStore((s) => s.basket);
  const accounts = useStore((s) => s.accounts);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number | ''>('');

  const plan = useMemo(() => dustPlan(
    pf.holdings.map((h) => ({ key: h.key, coinId: h.coinId, symbol: h.symbol, name: h.name, image: h.image, quantity: h.quantity, valueUsd: h.valueUsd, priceUsd: h.priceUsd, bucket: h.bucket, source: h.source })),
    {
      minLinePct: rulesOf(profile).minLinePct,
      thesisIds: new Set(theses.map((t) => t.coinId)),
      coreIds: new Set(['bitcoin', 'ethereum', ...(basket?.core.map((c) => c.coinId) ?? [])]),
      discoveryIds: new Set(basket?.discovery.map((c) => c.coinId) ?? []),
    },
  ), [pf.holdings, profile, theses, basket]);

  if (!plan.merge.length && !plan.reinforce.length) return null;
  const chosen = plan.merge.filter((l) => !skip.has(l.coinId));
  const chosenUsd = chosen.reduce((s, l) => s + l.valueUsd, 0);

  function confirm() {
    if (qty === '' || qty <= 0 || !chosen.length) return;
    const now = new Date();
    const accountId = basket?.accountId ?? accounts.find((a) => a.kind === 'exchange')?.id;
    const common = { date: isoDay(now), time: now.toISOString(), currency: 'USD' as const, fee: 0, fxEurPerUsd: pf.fx, source: 'manual' as const, accountId };
    const txs: Transaction[] = [];
    for (const l of chosen) {
      txs.push({ id: newId(), coinId: l.coinId, symbol: l.symbol, name: l.name, image: l.image, type: 'sell', quantity: l.quantity, price: l.priceUsd ?? 0, toFiat: false, note: 'Regroupement vers Bitcoin', ...common });
    }
    txs.push({ id: newId(), coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', type: 'buy', quantity: Number(qty), price: chosenUsd / Number(qty), fromFiat: false, note: 'Regroupement des petites lignes', ...common });
    useStore.getState().addTransactions(txs); // une seule écriture : le regroupement entre en entier ou pas du tout
    setOpen(false);
    setQty('');
  }

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Layers className="size-4 text-accent" />Petites lignes à regrouper</span>}
      subtitle={`Moins de ${String(rulesOf(profile).minLinePct).replace('.', ',')} % du portefeuille chacune, sans thèse écrite ni place dans ton panier`}
      actions={plan.merge.length > 0 && <Button size="sm" variant="primary" disabled={!chosen.length} onClick={() => setOpen(true)}>J’ai regroupé vers Bitcoin</Button>}
    >
      {plan.merge.length > 0 && (
        <>
          <ul className="divide-y divide-line text-sm">
            {plan.merge.map((l) => (
              <li key={l.coinId} className="flex items-center gap-3 py-2">
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!skip.has(l.coinId)} aria-label={`Regrouper ${l.symbol}`} onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(l.coinId)) n.delete(l.coinId); else n.add(l.coinId); return n; })} />
                <CoinIcon src={l.image} symbol={l.symbol} size={20} />
                <span className="min-w-0 flex-1 truncate text-ink">{l.symbol} <span className="text-xs text-muted">{l.name}</span></span>
                <span className="tnum text-ink-2">{fmtMoney(l.valueUsd * pf.rate, pf.currency, 2)}</span>
                <span className="tnum w-14 text-right text-xs text-muted">{fmtNum(l.pct, 2)} %</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-2">À regrouper : <b className="text-ink">{fmtMoney(chosenUsd * pf.rate, pf.currency, 2)}</b> sur {chosen.length} ligne{chosen.length > 1 ? 's' : ''}. À ce poids, même un ×10 ne change presque rien, et chaque achat paie l’écart de prix de l’application.</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted">
            <li>Dans l’application où tu détiens ces lignes, convertis-les vers Bitcoin (échange de crypto contre crypto).</li>
            <li>Reviens ici, clique « J’ai regroupé vers Bitcoin » et saisis la quantité de Bitcoin reçue : les ventes et l’achat sont enregistrés pour toi.</li>
          </ol>
        </>
      )}
      {plan.reinforce.length > 0 && (
        <p className={`text-xs text-ink-2 ${plan.merge.length ? 'mt-3 border-t border-line pt-3' : ''}`}>
          <Badge tone="accent">Panier</Badge> {plan.reinforce.map((l) => l.symbol).join(', ')} : dans ta liste découverte, le panier la renforce avant d’en ouvrir une autre.
        </p>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Enregistrer le regroupement vers Bitcoin"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" disabled={qty === '' || qty <= 0} onClick={confirm}>Enregistrer</Button></>}>
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{chosen.length} ligne{chosen.length > 1 ? 's' : ''} vendue{chosen.length > 1 ? 's' : ''} (échange de crypto contre crypto) pour environ {fmtMoney(chosenUsd * pf.rate, pf.currency, 2)}.</p>
          <Field label="Quantité de Bitcoin reçue (BTC)" hint="Lis-la dans la confirmation de l’application."><NumberInput value={qty} onChange={setQty} placeholder="0,0003" /></Field>
        </div>
      </Modal>
    </Card>
  );
}
