import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Compass, ShieldCheck } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from './store/useStore';
import { matchRoute, useHashPath } from './router';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { setCoinGeckoKey } from './api/coingecko';
import { setCoinGeckoKeyPresent } from './api/http';
import { useFx, useMarkets, usePrices } from './hooks/useMarket';
import { useToday } from './hooks/useClock';
import { aiReady } from './ai/run';
import { alertCoinsToFetch, checkPriceAlerts } from './lib/alerts';
import { useBriefing } from './hooks/useBriefing';
import { cancelDcaReminders, ensureNotificationPermission, isNative, notify, scheduleDcaReminders, syncDesktop } from './lib/platform';
import { useSmartAlerts } from './hooks/useSmartAlerts';
import { useExitPlan } from './hooks/useExitPlan';
import { EMPTY_WATCH, syncRunner, watchAlerts } from './lib/runnerSync';
import { fmtPrice, isoDay } from './lib/format';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAutoBackup } from './hooks/useBackup';
import { useSyncLifecycle } from './hooks/useSync';
import { loadSecrets } from './lib/secure';
import Dashboard from './pages/Dashboard';

const Market = lazy(() => import('./pages/Market'));
const CoinDetail = lazy(() => import('./pages/CoinDetail'));
const Gems = lazy(() => import('./pages/Gems'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Paper = lazy(() => import('./pages/Paper'));
const Smart = lazy(() => import('./pages/Smart'));
const Dca = lazy(() => import('./pages/Dca'));
const Trading = lazy(() => import('./pages/Trading'));
const Airdrops = lazy(() => import('./pages/Airdrops'));
const Defi = lazy(() => import('./pages/Defi'));
const Advisor = lazy(() => import('./pages/Advisor'));
const Guide = lazy(() => import('./pages/Guide'));
const Settings = lazy(() => import('./pages/Settings'));

function Routes() {
  const { path } = useHashPath();
  const coin = matchRoute('/coin/:id', path);
  if (coin) return <CoinDetail key={coin.id} id={coin.id} />;
  switch (path) {
    case '/marche': return <Market />;
    case '/pepites': return <Gems />;
    case '/portefeuille': return <Portfolio />;
    case '/papier': return <Paper />;
    case '/smart': return <Smart />;
    case '/dca': return <Dca />;
    case '/trading': return <Trading />;
    case '/airdrops': return <Airdrops />;
    case '/defi': return <Defi />;
    case '/ia': return <Advisor />;
    case '/guide': return <Guide />;
    case '/reglages': return <Settings />;
    default: return <Dashboard />;
  }
}

/** Effets globaux : thème, clés, alertes de prix, rappels DCA, brief automatique, bouton retour Android. */
function AppEffects() {
  const theme = useStore((s) => s.settings.theme);
  const cgKey = useStore((s) => s.settings.coingeckoKey);
  const notifications = useStore((s) => s.settings.notifications);
  const currency = useStore((s) => s.settings.currency);
  const cgKeySetting = useStore((s) => s.settings.coingeckoKey);
  const alerts = useStore((s) => s.alerts);
  const upsertAlert = useStore((s) => s.upsertAlert);
  const plans = useStore((s) => s.dcaPlans);
  const basket = useStore((s) => s.basket);
  const markets = useMarkets();
  // Alarmes notifiées dans la devise affichée (EUR par défaut) : le taux du jour est appliqué aux montants en $.
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  // Alertes sur une petite capitalisation : leur prix n'est pas dans le top 250 déjà chargé, on le demande à part.
  const marketIds = useMemo(() => new Set((markets.data ?? []).map((m) => m.id)), [markets.data]);
  const extraAlertPrices = usePrices(useMemo(() => alertCoinsToFetch(alerts, marketIds), [alerts, marketIds]));
  const closeToTray = useStore((s) => s.settings.closeToTray);
  const autoStart = useStore((s) => s.settings.autoStart);
  useSmartAlerts();
  useAutoBackup();
  useSyncLifecycle();
  const exit = useExitPlan();

  // Windows : les clés et phrases secrètes sont chiffrées par le système et rangées à part ; on les restitue au démarrage.
  useEffect(() => {
    void loadSecrets().then((sec) => {
      if (Object.keys(sec).length) useStore.getState().setSettings(sec);
    });
  }, []);

  // Les alertes ne servent à rien sans l'autorisation du système : on la demande une fois, au démarrage.
  useEffect(() => {
    if (notifications) void ensureNotificationPermission();
  }, [notifications]);

  // Windows : zone de notification et démarrage avec la session (pris en charge par le processus principal).
  useEffect(() => {
    void syncDesktop({ closeToTray, autoStart });
  }, [closeToTray, autoStart]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    if (isNative) {
      // Icônes de la barre d'état claires sur fond sombre, et inversement.
      const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
      void SystemBars.setStyle({ style }).catch(() => undefined);
    }
  }, [theme]);

  useEffect(() => {
    setCoinGeckoKey(cgKey);
    setCoinGeckoKeyPresent(!!cgKey);
  }, [cgKey]);

  // Vérification des alertes à chaque rafraîchissement du marché (top 250) ou des prix demandés à part.
  useEffect(() => {
    if (!markets.data && !extraAlertPrices.data) return;
    const prices = new Map<string, number>();
    for (const [id, v] of Object.entries(extraAlertPrices.data ?? {})) if (typeof v.usd === 'number') prices.set(id, v.usd);
    for (const m of markets.data ?? []) prices.set(m.id, m.current_price);
    for (const { alert: a, price: p } of checkPriceAlerts(alerts, prices)) {
      upsertAlert({ ...a, triggeredAt: new Date().toISOString(), active: false });
      if (notifications) void notify(`Alerte ${a.symbol.toUpperCase()}`, `${a.name} est passé ${a.condition === 'above' ? 'au-dessus' : 'en dessous'} de ${fmtPrice(a.priceUsd * rate, currency)} (cours : ${fmtPrice(p * rate, currency)}).`);
    }
  }, [markets.data, extraAlertPrices.data, alerts, upsertAlert, notifications, currency, rate]);

  // Android : l'état à surveiller (alertes de prix, paliers de vente) est confié au script d'arrière-plan.
  // Notifications désactivées : le script ne surveille plus rien et les rappels déjà programmés sont annulés (avant, ils continuaient).
  useEffect(() => {
    if (!isNative) return;
    if (!notifications) {
      void syncRunner(EMPTY_WATCH, () => undefined);
      void cancelDcaReminders();
      return;
    }
    const exits = exit.coins.flatMap((c) => c.rungs.filter((r) => !r.done).map((r) => ({ coinId: c.coinId, symbol: c.symbol, multiple: r.multiple, pct: r.pct, targetUsd: r.targetPrice }))).slice(0, 60);
    void syncRunner({ alerts: watchAlerts(alerts), exits, cgKey: cgKeySetting || undefined, currency, fxRate: rate }, (ids) => {
      for (const id of ids) {
        const a = alerts.find((x) => x.id === id);
        if (a && !a.triggeredAt) upsertAlert({ ...a, triggeredAt: new Date().toISOString(), active: false });
      }
    });
  }, [alerts, exit.coins, notifications, upsertAlert, cgKeySetting, currency, rate]);

  // Rappels DCA programmés (Android) — en vacances, seuls les jours au retour sont rappelés.
  const vacationUntil = useStore((s) => s.profile.vacationUntil);
  useEffect(() => {
    if (!notifications) return;
    const today = new Date().toISOString().slice(0, 10);
    void scheduleDcaReminders(plans, currency === 'EUR' ? '€' : '$', basket, vacationUntil && vacationUntil >= today ? vacationUntil : undefined);
  }, [plans, basket, notifications, currency, vacationUntil]);

  // Bouton retour Android : navigation arrière, puis fermeture
  useEffect(() => {
    if (!isNative) return;
    const h = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.location.hash && window.location.hash !== '#/') window.history.back();
      else void CapApp.exitApp();
    });
    return () => { void h.then((x) => x.remove()); };
  }, []);

  return null;
}

