import { Download, ExternalLink, Eye, EyeOff, FolderOpen, KeyRound, RefreshCw, RotateCcw, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useStore, exportBackup } from '../store/useStore';
import { countsOf, importableSettings, validateBackup, type BackupCheck } from '../lib/backup';
import { describeBackupAge } from '../lib/autoBackup';
import { backupNow, canAutoBackup, noteManualBackup, useLastBackup } from '../hooks/useBackup';
import { MODEL_INFO } from '../ai/claude';
import { buildAiConfig, testConnection } from '../ai/run';
import { NOUS_BASE_URL } from '../ai/openai';
import { listMistralModels, MISTRAL_SUGGESTED } from '../ai/mistral';
import { useCompatModels } from '../hooks/useAiModels';
import { backupFolderLabel, ensureNotificationPermission, isElectron, isNative, lockAvailable, openBackupFolder, openExternal, platformLabel, saveTextFile } from '../lib/platform';
import { useAiContext } from '../ai/context';
import { checkPassphrase } from '../lib/sync/crypto';
import { fetchRaw } from '../lib/sync/github';
import { runSync, useSyncStatus } from '../hooks/useSync';
import { mergeBackupInto } from '../lib/sync/merge';
import { describeRunnerStatus, readRunnerStatus } from '../lib/runnerSync';
import { useQuery } from '@tanstack/react-query';
import { fmtNum, fmtRelative, isoDay } from '../lib/format';
import { Banner, Button, Card, Field, Input, Modal, NumberInput, PageHeader, Segmented, Select, Spinner, Toggle } from '../components/ui';
import type { AiModel, AiProvider, Settings as SettingsType, ThemeMode } from '../types';

