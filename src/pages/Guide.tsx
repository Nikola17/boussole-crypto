import { BookOpen, CheckCircle2, ClipboardCheck, Compass, RotateCcw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { ARCHETYPES, BUY_CHECKLIST, GOLDEN_RULES, archetypeFor, rulesOf, scoreProfile } from '../lib/profile';
import { BUCKET_LABEL, BUCKET_ORDER } from '../lib/portfolio';
import { setQuery, useHashPath } from '../router';
import { Badge, Banner, Button, Card, Field, Input, NumberInput, PageHeader, Segmented, Toggle } from '../components/ui';
import type { Profile } from '../types';

type Tab = 'profil' | 'methode' | 'checklist' | 'glossaire';

export default function Guide() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'profil';
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Guide & profil" subtitle="Boussole adapte ses conseils à ta situation. Définis ton profil, adopte une méthode et vérifie chaque achat avec la checklist." />
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'profil', label: 'Mon profil' },
        { value: 'methode', label: 'Ma méthode' },
        { value: 'checklist', label: 'Checklist avant achat' },
        { value: 'glossaire', label: 'Glossaire' },
      ]} />
      {tab === 'profil' && <ProfileTab />}
      {tab === 'methode' && <Method />}
      {tab === 'checklist' && <Checklist />}
      {tab === 'glossaire' && <Glossary />}
    </div>
  );
}

