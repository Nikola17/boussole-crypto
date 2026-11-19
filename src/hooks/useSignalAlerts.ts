// Alertes de signal en notification locale : seulement quand le serveur veilleur est muet depuis 45 minutes
// (sinon Telegram s'en charge). Cryptos détenues et suivies, signaux v2 sur bougies closes, une fois par jour.

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useCycle, useScan } from './useMarket';
import { useFocusCoins } from './useGuidance';
import { useNow } from './useClock';
import { fetchRaw } from '../lib/sync/github';
import { notify } from '../lib/platform';
import { buildWebhookPayload, fireWebhook } from '../lib/webhook';
import { claimNotification } from '../lib/notified';
import { isoDay } from '../lib/format';
import { localSignalStep, runnerSilent, type StoredSignals } from '../lib/signalAlerts';
import { signalKeysOf, signalMessage } from '../runner/signals';
import { reliabilityOf, reliabilityPhrase } from '../lib/lab/reliability';

const KEY = 'boussole-signal-alerts';
const DAY = 86400_000;

export function useSignalAlerts() {
  const notifications = useStore((s) => s.settings.notifications);
  const { syncEnabled, syncRepo, syncToken } = useStore((s) => s.settings);
  const vacationUntil = useStore((s) => s.profile.vacationUntil);
  const cycle = useCycle();
  const focus = useFocusCoins();
  const scan = useScan(focus, cycle.data?.temperature, notifications);
  const tick = useNow(30 * 60_000);
  const syncReady = syncEnabled && !!syncRepo.trim() && !!syncToken.trim();
  const hb = useQuery({
    queryKey: ['watch-heartbeat'],
    queryFn: () => fetchRaw(syncRepo, 'heartbeat.json', syncToken),
    enabled: notifications && syncReady,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!notifications || !scan.data || (syncReady && hb.isLoading)) return;
    // Bougie journalière close à 0 h UTC : le jour UTC fait foi, comme sur le serveur.
    const day = tick.toISOString().slice(0, 10);
    if (tick.getUTCHours() * 60 + tick.getUTCMinutes() < 10) return;
    const today: Record<string, { symbol: string; keys: string[] }> = {};
    for (const c of focus) {
      const a = scan.data.get(c.id);
      if (a) today[c.id] = { symbol: c.symbol, keys: signalKeysOf({ investor: a.investor.label, setups: a.setups.map((s) => s.key) }) };
    }
    let stored: StoredSignals | null = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StoredSignals | null; } catch { stored = null; }
    const silent = !syncReady || runnerSilent(hb.data, tick.getTime());
    const { next, events } = localSignalStep(stored, today, day, silent);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
    if (vacationUntil && isoDay() <= vacationUntil) return;
    for (const e of events) {
      if (!claimNotification(e.key, 30 * DAY)) continue;
      const [title, body] = signalMessage(e, reliabilityPhrase(reliabilityOf(e.signal))).split('\n');
      void notify(title, body ?? '');
      const wh = useStore.getState().settings.webhookUrl;
      if (wh) void fireWebhook(wh, buildWebhookPayload('signal_alert', title, body ?? '', { signal: e.signal, symbol: e.symbol }));
    }
  }, [notifications, scan.data, focus, syncReady, hb.isLoading, hb.data, tick, vacationUntil]);
}