/** Modèles proposés en priorité sur Nous Portal (identifiants vérifiés dans son catalogue). */
// Les notes « Vending-Bench 2 » viennent du classement andonlabs.com (agent qui gère un distributeur simulé
// pendant un an) : elles mesurent l'autonomie sur la durée, pas la qualité d'un brief crypto.
const RECOMMENDED: { id: string; label: string; note: string }[] = [
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', note: 'Testé sur un vrai brief : ≈ 0,003 $, très bon résultat. Choix par défaut.' },
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5', note: 'Testé : ≈ 0,005 $, rapide, très bon suivi des consignes.' },
  { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro', note: 'Testé : ≈ 0,05 $, 18 fois plus cher sans meilleur résultat.' },
  { id: 'x-ai/grok-4.7', label: 'Grok 4.7', note: 'Vending-Bench 2 : 10 537 $ — le moins cher des 9 du classement (2 $ / 6 $), mais le dernier.' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', note: 'Vending-Bench 2 : 11 165 $ — même prix que GPT-6 Sol et Gemini 4 Argon, score plus bas.' },
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', note: 'Vending-Bench 2 : 10 937 $ — 5 $ / 25 $, cher pour ce score.' },
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5', note: 'Vending-Bench 2 : 11 182 $ — 5 $ / 25 $, cher pour ce score.' },
  { id: 'meta/muse-wonder', label: 'Muse Wonder', note: 'Vending-Bench 2 (version « Full ») : 12 292 $. La variante « Full » n’est pas listée chez Nous : à confirmer.' },
  { id: 'google/gemini-4-argon', label: 'Gemini 4 Argon', note: 'Vending-Bench 2 : 13 718 $ (± 3 100, résultat très incertain).' },
  { id: 'openai/gpt-6-sol', label: 'GPT-6 Sol', note: 'Vending-Bench 2 : 14 428 $ — meilleur rapport score / prix du classement (2 $ / 10 $).' },
  { id: 'openai/gpt-6-astra', label: 'GPT-6 Astra', note: 'Vending-Bench 2 : 15 515 $ — le meilleur disponible chez Nous, mais 5 fois plus cher que GPT-6 Sol.' },
];
const CUSTOM = '__custom__';

/** Réglages Mistral AI : clé, puis tous les modèles de conversation du compte, lus en direct. */
function MistralFields({ show, onToggleShow }: { show: boolean; onToggleShow: () => void }) {
  const key = useStore((s) => s.settings.mistralKey);
  const model = useStore((s) => s.settings.mistralModel);
  const set = useStore((s) => s.setSettings);
  const [custom, setCustom] = useState(false);
  const live = useQuery({ queryKey: ['mistral-models', key.slice(-6)], queryFn: () => listMistralModels(key), enabled: key.length > 10, staleTime: 60 * 60_000, retry: 0 });
  const options = live.data?.length
    ? live.data.map((m) => ({ id: m.id, label: `${m.name !== m.id ? `${m.name} · ` : ''}${m.id}${m.aliases.length ? ` (${m.aliases.join(', ')})` : ''}${m.deprecation ? ' — bientôt retiré' : ''}` }))
    : MISTRAL_SUGGESTED.map((m) => ({ id: m.id, label: m.label }));
  const known = options.some((o) => o.id === model);
  const current = live.data?.find((m) => m.id === model);
  return (
    <>
      <Field label="Clé API Mistral" hint={<>Crée-la sur <button type="button" className="text-accent underline" onClick={() => openExternal('https://console.mistral.ai/api-keys')}>console.mistral.ai</button>. Elle est chiffrée par le système sur cet appareil, n’est envoyée qu’à api.mistral.ai et n’est jamais incluse dans les sauvegardes ni la synchronisation.</>}>
        <div className="flex gap-2">
          <Input type={show ? 'text' : 'password'} value={key} onChange={(e) => set({ mistralKey: e.target.value.trim() })} placeholder="Ta clé Mistral" autoComplete="off" spellCheck={false} />
          <Button variant="ghost" icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Masquer' : 'Afficher'} onClick={onToggleShow} />
        </div>
      </Field>
      <Field
        label="Modèle"
        hint={live.isFetching ? 'Lecture des modèles de ton compte…'
          : live.error ? (live.error as Error).message
          : live.data ? `${live.data.length} modèles de conversation disponibles sur ton compte (Mistral et autres éditeurs).${current?.description ? ` ${current.description}` : ''}`
          : MISTRAL_SUGGESTED.find((m) => m.id === model)?.note ?? 'Saisis ta clé : la liste complète de tes modèles apparaîtra ici.'}
      >
        <Select value={known && !custom ? model : CUSTOM} onChange={(e) => { if (e.target.value === CUSTOM) setCustom(true); else { setCustom(false); set({ mistralModel: e.target.value }); } }}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          <option value={CUSTOM}>Autre identifiant…</option>
        </Select>
      </Field>
      {(custom || !known) && (
        <Field label="Identifiant du modèle" hint="Tel qu’il apparaît dans la documentation ou la console Mistral.">
          <Input value={model} onChange={(e) => set({ mistralModel: e.target.value.trim() })} spellCheck={false} />
        </Field>
      )}
      <Banner tone="info" title="Pas de recherche web avec Mistral">
        L’app lui fournit les derniers titres de CoinDesk, Cointelegraph, Decrypt et The Block, et lui interdit d’inventer une actualité. Le coût n’étant pas renvoyé par Mistral, il s’affiche en jetons consommés.
      </Banner>
    </>
  );
}


/** Android : la surveillance des alertes application fermée tourne-t-elle vraiment ? (dernier contrôle réussi, ou ce qui l'empêche). */
function RunnerStatusLine() {
  const q = useQuery({ queryKey: ['runner-status'], queryFn: readRunnerStatus, refetchInterval: 60_000, staleTime: 0, enabled: isNative });
  if (!isNative || q.isLoading) return null;
  const d = describeRunnerStatus(q.data ?? null);
  return <p className={`-mt-2 text-xs ${d.ok ? 'text-ink-2' : 'text-warn'}`}>{d.text}</p>;
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const importAll = useStore((s) => s.importAll);
  const resetAll = useStore((s) => s.resetAll);
  const name = useStore((s) => s.profile.name);
  const compat = settings.aiProvider === 'compat';
  const mistral = settings.aiProvider === 'mistral';
  const catalog = useCompatModels(settings.compatBaseUrl);
  const inShortlist = RECOMMENDED.some((r) => r.id === settings.compatModel);
  const [customOpen, setCustomOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastBackup = useLastBackup((s) => s.last);
  const [pending, setPending] = useState<{ check: BackupCheck; name: string } | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);

  async function test() {
    setTesting(true);
    setTestMsg(null);
    try {
      const cfg = buildAiConfig(settings, name);
      if (!cfg) throw new Error('Renseigne d’abord ta clé API.');
      const r = await testConnection(cfg);
      setTestMsg({ ok: true, text: r || 'Connexion réussie.' });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function doExport() {
    try {
      setBackupMsg(await saveTextFile(`boussole-sauvegarde-${isoDay()}.json`, exportBackup(false)));
      noteManualBackup();
    } catch (e) {
      setBackupMsg(`Export impossible : ${(e as Error).message}`);
    }
  }

  async function doBackupNow() {
    setBusy(true);
    const r = await backupNow('auto');
    setBackupMsg(r.ok ? `Sauvegarde enregistrée : ${r.where}` : `Sauvegarde impossible : ${r.error ?? 'erreur inconnue'}. Utilise « Exporter ».`);
    setBusy(false);
  }

  /** Étape 1 : lire et vérifier le fichier. Rien n'est modifié tant que tu n'as pas confirmé. */
  async function doImport(file: File) {
    setBackupMsg(null);
    try {
      const check = validateBackup(JSON.parse(await file.text()));
      if (!check.ok) {
        setBackupMsg(`Import impossible : ${check.errors.join(' ')}`);
        return;
      }
      setSnapshotError(null);
      setPending({ check, name: file.name });
    } catch {
      setBackupMsg('Import impossible : ce fichier n’est pas une sauvegarde Boussole lisible.');
    }
  }

  /** Étape 2 : copie de sécurité de l'état actuel, puis fusion ou remplacement. */
  async function confirmImport(mode: 'merge' | 'replace', skipSnapshot = false) {
    if (!pending) return;
    setBusy(true);
    if (!skipSnapshot) {
      const snap = canAutoBackup ? await backupNow('avant-import') : { ok: false, where: '', error: 'indisponible sur ce type d’appareil' };
      if (!snap.ok) {
        setSnapshotError(snap.error ?? 'erreur inconnue');
        setBusy(false);
        return;
      }
    }
    if (mode === 'merge') {
      const merged = mergeBackupInto(useStore.getState(), pending.check.data as Record<string, unknown>);
      useStore.setState(merged, false);
      useStore.getState().setSettings(importableSettings(pending.check.data.settings as unknown) as Partial<SettingsType>);
      setBackupMsg(`Sauvegarde fusionnée (${pending.name}) : les deux états sont combinés, la version la plus récente de chaque élément l’emporte.${skipSnapshot ? '' : ' Une copie de tes données d’avant l’import a été gardée.'}`);
    } else {
      importAll(pending.check.data as Parameters<typeof importAll>[0]);
      setBackupMsg(`Sauvegarde restaurée (${pending.name}) : les rubriques du fichier remplacent celles de cet appareil.${skipSnapshot ? '' : ' Une copie de tes données d’avant l’import a été gardée.'}`);
    }
    setPending(null);
    setBusy(false);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Réglages" subtitle={`Version ${__APP_VERSION__} · ${platformLabel}. Tes données sont stockées sur cet appareil ; seules les analyses IA envoient un résumé de ton dossier au fournisseur choisi (contenu vérifiable plus bas).`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4 text-accent" />Intelligence artificielle</span>} subtitle="Le brief quotidien, le comité des sages et le conseiller utilisent ta propre clé API : tu ne paies que ce que tu consommes.">
          <div className="space-y-4">
            <Segmented<AiProvider>
              value={settings.aiProvider}
              onChange={(v) => { set({ aiProvider: v }); setTestMsg(null); }}
              options={[{ value: 'compat', label: 'Nous Portal' }, { value: 'mistral', label: 'Mistral AI' }, { value: 'anthropic', label: 'Claude' }]}
            />

            {mistral ? (
              <MistralFields show={show} onToggleShow={() => setShow(!show)} />
            ) : compat ? (
              <>
                <Field label="Clé API Nous Portal" hint={<>Crée-la sur <button type="button" className="text-accent underline" onClick={() => openExternal('https://portal.nousresearch.com')}>portal.nousresearch.com</button>. Elle est conservée uniquement dans le stockage local de cette application, n’est envoyée qu’à l’adresse de l’API ci-dessous et n’est jamais incluse dans les sauvegardes.</>}>
                  <div className="flex gap-2">
                    <Input type={show ? 'text' : 'password'} value={settings.compatKey} onChange={(e) => set({ compatKey: e.target.value.trim() })} placeholder="sk-nous-…" autoComplete="off" spellCheck={false} />
                    <Button variant="ghost" icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Masquer' : 'Afficher'} onClick={() => setShow(!show)} />
                  </div>
                </Field>
                <Field label="Modèle" hint={RECOMMENDED.find((r) => r.id === settings.compatModel)?.note ?? 'Identifiant du modèle chez ton fournisseur.'}>
                  <Select value={inShortlist && !customOpen ? settings.compatModel : CUSTOM} onChange={(e) => { if (e.target.value === CUSTOM) setCustomOpen(true); else { setCustomOpen(false); set({ compatModel: e.target.value }); } }}>
                    {RECOMMENDED.map((r) => {
                      const m = catalog.data?.find((x) => x.id === r.id);
                      const price = m?.inPerM != null && m.outPerM != null ? ` — ${fmtNum(m.inPerM, 2)} $ / ${fmtNum(m.outPerM, 2)} $ par million` : '';
                      return <option key={r.id} value={r.id}>{r.label}{price}</option>;
                    })}
                    <option value={CUSTOM}>Autre modèle…</option>
                  </Select>
                </Field>
                {(customOpen || !inShortlist) && (
                  <Field label="Identifiant du modèle" hint={catalog.data ? `${catalog.data.length} modèles disponibles : commence à taper pour les voir.` : 'Ex : deepseek/deepseek-v4.1-flash'}>
                    <Input list="compat-models" value={settings.compatModel} onChange={(e) => set({ compatModel: e.target.value.trim() })} spellCheck={false} />
                    <datalist id="compat-models">{(catalog.data ?? []).slice(0, 400).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
                  </Field>
                )}
                <Field label="Adresse de l’API" hint="Toute API compatible OpenAI convient (Nous Portal par défaut).">
                  <div className="flex gap-2">
                    <Input value={settings.compatBaseUrl} onChange={(e) => set({ compatBaseUrl: e.target.value.trim() })} spellCheck={false} />
                    {settings.compatBaseUrl !== NOUS_BASE_URL && <Button variant="ghost" onClick={() => set({ compatBaseUrl: NOUS_BASE_URL })}>Nous Portal</Button>}
                  </div>
                </Field>
                <Banner tone="info" title="Pas de recherche web avec ce modèle">
                  L’app lui fournit les derniers titres de CoinDesk, Cointelegraph, Decrypt et The Block, et lui interdit d’inventer une actualité. Pour que l’IA fasse ses propres recherches (éclaireur d’airdrops, vérifications approfondies), passe sur Claude.
                </Banner>
              </>
            ) : (
              <>
                <Field label="Clé API Anthropic" hint={<>Crée-la sur <button type="button" className="text-accent underline" onClick={() => openExternal('https://console.anthropic.com/settings/keys')}>console.anthropic.com</button> (paiement à l’usage). Elle est conservée uniquement dans le stockage local de cette application, n’est envoyée qu’à Anthropic et n’est jamais incluse dans les sauvegardes.</>}>
                  <div className="flex gap-2">
                    <Input type={show ? 'text' : 'password'} value={settings.anthropicKey} onChange={(e) => set({ anthropicKey: e.target.value.trim() })} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} />
                    <Button variant="ghost" icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Masquer' : 'Afficher'} onClick={() => setShow(!show)} />
                  </div>
                </Field>
                <Field label="Modèle" hint={MODEL_INFO[settings.aiModel].note}>
                  <Select value={settings.aiModel} onChange={(e) => set({ aiModel: e.target.value as AiModel })}>
                    {Object.entries(MODEL_INFO).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.input} $ / {v.output} $ par million de jetons</option>)}
                  </Select>
                </Field>
                <Toggle checked={settings.aiWebSearch} onChange={(v) => set({ aiWebSearch: v })} label="Recherche web" hint="Permet à l’IA de lire l’actualité du jour (≈ 0,01 $ par recherche). Fortement recommandé." />
              </>
            )}

            <Toggle checked={settings.briefingAuto} onChange={(v) => set({ briefingAuto: v })} label="Brief automatique chaque jour" hint="Généré à la première ouverture de l’application dans la journée." />
            <Toggle checked={settings.aiAnonymous} onChange={(v) => set({ aiAnonymous: v })} label="Anonymiser ce qui part vers l’IA" hint="Sans ton prénom ni tes montants : l’IA reçoit des pourcentages à la place des valeurs en euros. Certains conseils seront un peu moins précis." />
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<Eye className="size-4" />} onClick={() => setCtxOpen(true)}>Voir ce qui part vers l’IA</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!(mistral ? settings.mistralKey : compat ? settings.compatKey : settings.anthropicKey)} loading={testing} onClick={() => void test()}>Tester la connexion</Button>
              {testMsg && <span className={`text-sm ${testMsg.ok ? 'text-up' : 'text-down'}`}>{testMsg.text}</span>}
            </div>
            <p className="text-xs text-muted">{mistral ? 'Chaque rapport affiche les jetons consommés ; le tarif de ton modèle est sur console.mistral.ai.' : compat ? 'Le coût réel de chaque analyse (renvoyé par le fournisseur) est affiché sur le rapport.' : 'Ordre de grandeur avec Opus 5.5 : ~0,15 à 0,40 $ par brief, ~0,60 à 1,50 $ par comité des sages. Le coût réel de chaque analyse est affiché sur le rapport.'}</p>
          </div>
        </Card>

        <Card title="Données & affichage">
          <div className="space-y-4">
            <Field label="Devise d’affichage">
              <Select value={settings.currency} onChange={(e) => set({ currency: e.target.value as 'EUR' | 'USD' })}>
                <option value="EUR">Euro (€)</option>
                <option value="USD">Dollar ($)</option>
              </Select>
            </Field>
            <Field label="Thème">
              <Select value={settings.theme} onChange={(e) => set({ theme: e.target.value as ThemeMode })}>
                <option value="system">Automatique (système)</option>
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
              </Select>
            </Field>
            <Field label="Clé CoinGecko « Demo » (facultatif, gratuite)" hint={<>Sans clé, CoinGecko limite fortement le nombre de requêtes. <button type="button" className="text-accent underline" onClick={() => openExternal('https://www.coingecko.com/fr/api/pricing')}>Obtenir une clé Demo gratuite</button>.</>}>
              <Input value={settings.coingeckoKey} onChange={(e) => set({ coingeckoKey: e.target.value.trim() })} placeholder="CG-…" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Taille du scan de signaux">
              <Select value={settings.scanSize} onChange={(e) => set({ scanSize: Number(e.target.value) as 50 | 100 })}>
                <option value={50}>Top 50 (plus rapide)</option>
                <option value={100}>Top 100</option>
              </Select>
            </Field>
            <Field label="Taux d’imposition des plus-values (%)" hint="Flat tax 2026 : 31,4 % (12,8 % IR + 18,6 % prélèvements sociaux).">
              <NumberInput value={settings.taxRatePct} onChange={(v) => set({ taxRatePct: v === '' ? 31.4 : v })} />
            </Field>
            <Toggle checked={settings.notifications} onChange={async (v) => { if (v) await ensureNotificationPermission(); set({ notifications: v }); }} label="Notifications" hint="Alertes de prix, paliers de vente, échéances du panier, changement de zone du marché, bilan du dimanche." />
            {settings.notifications && <RunnerStatusLine />}
            <AppLockToggle />
            {isElectron && (
              <>
                <Toggle checked={settings.closeToTray} onChange={(v) => set({ closeToTray: v })} label="Rester actif en arrière-plan" hint="Fermer la fenêtre garde Boussole dans la zone de notification : les alertes continuent d’arriver. « Quitter » dans le menu de son icône l’arrête vraiment." />
                <Toggle checked={settings.autoStart} onChange={(v) => set({ autoStart: v })} label="Démarrer avec Windows" hint="Boussole démarre réduit dans la zone de notification." />
              </>
            )}
          </div>
        </Card>

        <SyncCard />

        <Card title="Sauvegarde" subtitle="Tes données vivent sur cet appareil (et dans ton dépôt de synchronisation si tu l'actives) : une réinstallation ou un téléphone perdu les efface. Les clés API ne sont jamais sauvegardées.">
          <p className="mb-3 text-sm text-ink-2">
            {describeBackupAge(lastBackup)}
            {canAutoBackup && <> Une copie est faite automatiquement chaque jour dans <b className="text-ink">{backupFolderLabel}</b> (les 14 dernières sont gardées).</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {canAutoBackup && <Button variant="primary" icon={<Save className="size-4" />} loading={busy} onClick={() => void doBackupNow()}>Sauvegarder maintenant</Button>}
            {isElectron && <Button icon={<FolderOpen className="size-4" />} onClick={() => void openBackupFolder()}>Ouvrir le dossier</Button>}
            <Button icon={<Download className="size-4" />} onClick={() => void doExport()}>Exporter</Button>
            <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Importer</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
            <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>Tout effacer</Button>
          </div>
          {backupMsg && <p className="mt-3 text-sm text-ink-2">{backupMsg}</p>}
          <p className="mt-3 text-xs text-muted">Le fichier contient tout ton historique, tes adresses suivies et tes clés publiques étendues (xpub) : range-le comme un document financier. « Importer » remplace les données de cet appareil par celles du fichier, après une copie de sécurité.</p>
        </Card>

        <Card title="À propos">
          <div className="space-y-2 text-sm text-ink-2">
            <p>Boussole est un tableau de bord personnel d’aide à la décision. Sa méthode d’analyse s’inspire du projet open source <button type="button" className="text-accent underline" onClick={() => openExternal('https://github.com/xbtlin/ai-berkshire')}>AI Berkshire</button>, adapté aux cryptoactifs.</p>
            <p>Données : CoinGecko, Binance, alternative.me, DefiLlama, GeckoTerminal, DexScreener, GoPlus, RugCheck, mempool.space, Jupiter, PublicNode.</p>
            <Banner tone="warn" title="Avertissement">
              Boussole n’est pas un conseiller en investissement agréé et ne fournit pas de conseil personnalisé au sens réglementaire. Les signaux et analyses IA peuvent se tromper. Les cryptoactifs sont très volatils : n’investis que ce que tu peux te permettre de perdre.
            </Banner>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => openExternal('https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-noires-et-mises-en-garde')}><ExternalLink className="size-3" />Listes noires de l’AMF (plateformes non autorisées)</button>
          </div>
        </Card>
      </div>

      <AiContextModal open={ctxOpen} onClose={() => setCtxOpen(false)} />

      <Modal
        open={!!pending}
        onClose={() => { if (!busy) setPending(null); }}
        title="Importer cette sauvegarde ?"
        footer={pending ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Annuler</Button>
            <Button variant="primary" loading={busy} onClick={() => void confirmImport('merge')}>Fusionner (recommandé)</Button>
            {snapshotError
              ? <Button variant="danger" loading={busy} disabled={busy} onClick={() => void confirmImport('replace', true)}>Continuer sans copie</Button>
              : <Button variant="secondary" loading={busy} disabled={busy} onClick={() => void confirmImport('replace')}>Remplacer tout</Button>}
          </>
        ) : undefined}
      >
        {pending && (
          <div className="space-y-3 text-sm text-ink-2">
            <p>
              Fichier <b className="text-ink">{pending.name}</b>
              {pending.check.summary.exportedAt && <> · exporté le {new Date(pending.check.summary.exportedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</>}.
            </p>
            <table className="w-full text-left text-xs">
              <thead className="text-muted"><tr><th className="py-1 font-medium">Rubrique</th><th className="py-1 text-right font-medium">Sur cet appareil</th><th className="py-1 text-right font-medium">Dans le fichier</th></tr></thead>
              <tbody>
                {countsOf(useStore.getState()).map((c) => {
                  const inFile = pending.check.summary.counts.find((x) => x.label === c.label);
                  return (
                    <tr key={c.label} className="border-t border-line"><td className="py-1">{c.label}</td><td className="py-1 text-right tnum">{c.n}</td><td className={`py-1 text-right tnum ${inFile && inFile.n < c.n ? 'font-medium text-warn' : ''}`}>{inFile ? inFile.n : '—'}</td></tr>
                  );
                })}
              </tbody>
            </table>
            <p><b className="text-ink">Fusionner</b> (recommandé) combine les deux états : chaque élément garde la version la plus récente, les cryptos absentes du fichier sont conservées, rien n'est effacé. <b className="text-ink">Remplacer tout</b> écrase les rubriques de cet appareil par celles du fichier (tes clés API et le serveur d'IA ne changent jamais ; un nombre plus petit dans le fichier signifie alors que tu perdrais des éléments récents).</p>
            {pending.check.warnings.map((w) => <p key={w} className="text-warn">{w}</p>)}
            {snapshotError
              ? <Banner tone="warn" title="Copie de sécurité impossible">{snapshotError}. Exporte d’abord tes données actuelles, ou continue sans copie.<div className="mt-2"><Button size="sm" onClick={() => void doExport()}>Exporter mes données actuelles</Button></div></Banner>
              : <p>Une copie de tes données actuelles est enregistrée juste avant{canAutoBackup ? ` dans ${backupFolderLabel}` : ''}.</p>}
          </div>
        )}
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Tout effacer ?" footer={<><Button variant="ghost" onClick={() => setConfirmReset(false)}>Annuler</Button><Button variant="danger" onClick={() => { resetAll(); setConfirmReset(false); }}>Effacer définitivement</Button></>}>
        <p className="text-sm text-ink-2">Toutes tes données locales (transactions, wallets, plans DCA, journal, rapports IA, réglages) seront supprimées de cet appareil. Exporte une sauvegarde avant si besoin.</p>
      </Modal>
    </div>
  );
}