/**
 * Brief automatique, une fois par jour. Ce composant n'est monté QUE si le brief automatique est activé et qu'une clé d'IA est configurée :
 * il construit tout le contexte de l'IA (marché, portefeuille, signaux) et retardait sinon le taux EUR/USD d'au moins 18 secondes au démarrage.
 */
function AutoBrief() {
  const briefing = useBriefing();
  const notifications = useStore((s) => s.settings.notifications);
  const today = useToday();
  const lastRun = useRef('');
  useEffect(() => {
    const day = isoDay(today);
    if (lastRun.current === day || !briefing.cfg || !briefing.ready || briefing.todays || briefing.running) return;
    let last = '';
    try { last = localStorage.getItem('boussole-auto-brief') ?? ''; } catch { /* ignore */ }
    lastRun.current = day;
    if (last === day) return;
    try { localStorage.setItem('boussole-auto-brief', day); } catch { /* ignore */ }
    void briefing.generate().then((r) => {
      if (r && notifications) void notify('Ton brief du jour est prêt', 'Ouvre Boussole pour découvrir quoi faire aujourd’hui.');
    });
  }, [briefing, notifications, today]);
  return null;
}

function Welcome() {
  const set = useStore((s) => s.setSettings);
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-white"><Compass className="size-7" /></span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Bienvenue dans Boussole</h1>
            <p className="text-sm text-muted">Ton copilote d’investissement crypto</p>
          </div>
        </div>
        <ul className="mt-6 space-y-3 text-sm text-ink-2">
          <li>📈 Des signaux d’achat et de vente <b className="text-ink">expliqués</b>, pour l’investisseur et le trader.</li>
          <li>💎 Un détecteur de pépites avec <b className="text-ink">scan anti-arnaque</b>.</li>
          <li>🔁 DCA intelligent, suivi de wallet, journal de trading, airdrops.</li>
          <li>🤖 Une IA qui rédige ton <b className="text-ink">brief quotidien</b> et réunit un comité inspiré de Buffett et Munger.</li>
        </ul>
        <div className="mt-6 flex gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warn" />
          <p>Boussole est un outil d’aide à la décision et d’éducation, <b className="text-ink">pas un conseiller financier agréé</b>. Aucun indicateur ni aucune IA ne prédit le marché avec certitude. Les cryptoactifs peuvent perdre la majeure partie de leur valeur : n’investis que ce que tu peux te permettre de perdre. Tes données sont stockées sur ton appareil ; les analyses IA envoient un résumé de ton dossier au fournisseur choisi (contenu visible dans Réglages).</p>
        </div>
        <Button variant="primary" className="mt-6 w-full" onClick={() => { set({ disclaimerAccepted: true }); window.location.hash = '/guide'; }}>
          J’ai compris, je configure mon profil
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const accepted = useStore((s) => s.settings.disclaimerAccepted);
  const autoBrief = useStore((s) => s.settings.briefingAuto && aiReady(s.settings));
  const { path } = useHashPath();
  if (!accepted) return <Welcome />;
  return (
    <Layout>
      <AppEffects />
      {autoBrief && <AutoBrief />}
      <ErrorBoundary scope="page" resetKey={path}>
        <Suspense fallback={<Spinner label="Chargement…" />}>
          <Routes />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
