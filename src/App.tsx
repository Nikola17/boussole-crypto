import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useStore } from './store/useStore';
import { matchRoute, useHashPath } from './router';
import { Layout } from './components/Layout';
import { Button, Spinner } from './components/ui';
import { Compass } from 'lucide-react';
import { setCoinGeckoKey } from './api/coingecko';
import { setCoinGeckoKeyPresent } from './api/http';
import { useFx, useMarkets, usePrices } from './hooks/useMarket';
import { useToday } from './hooks/useClock';
import { aiReady } from './ai/run';
import { alertCoinsToFetch, checkPriceAlerts } from './lib/alerts';
import { buildWebhookPayload, fireWebhook } from './lib/webhook';
import { useBriefing } from './hooks/useBriefing';
import { cancelDcaReminders, ensureNotificationPermission, installUpdate, isNative, lockAvailable, notify, openExternal, scheduleDcaReminders, syncDesktop, unlockApp } from './lib/platform';
import { useSmartAlerts } from './hooks/useSmartAlerts';
import { resolveRoute } from './lib/routes';
import { useSignalAlerts } from './hooks/useSignalAlerts';
import { usePickSnapshots } from './hooks/usePickSnapshots';
import { useExitPlan } from './hooks/useExitPlan';
import { EMPTY_WATCH, syncRunner, watchAlerts } from './lib/runnerSync';
import { fmtPrice, isoDay } from './lib/format';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAutoBackup } from './hooks/useBackup';
import { useSyncLifecycle } from './hooks/useSync';
import { updateAssetUrl, useLatestVersion } from './hooks/useUpdate';
import { loadSecrets, saveSecrets, secretsSealed } from './lib/secure';
import Dashboard from './pages/Dashboard';
import Widget from './pages/Widget';
import { usePaperSettle } from './hooks/usePaperSettle';
import { useAutopilot } from './hooks/useAutopilot';
import { useSnapshots } from './hooks/useSnapshots';

