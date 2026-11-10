// Horloge de l'application : une application laissée ouverte plusieurs jours (zone de notification sous Windows) doit savoir
// quand le jour change. Avant, « aujourd'hui » était figé au premier calcul : l'échéance du panier, le bilan et le brief ne bougeaient plus.

import { useEffect, useState } from 'react';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Date de « maintenant », rafraîchie toutes les `everyMs` et au retour sur l'application (fenêtre réaffichée). */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, everyMs);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', tick); };
  }, [everyMs]);
  return now;
}

/**
 * Le jour courant, à minuit local : l'objet ne change qu'au changement de jour (même référence entre-temps),
 * ce qui permet de s'en servir comme dépendance sans recalculer à chaque minute.
 */
export function useToday(): Date {
  const now = useNow(60_000);
  const key = startOfDay(now).getTime();
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    setToday((prev) => (prev.getTime() === key ? prev : new Date(key)));
  }, [key]);
  return today;
}