function Choice<T extends number>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)} className={clsx('rounded-lg border px-3 py-2.5 text-left text-sm', value === v ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileTab() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const currency = useStore((s) => s.settings.currency);
  const [draft, setDraft] = useState<Profile>(profile);
  const score = scoreProfile(draft);
  const arch = archetypeFor(score);
  const set = (p: Partial<Profile>) => setDraft({ ...draft, ...p });

  function validate() {
    setProfile({ ...draft, archetype: arch, target: { ...ARCHETYPES[arch].target }, rules: { ...ARCHETYPES[arch].rules }, completed: true });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3" title={<span className="inline-flex items-center gap-2"><UserRound className="size-4 text-accent" />Questionnaire</span>} subtitle="5 questions pour calibrer ton allocation et tes limites de risque">
        <div className="space-y-5">
          <Field label="Ton prénom"><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nico" /></Field>
          <Choice label="1. Horizon de placement" value={draft.horizon} onChange={(v) => set({ horizon: v })} options={[[1, 'Moins d’un an'], [2, '1 à 4 ans'], [3, '4 ans et plus (un cycle complet ou plus)']]} />
          <Choice label="2. Ta tolérance au risque" value={draft.riskTolerance} onChange={(v) => set({ riskTolerance: v })} options={[[1, 'Très faible : je veux dormir tranquille'], [2, 'Faible'], [3, 'Moyenne'], [4, 'Élevée'], [5, 'Très élevée : je vise des ×10']]} />
          <Choice label="3. Ton expérience" value={draft.experience} onChange={(v) => set({ experience: v })} options={[[1, 'Débutant'], [2, 'Intermédiaire (au moins un cycle vécu)'], [3, 'Avancé (DeFi, trading)']]} />
          <Choice label="4. Si ton portefeuille perd… tu tiens jusqu’à" value={draft.maxLoss} onChange={(v) => set({ maxLoss: v })} options={[[1, '−10 %'], [2, '−25 %'], [3, '−50 %'], [4, '−80 % sans vendre']]} />
          <Choice label="5. Ton objectif" value={draft.goal} onChange={(v) => set({ goal: v })} options={[[1, 'Protéger mon épargne de l’inflation'], [2, 'Faire croître mon capital'], [3, 'Multiplier mon capital']]} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Capital crypto prévu (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={draft.capital} onChange={(v) => set({ capital: v === '' ? 0 : v })} /></Field>
            <Field label={`Budget mensuel (${currency === 'EUR' ? '€' : '$'})`}><NumberInput value={draft.monthlyBudget} onChange={(v) => set({ monthlyBudget: v === '' ? 0 : v })} /></Field>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">Ce qui t’intéresse</p>
            <Toggle checked={draft.interests.dca} onChange={(v) => set({ interests: { ...draft.interests, dca: v } })} label="Investissement programmé (DCA)" />
            <Toggle checked={draft.interests.trading} onChange={(v) => set({ interests: { ...draft.interests, trading: v } })} label="Trading actif" />
            <Toggle checked={draft.interests.gems} onChange={(v) => set({ interests: { ...draft.interests, gems: v } })} label="Chasse aux pépites" />
            <Toggle checked={draft.interests.airdrops} onChange={(v) => set({ interests: { ...draft.interests, airdrops: v } })} label="Airdrops" />
          </div>
        </div>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        <Card title="Ton profil" subtitle={`Score ${score}/18`}>
          <div className="flex items-center gap-3"><Compass className="size-8 text-accent" /><div><p className="text-2xl font-semibold text-ink">{arch}</p>{profile.completed && profile.archetype === arch && <Badge tone="up">Profil actif</Badge>}</div></div>
          <p className="mt-2 text-sm text-ink-2">{ARCHETYPES[arch].pitch}</p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {BUCKET_ORDER.map((b) => <li key={b} className="flex justify-between"><span className="text-ink-2">{BUCKET_LABEL[b]}</span><span className="tnum font-medium text-ink">{ARCHETYPES[arch].target[b]} %</span></li>)}
          </ul>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
            <p>Max par pépite : <b className="text-ink">{ARCHETYPES[arch].rules.maxPerGemPct} %</b> · max par altcoin : <b className="text-ink">{ARCHETYPES[arch].rules.maxPerAltPct} %</b></p>
            <p className="mt-1">Réserve en stablecoins : <b className="text-ink">{ARCHETYPES[arch].rules.cashReservePct} %</b> · risque par trade : <b className="text-ink">{ARCHETYPES[arch].rules.riskPerTradePct} %</b></p>
            <p className="mt-1">Lignes max : <b className="text-ink">{ARCHETYPES[arch].rules.maxLines}</b> · ligne minimale : <b className="text-ink">{ARCHETYPES[arch].rules.minLinePct} %</b> · lignes « découverte » max : <b className="text-ink">{ARCHETYPES[arch].rules.maxDiscoveryLines}</b></p>
          </div>
          <Button variant="primary" className="mt-4 w-full" icon={<CheckCircle2 className="size-4" />} onClick={validate}>Valider ce profil</Button>
        </Card>
        {profile.completed && <TargetEditor />}
      </div>
    </div>
  );
}

function TargetEditor() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const total = Object.values(profile.target).reduce((s, v) => s + v, 0);
  return (
    <Card title="Personnaliser" subtitle="Ajuste ta cible et tes règles si besoin">
      <div className="space-y-2">
        {BUCKET_ORDER.map((b) => (
          <div key={b} className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm text-ink-2">{BUCKET_LABEL[b]}</span>
            <div className="w-24 shrink-0">
              <NumberInput className="text-right" value={profile.target[b]} onChange={(v) => setProfile({ target: { ...profile.target, [b]: v === '' ? 0 : v } })} />
            </div>
          </div>
        ))}
        <p className={clsx('text-xs', total === 100 ? 'text-muted' : 'text-down')}>Total : {total} % {total !== 100 && '(doit faire 100 %)'}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Max par pépite (%)"><NumberInput value={profile.rules.maxPerGemPct} onChange={(v) => setProfile({ rules: { ...profile.rules, maxPerGemPct: v === '' ? 0 : v } })} /></Field>
        <Field label="Max par altcoin (%)"><NumberInput value={profile.rules.maxPerAltPct} onChange={(v) => setProfile({ rules: { ...profile.rules, maxPerAltPct: v === '' ? 0 : v } })} /></Field>
        <Field label="Réserve stables (%)"><NumberInput value={profile.rules.cashReservePct} onChange={(v) => setProfile({ rules: { ...profile.rules, cashReservePct: v === '' ? 0 : v } })} /></Field>
        <Field label="Risque / trade (%)"><NumberInput value={profile.rules.riskPerTradePct} onChange={(v) => setProfile({ rules: { ...profile.rules, riskPerTradePct: v === '' ? 0 : v } })} /></Field>
        <Field label="Lignes max" hint="Cryptos distinctes"><NumberInput value={rulesOf(profile).maxLines} onChange={(v) => setProfile({ rules: { ...rulesOf(profile), maxLines: v === '' ? 0 : v } })} /></Field>
        <Field label="Ligne minimale (%)" hint="Poids du portefeuille"><NumberInput value={rulesOf(profile).minLinePct} onChange={(v) => setProfile({ rules: { ...rulesOf(profile), minLinePct: v === '' ? 0 : v } })} /></Field>
        <Field label="Lignes découverte max"><NumberInput value={rulesOf(profile).maxDiscoveryLines} onChange={(v) => setProfile({ rules: { ...rulesOf(profile), maxDiscoveryLines: v === '' ? 0 : v } })} /></Field>
      </div>
    </Card>
  );
}

function Method() {
  return (
    <div className="space-y-4">
      <Card title={<span className="inline-flex items-center gap-2"><BookOpen className="size-4 text-accent" />Les 10 règles de la Boussole</span>} subtitle="Inspirées de Buffett, Munger, Duan Yongping et Li Lu, adaptées à la crypto">
        <ol className="grid gap-3 md:grid-cols-2">
          {GOLDEN_RULES.map((r, i) => (
            <li key={r.title} className="flex gap-3 rounded-lg bg-surface-2 p-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-ink">{i + 1}</span>
              <div><p className="text-sm font-medium text-ink">{r.title}</p><p className="mt-0.5 text-sm text-ink-2">{r.detail}</p></div>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="Une routine simple qui marche">
        <div className="grid gap-3 text-sm text-ink-2 md:grid-cols-3">
          <div><p className="font-medium text-ink">Chaque jour (2 min)</p><p>Ouvre le Cockpit : température du marché, brief IA, « que faire aujourd’hui ». La plupart des jours, la bonne action est de ne rien faire.</p></div>
          <div><p className="font-medium text-ink">Chaque semaine (10 min)</p><p>Exécute ton DCA au montant recommandé, coche tes tâches d’airdrop, jette un œil aux setups et aux pépites (sans obligation d’acheter).</p></div>
          <div><p className="font-medium text-ink">Chaque mois (30 min)</p><p>Rééquilibre vers ta cible, fais vérifier tes thèses par l’IA, revois ton journal de trading, exporte une sauvegarde.</p></div>
        </div>
      </Card>
    </div>
  );
}

function Checklist() {
  const state = useStore((s) => s.checklist);
  const setState = useStore((s) => s.setChecklist);
  const [coin, setCoin] = useState('');
  const done = BUY_CHECKLIST.filter((_, i) => state[i]).length;
  const criticalMissing = BUY_CHECKLIST.some((c, i) => c.critical && !state[i]);
  return (
    <Card title={<span className="inline-flex items-center gap-2"><ClipboardCheck className="size-4 text-accent" />Avant d’acheter, coche tout</span>} subtitle="La checklist sert à éliminer les mauvaises décisions, pas à justifier une envie." actions={<Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setState({})}>Réinitialiser</Button>}>
      <Field label="Crypto concernée (facultatif)" className="mb-4 max-w-sm"><Input value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="Ex : SOL" /></Field>
      <ul className="space-y-2">
        {BUY_CHECKLIST.map((c, i) => (
          <li key={i}>
            <button type="button" onClick={() => setState({ ...state, [i]: !state[i] })} className={clsx('flex w-full items-start gap-3 rounded-lg border p-3 text-left', state[i] ? 'border-good/40 bg-good/5' : 'border-line hover:bg-surface-2')}>
              <CheckCircle2 className={clsx('mt-0.5 size-5 shrink-0', state[i] ? 'text-good' : 'text-surface-3')} />
              <div>
                <p className="text-sm font-medium text-ink">{c.q} {c.critical && <Badge tone="warn" className="ml-1">indispensable</Badge>}</p>
                <p className="mt-0.5 text-xs text-ink-2">{c.help}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        {done === BUY_CHECKLIST.length ? (
          <Banner tone="success" title={`Feu vert${coin ? ` pour ${coin}` : ''}`}>Tu as fait tes devoirs. Achète par paliers, respecte ta taille de position et note ta thèse.</Banner>
        ) : criticalMissing ? (
          <Banner tone="danger" title="Pas prêt">Au moins un point indispensable n’est pas validé. Patience : une opportunité manquée coûte moins cher qu’une erreur.</Banner>
        ) : (
          <Banner tone="warn" title={`${done}/${BUY_CHECKLIST.length} points validés`}>Les points indispensables sont OK. Réduis la taille de position tant que tout n’est pas coché.</Banner>
        )}
      </div>
    </Card>
  );
}

const GLOSSARY: [string, string][] = [
  ['DCA (Dollar Cost Averaging)', 'Investir un montant fixe à intervalle régulier, quel que soit le prix. Lisse le prix d’achat moyen et supprime le stress du timing.'],
  ['Moyenne mobile 200 jours (MM200)', 'Prix moyen des 200 derniers jours. Au-dessus = tendance de fond haussière, en dessous = baissière.'],
  ['Multiple de Mayer', 'Prix ÷ MM200. Sous 0,8 : historiquement très bon marché ; au-dessus de 2,4 : bulle.'],
  ['RSI', 'Indicateur de 0 à 100 mesurant la vitesse des mouvements. Sous 30 : survente ; au-dessus de 70 : surachat.'],
  ['MACD', 'Différence entre deux moyennes exponentielles. Son croisement avec sa ligne de signal indique un changement de momentum.'],
  ['Bandes de Bollinger', 'Enveloppe de volatilité autour de la MM20. Un resserrement précède souvent un mouvement fort.'],
  ['ATR', 'Volatilité moyenne quotidienne. Sert à placer un stop ni trop serré ni trop large.'],
  ['Croisement doré / de la mort', 'La MM50 croise au-dessus (doré, haussier) ou en dessous (mort, baissier) de la MM200.'],
  ['Fear & Greed', 'Indice de sentiment de 0 (peur extrême) à 100 (avidité extrême). Les meilleures opportunités naissent souvent dans la peur.'],
  ['Dominance Bitcoin', 'Part du Bitcoin dans la capitalisation totale. Quand elle baisse et que les altcoins montent, c’est l’« altseason ».'],
  ['Capitalisation / FDV', 'Capitalisation = prix × offre en circulation. FDV = prix × offre totale. Un écart important annonce des déblocages de tokens.'],
  ['TVL', 'Valeur totale déposée dans un protocole DeFi. Mesure son adoption.'],
  ['P/F', 'Capitalisation ÷ frais annualisés générés par un protocole : l’équivalent crypto du PER. Plus il est bas, moins le protocole est cher.'],
  ['Ratio gain / risque (R)', 'Gain visé ÷ perte acceptée. Avec 2 R, un taux de réussite de 40 % suffit à être rentable.'],
  ['Stop loss', 'Ordre qui coupe une position à un prix défini pour limiter la perte. Indispensable en trading.'],
  ['Honeypot', 'Token piégé qu’on peut acheter mais pas revendre. Le scan de sécurité de Boussole le détecte.'],
  ['Rug pull', 'Les créateurs retirent la liquidité et disparaissent : le token tombe à zéro.'],
  ['Airdrop', 'Distribution gratuite de tokens aux utilisateurs précoces d’un protocole.'],
  ['Stablecoin', 'Crypto indexée sur une monnaie (USDC, USDT, EURC). Sert de réserve pour acheter les baisses.'],
  ['Wallet matériel', 'Appareil (Ledger, Trezor…) qui garde tes clés hors ligne. La meilleure protection pour le long terme.'],
  ['Flat tax', 'En France, prélèvement forfaitaire sur les plus-values crypto : 31,4 % en 2026 (12,8 % d’impôt + 18,6 % de prélèvements sociaux).'],
  ['MiCA', 'Règlement européen encadrant les cryptoactifs et les prestataires (PSAN/CASP). Privilégie des plateformes agréées.'],
];

function Glossary() {
  const [q, setQ] = useState('');
  const list = GLOSSARY.filter(([t, d]) => !q || `${t} ${d}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="Glossaire" actions={<Input className="h-8 w-44" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <dl className="grid gap-3 md:grid-cols-2">
        {list.map(([t, d]) => (
          <div key={t} className="rounded-lg bg-surface-2 p-3"><dt className="text-sm font-medium text-ink">{t}</dt><dd className="mt-0.5 text-sm text-ink-2">{d}</dd></div>
        ))}
      </dl>
    </Card>
  );
}
