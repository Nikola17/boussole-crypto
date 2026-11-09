import { Download, ExternalLink, Eye, EyeOff, KeyRound, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useStore, exportBackup, parseBackup } from '../store/useStore';
import { MODEL_INFO } from '../ai/claude';
import { buildAiConfig, testConnection } from '../ai/run';
import { NOUS_BASE_URL } from '../ai/openai';
import { useCompatModels } from '../hooks/useAiModels';
import { ensureNotificationPermission, isElectron, openExternal, platformLabel, saveTextFile } from '../lib/platform';
import { isoDay } from '../lib/format';
import { Banner, Button, Card, Field, Input, Modal, NumberInput, PageHeader, Segmented, Select, Toggle } from '../components/ui';
import type { AiModel, AiProvider, ThemeMode } from '../types';

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

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.setSettings);
  const importAll = useStore((s) => s.importAll);
  const resetAll = useStore((s) => s.resetAll);
  const name = useStore((s) => s.profile.name);
  const compat = settings.aiProvider === 'compat';
  const catalog = useCompatModels(settings.compatBaseUrl);
  const inShortlist = RECOMMENDED.some((r) => r.id === settings.compatModel);
  const [customOpen, setCustomOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    } catch (e) {
      setBackupMsg(`Export impossible : ${(e as Error).message}`);
    }
  }

  async function doImport(file: File) {
    try {
      const data = parseBackup(await file.text());
      importAll(data);
      setBackupMsg('Sauvegarde restaurée.');
    } catch (e) {
      setBackupMsg(`Import impossible : ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Réglages" subtitle={`Version ${__APP_VERSION__} · ${platformLabel}. Toutes tes données restent stockées sur cet appareil.`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="inline-flex items-center gap-2"><KeyRound className="size-4 text-accent" />Intelligence artificielle</span>} subtitle="Le brief quotidien, le comité des sages et le conseiller utilisent ta propre clé API : tu ne paies que ce que tu consommes.">
          <div className="space-y-4">
            <Segmented<AiProvider>
              value={settings.aiProvider}
              onChange={(v) => { set({ aiProvider: v }); setTestMsg(null); }}
              options={[{ value: 'compat', label: 'Nous Portal · économique' }, { value: 'anthropic', label: 'Claude' }]}
            />

            {compat ? (
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
                      const price = m?.inPerM != null && m.outPerM != null ? ` — ${m.inPerM.toFixed(2).replace('.', ',')} $ / ${m.outPerM.toFixed(2).replace('.', ',')} $ par million` : '';
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
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!(compat ? settings.compatKey : settings.anthropicKey)} loading={testing} onClick={() => void test()}>Tester la connexion</Button>
              {testMsg && <span className={`text-sm ${testMsg.ok ? 'text-up' : 'text-down'}`}>{testMsg.text}</span>}
            </div>
            <p className="text-xs text-muted">{compat ? 'Le coût réel de chaque analyse (renvoyé par le fournisseur) est affiché sur le rapport.' : 'Ordre de grandeur avec Opus 5.5 : ~0,15 à 0,40 $ par brief, ~0,60 à 1,50 $ par comité des sages. Le coût réel de chaque analyse est affiché sur le rapport.'}</p>
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
            {isElectron && (
              <>
                <Toggle checked={settings.closeToTray} onChange={(v) => set({ closeToTray: v })} label="Rester actif en arrière-plan" hint="Fermer la fenêtre garde Boussole dans la zone de notification : les alertes continuent d’arriver. « Quitter » dans le menu de son icône l’arrête vraiment." />
                <Toggle checked={settings.autoStart} onChange={(v) => set({ autoStart: v })} label="Démarrer avec Windows" hint="Boussole démarre réduit dans la zone de notification." />
              </>
            )}
          </div>
        </Card>

        <Card title="Sauvegarde" subtitle="Exporte régulièrement tes données (journal, plans, thèses…). La clé API n’est jamais exportée.">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} onClick={() => void doExport()}>Exporter</Button>
            <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Importer</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
            <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={() => setConfirmReset(true)}>Tout effacer</Button>
          </div>
          {backupMsg && <p className="mt-3 text-sm text-ink-2">{backupMsg}</p>}
          <p className="mt-3 text-xs text-muted">Astuce : exporte depuis l’ordinateur et importe sur le téléphone (ou l’inverse) pour retrouver les mêmes données sur les deux appareils.</p>
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

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Tout effacer ?" footer={<><Button variant="ghost" onClick={() => setConfirmReset(false)}>Annuler</Button><Button variant="danger" onClick={() => { resetAll(); setConfirmReset(false); }}>Effacer définitivement</Button></>}>
        <p className="text-sm text-ink-2">Toutes tes données locales (transactions, wallets, plans DCA, journal, thèses, rapports IA, réglages) seront supprimées de cet appareil. Exporte une sauvegarde avant si besoin.</p>
      </Modal>
    </div>
  );
}