const Market = lazy(() => import('./pages/Market'));
const CoinDetail = lazy(() => import('./pages/CoinDetail'));
const Gems = lazy(() => import('./pages/Gems'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Labo = lazy(() => import('./pages/Labo'));
const Dca = lazy(() => import('./pages/Dca'));
const Trading = lazy(() => import('./pages/Trading'));
const More = lazy(() => import('./pages/More'));
const Defi = lazy(() => import('./pages/Defi'));
const Advisor = lazy(() => import('./pages/Advisor'));
const Guide = lazy(() => import('./pages/Guide'));
const Settings = lazy(() => import('./pages/Settings'));

function Routes() {
  const { path } = useHashPath();
  const coin = matchRoute('/coin/:id', path);
  if (coin) return <CoinDetail key={coin.id} id={coin.id} />;
  const r = resolveRoute(path);
  switch (r.page) {
    case 'marche': return <Market />;
    case 'pepites': return <Gems initialTab={r.tab as 'smart' | 'airdrops' | undefined} />;
    case 'portefeuille': return <Portfolio />;
    case 'labo': return r.tab === 'papier' ? <Labo initialTab="papier" /> : <Labo />;
    case 'dca': return <Dca />;
    case 'trading': return <Trading />;
    case 'defi': return <Defi />;
    case 'ia': return <Advisor />;
    case 'plus': return <More />;
    case 'guide': return <Guide />;
    case 'reglages': return <Settings />;
    default: return <Dashboard />;
  }
}

/** Effets globaux : thème, clés, alertes de prix, rappels DCA, brief automatique, bouton retour Android. */
function AppEffects() {
  const theme = useStore((s) => s.settings.theme);
  const cgKey = useStore((s) => s.settings.coingeckoKey);
  const notifications = useStore((s) => s.settings.notifications);
  const webhookUrl = useStore((s) => s.settings.webhookUrl);
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
  useSignalAlerts();
  usePaperSettle();
  useAutopilot();
  useSnapshots();
  usePickSnapshots();
  useAutoBackup();
  useSyncLifecycle();
  const exit = useExitPlan();

  // Windows et Android : les clés et phrases secrètes sont chiffrées par le système (safeStorage / keystore)
  // et rangées à part ; on les restitue au démarrage — et on rescelle ce qui pourrait rester en clair.
  useEffect(() => {
    void loadSecrets().then((sec) => {
      if (Object.keys(sec).length) useStore.getState().setSettings(sec);
      if (secretsSealed()) saveSecrets(useStore.getState().settings); // première exécution sur Android : on scelle l'existant
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
      const title = `Alerte ${a.symbol.toUpperCase()}`;
      const body = `${a.name} est passé ${a.condition === 'above' ? 'au-dessus' : 'en dessous'} de ${fmtPrice(a.priceUsd * rate, currency)} (cours : ${fmtPrice(p * rate, currency)}).`;
      if (notifications) void notify(title, body);
      if (webhookUrl) void fireWebhook(webhookUrl, buildWebhookPayload('price_alert', title, body, { symbol: a.symbol, coinId: a.coinId, condition: a.condition, triggerUsd: a.priceUsd, priceUsd: p }));
    }
  }, [markets.data, extraAlertPrices.data, alerts, upsertAlert, notifications, currency, rate, webhookUrl]);

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
          <img src="./icon.svg" alt="" className="size-12" />
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

/** Android : verrou biométrique à l'ouverture — l'application reste masquée tant que tu ne t'es pas authentifié. */
function LockGate() {
  const appLock = useStore((s) => s.settings.appLock);
  // Verrouillé seulement si l'option est activée ET sur Android (le seul endroit où le verrou existe).
  const [locked, setLocked] = useState(() => appLock && isNative);
  const [attempt, setAttempt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!locked) return;
    let alive = true;
    setError(null);
    void (async () => {
      // Plus aucun verrou sur le téléphone (code supprimé) : le verrou de Boussole ne peut rien protéger de plus, on n'enferme pas l'utilisateur.
      if (!(await lockAvailable())) { if (alive) setLocked(false); return; }
      const r = await unlockApp();
      if (!alive) return;
      if (r.ok) setLocked(false);
      else setError(r.reason ?? 'authentification échouée');
    })();
    return () => { alive = false; };
  }, [locked, attempt]);
  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-page p-6">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-white"><Compass className="size-8" /></span>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-ink">Boussole est verrouillée</h1>
        <p className="mt-1 text-sm text-muted">Ouvre avec ton empreinte, ton visage ou le code de l'appareil.</p>
        {error && <p className="mt-2 text-sm text-warn">{error} — réessaie.</p>}
      </div>
      <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>Déverrouiller</Button>
    </div>
  );
}

/**
 * Nouvelle version disponible : un bandeau, un bouton « Installer » — le téléchargement se fait
 * dans l'application (releases publiques du dépôt, aucun jeton), l'installeur système termine le travail.
 */
function UpdateBanner() {
  const version = useLatestVersion();
  const [dismissed, setDismissed] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!version || dismissed) return null;
  async function install() {
    if (!version || busy) return;
    const url = updateAssetUrl(version, isNative ? 'android' : 'windows');
    setBusy(true);
    setError(null);
    setPct(isNative ? null : 0);
    const r = await installUpdate(url, (p) => setPct(p >= 0 ? p : null));
    setBusy(false);
    if (!r.ok) {
      setError(r.reason ?? 'échec de la mise à jour');
      setPct(null);
    }
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-ink-2">
      <Compass className="size-5 shrink-0 text-accent" />
      <p className="min-w-52 flex-1 text-ink">
        Boussole {version} est disponible.
        {pct != null && pct < 100 && <span className="ml-2 text-muted">Téléchargement… {pct} %</span>}
        {pct === 100 && <span className="ml-2 text-up">Téléchargement terminé — l'installeur s'ouvre.</span>}
        {error && <span className="ml-2 text-warn">{error}</span>}
      </p>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => void install()}>{busy ? 'Un instant…' : 'Installer la mise à jour'}</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => openExternal('https://github.com/Nikola17/boussole-crypto/releases/latest')}>La page</Button>
      {pct == null && !busy && <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Plus tard</Button>}
    </div>
  );
}

export default function App() {
  const accepted = useStore((s) => s.settings.disclaimerAccepted);
  const autoBrief = useStore((s) => s.settings.briefingAuto && aiReady(s.settings));
  const { path } = useHashPath();
  if (!accepted) return <Welcome />;
  // Widget Windows : fenêtre compacte sans barre de navigation (ouverte par le processus principal).
  if (path === '/widget') {
    return (
      <>
        <AppEffects />
        <ErrorBoundary scope="page" resetKey={path}>
          <Widget />
        </ErrorBoundary>
      </>
    );
  }
  return (
    <Layout>
      <AppEffects />
      <LockGate />
      {autoBrief && <AutoBrief />}
      <ErrorBoundary scope="page" resetKey={path}>
        <Suspense fallback={<Spinner label="Chargement…" />}>
          <UpdateBanner />
          <Routes />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