/** Android : verrou biométrique (empreinte/visage/code de l'appareil) à l'ouverture de l'application. */
function AppLockToggle() {
  const appLock = useStore((st) => st.settings.appLock);
  const set = useStore((st) => st.setSettings);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  useEffect(() => {
    if (isNative) void lockAvailable().then(setSupported);
  }, []);
  if (!isNative) return null;
  return (
    <>
      <Toggle checked={appLock} label="Verrou à l'ouverture" hint={supported === false ? 'Aucun verrou biométrique ni code trouvé sur ce téléphone : configure-en un dans les réglages Android d’abord.' : 'Empreinte, visage ou code de l’appareil, à chaque ouverture de Boussole. Réglage propre à ce téléphone.'} onChange={async (v) => {
        if (v) {
          const ok = await lockAvailable();
          if (!ok) { setWarn('Configure d’abord un code ou une empreinte dans les réglages Android.'); return; }
        }
        setWarn(null);
        set({ appLock: v });
      }} />
      {warn && <p className="-mt-2 text-xs text-warn">{warn}</p>}
    </>
  );
}

/** Signal de vie du serveur veilleur (VPS) : le petit fichier non chiffré que le runner pousse toutes les 10 minutes. */
function HeartbeatLine() {
  const { syncEnabled, syncRepo, syncToken } = useStore((st) => st.settings);
  const q = useQuery({
    queryKey: ['watch-heartbeat'],
    queryFn: () => fetchRaw(syncRepo, 'heartbeat.json', syncToken),
    enabled: syncEnabled && !!syncRepo.trim() && !!syncToken.trim(),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
  if (!syncEnabled) return null;
  if (q.isLoading) return null;
  let at: number | null = null;
  try { at = q.data ? Date.parse((JSON.parse(q.data) as { at?: string }).at ?? '') : null; } catch { at = null; }
  const fresh = at != null && Number.isFinite(at) && Date.now() - at < 45 * 60_000;
  if (at == null || !Number.isFinite(at)) return <p className="-mt-2 text-xs text-warn">Serveur veilleur : aucun signal de vie reçu pour l'instant. Vérifie le service sur le VPS si cela persiste.</p>;
  return (
    <p className={`-mt-2 text-xs ${fresh ? 'text-ink-2' : 'text-warn'}`}>
      Serveur veilleur : {fresh ? `dernier pointage ${fmtRelative(at)}` : `dernier pointage ${fmtRelative(at)} — vérifie le service sur le VPS`}.
    </p>
  );
}

/** Synchronisation chiffrée PC ↔ téléphone : dépôt GitHub privé + phrase de passe (AES-GCM) + fusion automatique. */
function SyncCard() {
  const s = useStore((st) => st.settings);
  const set = useStore((st) => st.setSettings);
  const { busy, error, lastAt } = useSyncStatus();
  const [showSecrets, setShowSecrets] = useState(false);
  const passErr = checkPassphrase(s.syncPassphrase);
  const ready = !!s.syncRepo.trim() && !!s.syncToken.trim() && !passErr;
  const eye = <Button variant="ghost" icon={showSecrets ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={showSecrets ? 'Masquer' : 'Afficher'} onClick={() => setShowSecrets(!showSecrets)} />;
  return (
    <Card title={<span className="inline-flex items-center gap-2"><RefreshCw className="size-4 text-accent" />Synchronisation PC ↔ téléphone</span>} subtitle="Le même dossier sur tes deux appareils, chiffré de bout en bout dans un dépôt GitHub privé. GitHub ne voit jamais le contenu ; la fusion garde la version la plus récente de chaque élément et propage les suppressions.">
      <div className="space-y-4">
        <Toggle checked={s.syncEnabled} onChange={(v) => { set({ syncEnabled: v }); if (v) setTimeout(() => void runSync(), 300); }} label="Synchroniser automatiquement" hint="Au lancement, après tes modifications (regroupées) et toutes les 15 minutes." />
        <Field label="Dépôt GitHub privé" hint={<>Crée sur GitHub un dépôt <b className="text-ink">privé</b> et vide (ex : <code>boussole-sync</code>). Il ne recevra qu'un seul fichier chiffré.</>}>
          <Input value={s.syncRepo} onChange={(e) => set({ syncRepo: e.target.value.trim() })} placeholder="ton-compte/boussole-sync" spellCheck={false} />
        </Field>
        <Field label="Jeton d'accès GitHub (fine-grained, limité à ce dépôt)" hint={<>Crée-le sur <button type="button" className="text-accent underline" onClick={() => openExternal('https://github.com/settings/personal-access-tokens/new')}>github.com/settings/personal-access-tokens/new</button> : « Only select repositories » → ton dépôt de synchronisation, puis permission « Contents : Read and write ». Il est conservé sur cet appareil uniquement.</>}>
          <div className="flex gap-2">
            <Input type={showSecrets ? 'text' : 'password'} value={s.syncToken} onChange={(e) => set({ syncToken: e.target.value.trim() })} placeholder="github_pat_…" autoComplete="off" spellCheck={false} />
            {eye}
          </div>
        </Field>
        <Field label="Phrase de passe de chiffrement" hint="Au moins 8 caractères, la même sur tes deux appareils. Elle ne quitte jamais cet appareil : GitHub ne reçoit que du chiffré (AES-256). Si tu la perds, chaque appareil garde ses données mais la synchronisation s'arrête.">
          <div className="flex gap-2">
            <Input type={showSecrets ? 'text' : 'password'} value={s.syncPassphrase} onChange={(e) => set({ syncPassphrase: e.target.value })} autoComplete="off" spellCheck={false} />
            {eye}
          </div>
        </Field>
        {passErr && <p className="-mt-2 text-xs text-warn">{passErr}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<RefreshCw className="size-4" />} disabled={!s.syncEnabled || !ready} loading={busy} onClick={() => void runSync()}>Synchroniser maintenant</Button>
          <span className={clsx('text-sm', error ? 'text-down' : 'text-ink-2')}>
            {error ?? (busy ? 'Synchronisation en cours…' : lastAt > 0 ? `Synchronisé ${fmtRelative(lastAt).replace('il y a', 'il y a')}` : 'Jamais synchronisé.')}
          </span>
        </div>
        <HeartbeatLine />
        <p className="text-xs text-muted">Ce qui part vers GitHub : tes transactions, comptes, wallets, plans DCA et panier, alertes, réglages de profil — chiffrés. Jamais : tes clés API (IA, CoinGecko), ni ce jeton, ni cette phrase, ni les rapports IA et conversations propres à chaque appareil.</p>
      </div>
    </Card>
  );
}

/** Transparence : montre exactement le dossier envoyé au fournisseur IA, selon les réglages actuels. */
function AiContextModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useAiContext();
  const provider = useStore((s) => (s.settings.aiProvider === 'compat' ? 'Nous Portal (adresse configurée plus haut)' : s.settings.aiProvider === 'mistral' ? 'Mistral AI (api.mistral.ai)' : 'Anthropic (Claude)'));
  const anonymous = useStore((s) => s.settings.aiAnonymous);
  const dossier = ctx.ready ? {
    profil: ctx.profile(),
    portefeuille: ctx.portfolio(),
    dca: ctx.dca(ctx.cycle?.temperature),
    marche: ctx.market(),
  } : null;
  return (
    <Modal open={open} onClose={onClose} title="Ce qui part vers l’IA" footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}>
      <div className="space-y-3 text-sm text-ink-2">
        <p>Quand tu génères un brief, une analyse ou une question au conseiller, Boussole construit ce dossier et l’envoie à <b className="text-ink">{provider}</b>, avec ta question. Rien d’autre : ton journal brut, tes adresses de wallet et tes clés API ne partent jamais.</p>
        {anonymous && <Banner tone="info" title="Mode anonymisé actif">Les montants sont remplacés par des pourcentages et ton prénom n’est pas envoyé.</Banner>}
        {!ctx.ready ? (
          <p className="text-muted"><Spinner label="Chargement des données de marché pour composer le dossier…" /></p>
        ) : (
          <pre className="max-h-[60dvh] overflow-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">{JSON.stringify(dossier, null, 2)}</pre>
        )}
        <p className="text-xs text-muted">Les rapports reçoivent ensuite tes données de marché du jour ; ils sont conservés sur cet appareil. Si tu changes d’avis sur ce qui t’identifie, active « Anonymiser ce qui part vers l’IA » juste au-dessus.</p>
      </div>
    </Modal>
  );
}
