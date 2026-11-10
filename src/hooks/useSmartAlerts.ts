// Alertes intelligentes : paliers de vente atteints, euphorie, échéance du panier, changement de zone du marché, bilan du dimanche.
// Elles se déclenchent tant que l'application tourne (même réduite dans la zone de notification sous Windows).

import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { useCycle } from './useMarket';
import { useNow } from './useClock';
import { useBasketDue } from './useBasket';
import { useExitPlan } from './useExitPlan';
import { notify } from '../lib/platform';
import { claimNotification, weekKey } from '../lib/notified';
import { fmtMoney, isoDay } from '../lib/format';

const DAY = 86400_000;

export function useSmartAlerts() {
  const notifications = useStore((s) => s.settings.notifications);
  const exit = useExitPlan();
  const bd = useBasketDue();
  const cycle = useCycle();
  // Réévaluation toutes les 30 minutes : le bilan du dimanche (18 h) et le changement de jour doivent aussi se déclencher application ouverte.
  const tick = useNow(30 * 60_000);

  useEffect(() => {
    if (!notifications) return;
    const fire = (key: string, ttl: number, title: string, body: string) => {
      if (claimNotification(key, ttl)) void notify(title, body);
    };
    for (const { coin, rung } of exit.pending) {
      fire(`exit:${coin.coinId}:${rung.multiple}`, 7 * DAY, `Palier ×${rung.multiple} atteint sur ${coin.symbol}`, `Vends ${rung.pct} % de ta position de départ (≈ ${fmtMoney(rung.valueUsd * exit.rate, exit.currency, 0)}). Ouvre Boussole.`);
    }
    if (exit.euphoria.active && exit.coins.some((c) => c.core)) fire(`euphoria:${weekKey()}`, 7 * DAY, 'Marché en euphorie', exit.euphoria.label);
    if (bd.due && bd.basket && bd.periodKey) fire(`basket:${bd.periodKey}`, 3 * DAY, 'Panier DCA : échéance du jour', `${bd.basket.amountUsd} USDC à répartir. Ouvre Boussole pour l’ordre du jour.`);

    const zone = cycle.data?.zone;
    if (zone) {
      let prev = '';
      try {
        prev = localStorage.getItem('boussole-zone') ?? '';
        localStorage.setItem('boussole-zone', zone.label);
      } catch { /* stockage indisponible */ }
      if (prev && prev !== zone.label) fire(`zone:${zone.label}:${isoDay()}`, DAY, `Le marché change de zone : ${zone.label}`, zone.action);
    }

    const now = tick;
    if (bd.basket && now.getDay() === 0 && now.getHours() >= 18) fire(`weekly:${weekKey(now)}`, 7 * DAY, 'Bilan de la semaine prêt', 'Ouvre le Cockpit : échéances, réserve, règles et écart avec Bitcoin.');
  }, [notifications, exit, bd, cycle.data, tick]);
}
