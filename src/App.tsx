import { lazy, Suspense, useEffect, useRef } from 'react';
import { Compass, ShieldCheck } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from './store/useStore';
import { matchRoute, useHashPath } from './router';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { setCoinGeckoKey } from './api/coingecko';
import { setCoinGeckoKeyPresent } from './api/http';
import { useMarkets } from './hooks/useMarket';
import { useBriefing } from './hooks/useBriefing';
import { ensureNotificationPermission, isNative, notify, scheduleDcaReminders, syncDesktop } from './lib/platform';
import { useSmartAlerts } from './hooks/useSmartAlerts';
import { useExitPlan } from './hooks/useExitPlan';
import { syncRunner, watchAlerts } from './lib/runnerSync';
import { fmtPrice, isoDay } from './lib/format';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAutoBackup } from './hooks/useBackup';
import Dashboard from './pages/Dashboard';

const Market = lazy(() => import('./pages/Market'));
const CoinDetail = lazy(() => import('./pages/CoinDetail'));
const Gems = lazy(() => import('./pages/Gems'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
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
  const briefingAuto = useStore((s) => s.settings.briefingAuto);
  const alerts = useStore((s) => s.alerts);
  const upsertAlert = useStore((s) => s.upsertAlert);
  const plans = useStore((s) => s.dcaPlans);
  const basket = useStore((s) => s.basket);
  const markets = useMarkets();
  const briefing = useBriefing();
  const autoDone = useRef(false);
  const closeToTray = useStore((s) => s.settings.closeToTray);
  const autoStart = useStore((s) => s.settings.autoStart);
  useSmartAlerts();
  useAutoBackup();
  const exit = useExitPlan();

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

  // Vérification des alertes à chaque rafraîchissement du marché
  useEffect(() => {
    if (!markets.data) return;
    const prices = new Map(markets.data.map((m) => [m.id, m.current_price]));
    for (const a of alerts) {
      if (!a.active || a.triggeredAt) continue;
      const p = prices.get(a.coinId);
      if (p == null) continue;
      const hit = a.condition === 'above' ? p >= a.priceUsd : p <= a.priceUsd;
      if (hit) {
        upsertAlert({ ...a, triggeredAt: new Date().toISOString(), active: false });
        if (notifications) void notify(`Alerte ${a.symbol.toUpperCase()}`, `${a.name} est passé ${a.condition === 'above' ? 'au-dessus' : 'en dessous'} de ${fmtPrice(a.priceUsd, 'USD')} (cours : ${fmtPrice(p, 'USD')}).`);
      }
    }
  }, [markets.data, alerts, upsertAlert, notifications]);

  // Android : l'état à surveiller (alertes de prix, paliers de vente) est confié au script d'arrière-plan.
  useEffect(() => {
    if (!isNative || !notifications) return;
    const exits = exit.coins.flatMap((c) => c.rungs.filter((r) => !r.done).map((r) => ({ coinId: c.coinId, symbol: c.symbol, multiple: r.multiple, pct: r.pct, targetUsd: r.targetPrice }))).slice(0, 60);
    void syncRunner({ alerts: watchAlerts(alerts), exits }, (ids) => {
      for (const id of ids) {
        const a = alerts.find((x) => x.id === id);
        if (a && !a.triggeredAt) upsertAlert({ ...a, triggeredAt: new Date().toISOString(), active: false });
      }
    });
  }, [alerts, exit.coins, notifications, upsertAlert]);

  // Rappels DCA programmés (Android)
  useEffect(() => {
    if (notifications) void scheduleDcaReminders(plans, currency === 'EUR' ? '€' : '$', basket);
  }, [plans, basket, notifications, currency]);

  // Brief automatique, une fois par jour
  useEffect(() => {
    if (!briefingAuto || autoDone.current || !briefing.cfg || !briefing.ready || briefing.todays || briefing.running) return;
    let last = '';
    try { last = localStorage.getItem('boussole-auto-brief') ?? ''; } catch { /* ignore */ }
    if (last === isoDay()) return;
    autoDone.current = true;
    try { localStorage.setItem('boussole-auto-brief', isoDay()); } catch { /* ignore */ }
    void briefing.generate().then((r) => {
      if (r && notifications) void notify('Ton brief du jour est prêt', 'Ouvre Boussole pour découvrir quoi faire aujourd’hui.');
    });
  }, [briefingAuto, briefing, notifications]);

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
          <p>Boussole est un outil d’aide à la décision et d’éducation, <b className="text-ink">pas un conseiller financier agréé</b>. Aucun indicateur ni aucune IA ne prédit le marché avec certitude. Les cryptoactifs peuvent perdre la majeure partie de leur valeur : n’investis que ce que tu peux te permettre de perdre. Tes données restent sur ton appareil.</p>
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
  const { path } = useHashPath();
  if (!accepted) return <Welcome />;
  return (
    <Layout>
      <AppEffects />
      <ErrorBoundary scope="page" resetKey={path}>
        <Suspense fallback={<Spinner label="Chargement…" />}>
          <Routes />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
