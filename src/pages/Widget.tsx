// Widget Windows : petite fenêtre toujours-au-dessus (BTC, Fear & Greed, alertes, échéance du jour).
// Route spéciale « #/widget » : rendue sans la barre de navigation, avec une zone de déplacement en haut.

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { useFearGreed, useFx, usePrices } from '../hooks/useMarket';
import { usePortfolio } from '../hooks/usePortfolio';
import { useToday } from '../hooks/useClock';
import { fmtPct, fmtPrice } from '../lib/format';
import { isScheduledDay } from '../lib/dca';
import { isBasketDay } from '../lib/basket';
import { useT } from '../hooks/useT';

export default function Widget() {
  const t = useT();
  const currency = useStore((s) => s.settings.currency);
  const alerts = useStore((s) => s.alerts);
  const plans = useStore((s) => s.dcaPlans);
  const basket = useStore((s) => s.basket);
  const fx = useFx();
  const btc = usePrices(['bitcoin']);
  const fng = useFearGreed(2);
  const { totals } = usePortfolio();
  const today = useToday();

  const btcPrice = btc.data?.bitcoin;
  const btcUsd = btcPrice?.usd ?? null;
  const btcShown = btcUsd != null ? (currency === 'EUR' ? btcUsd * fx : btcUsd) : null;
  const btcChange = btcPrice?.usd_24h_change ?? null;
  const fngLast = fng.data?.[fng.data.length - 1];
  const fngValue = fngLast?.value ?? null;
  const fngLabel = fngLast?.label ?? '';
  const armed = useMemo(() => alerts.filter((a) => a.active && !a.triggeredAt).length, [alerts]);
  const dueToday = useMemo(() => {
    const out: string[] = [];
    if (basket?.active && isBasketDay(basket, today)) out.push(t('Panier'));
    for (const p of plans.filter((x) => x.active)) if (isScheduledDay(p, today)) out.push('DCA');
    return out;
  }, [basket, plans, today, t]);

  const fngColor = fngValue == null ? 'text-muted' : fngValue <= 25 ? 'text-down' : fngValue >= 75 ? 'text-up' : 'text-ink';

  return (
    <div className="flex h-dvh select-none flex-col overflow-hidden bg-surface text-ink" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <img src="./icon.svg" alt="" className="size-4" />
        <span className="text-xs font-semibold">Boussole</span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-3 py-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">BTC</span>
          <span className="text-sm font-semibold">
            {btcShown != null ? fmtPrice(btcShown, currency) : '—'}
            {btcChange != null && <span className={`ml-1.5 text-xs ${btcChange >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(btcChange, 1, true)}</span>}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">{t('Fear & Greed')}</span>
          <span className={`text-sm font-semibold ${fngColor}`}>{fngValue != null ? `${fngValue} · ${fngLabel}` : '—'}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted">{t('Portefeuille')}</span>
          <span className="text-sm font-semibold">{totals ? fmtPrice(totals.value, currency) : '—'}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5 text-[0.7rem] text-muted">
          <span>{armed > 0 ? `${armed} ${t('alertes armées')}` : t('Aucune alerte')}</span>
          <span>{dueToday.length ? `${t('Aujourd’hui')} : ${dueToday.join(' · ')}` : ''}</span>
        </div>
      </div>
    </div>
  );
}
