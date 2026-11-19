// « Et si ? » : rejoue les décisions passées du journal avec les prix d'aujourd'hui.
// Ce que tes ventes t'ont coûté (vs garder), ce que tes achats t'ont rapporté.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useFx, useMarkets } from '../hooks/useMarket';
import { whatIfTransactions } from '../lib/whatif';
import { fmtMoney, fmtPct, fmtDate } from '../lib/format';
import { Card } from './ui';
import { useT } from '../hooks/useT';

export function WhatIfPanel() {
  const t = useT();
  const txs = useStore((s) => s.transactions);
  const currency = useStore((s) => s.settings.currency);
  const markets = useMarkets();
  const fx = useFx();

  const summary = useMemo(() => {
    const byId = new Map((markets.data ?? []).map((m) => [m.id, m.current_price]));
    return whatIfTransactions(txs, (id) => byId.get(id) ?? null, fx);
  }, [txs, markets.data, fx]);

  const top = useMemo(
    () => [...summary.rows.filter((r) => r.delta != null)].sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, 5),
    [summary.rows],
  );

  if (!summary.rows.length) {
    return (
      <Card title={t('Et si ?')} subtitle={t('Rejoue tes décisions passées avec les prix d’aujourd’hui')}>
        <p className="text-sm text-muted">{t('Ajoute des transactions pour voir ce que tes achats/ventes auraient donné aujourd’hui.')}</p>
      </Card>
    );
  }

  return (
    <Card title={t('Et si ?')} subtitle={t('Rejoue tes décisions passées avec les prix d’aujourd’hui')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="text-xs text-muted">{t('Coût de tes ventes (vs garder)')}</div>
          <div className={`tnum text-lg font-semibold ${summary.costOfSelling != null && summary.costOfSelling > 0 ? 'text-down' : 'text-up'}`}>
            {summary.costOfSelling == null ? '—' : fmtMoney(summary.costOfSelling, currency, 0)}
          </div>
          <div className="text-xs text-muted">{t('Positif = vendre t’a coûté ce montant par rapport à garder.')}</div>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="text-xs text-muted">{t('Gain de tes achats')}</div>
          <div className={`tnum text-lg font-semibold ${summary.gainOfBuying != null && summary.gainOfBuying >= 0 ? 'text-up' : 'text-down'}`}>
            {summary.gainOfBuying == null ? '—' : fmtMoney(summary.gainOfBuying, currency, 0)}
          </div>
          <div className="text-xs text-muted">{t('Ce que tu as acheté vaut aujourd’hui, moins ce que tu as payé.')}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {top.map((r) => (
          <li key={r.txId} className="flex items-center justify-between gap-3 rounded-lg border border-line p-2.5 text-sm">
            <div className="min-w-0">
              <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${r.type === 'buy' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
                {r.type === 'buy' ? t('Achat') : t('Vente')}
              </span>
              <span className="font-medium text-ink">{r.symbol.toUpperCase()}</span>
              <span className="ml-2 text-xs text-muted">{fmtDate(new Date(r.date))} · {fmtMoney(r.amountAtTx, currency, 0)}</span>
            </div>
            <div className="text-right">
              <div className={`tnum font-medium ${r.delta != null && (r.type === 'buy' ? r.delta >= 0 : r.delta <= 0) ? 'text-up' : 'text-down'}`}>
                {r.delta == null ? '—' : `${r.delta >= 0 ? '+' : ''}${fmtMoney(r.delta, currency, 0)}`}
              </div>
              <div className="text-xs text-muted">
                {r.valueNow == null ? t('prix inconnu') : `${t('vaut')} ${fmtMoney(r.valueNow, currency, 0)}`}
                {r.delta != null && r.amountAtTx > 0 ? ` (${fmtPct((r.delta / r.amountAtTx) * 100, 1, true)})` : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        {t('Lecture : une vente avec un delta positif a « coûté » ce montant (garder aurait mieux valu) ; un achat avec un delta positif a gagné ce montant. Hors frais de plateforme et impôts.')}
      </p>
    </Card>
  );
}
