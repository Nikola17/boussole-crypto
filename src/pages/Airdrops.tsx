import { CheckSquare, ExternalLink, Gift, Plus, Radar, ShieldCheck, Sparkles, Square, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { useDefi, useFx } from '../hooks/useMarket';
import { isAirdropCandidate, scoreAirdrop } from '../lib/gems';
import { fmtCompact, fmtDate, fmtMoney, isoDay, uid } from '../lib/format';
import { openExternal } from '../lib/platform';
import { setQuery, useHashPath } from '../router';
import {
  Badge, Banner, Button, Card, CoinIcon, Delta, Empty, ErrorNote, Field, Input, Modal, NumberInput, PageHeader, ScoreBar, Segmented, Select,
  Spinner, Stars, Textarea,
} from '../components/ui';
import { AiProgress, CostHint, NeedKey, ReportView, useAiConfig, useAiRunner } from '../components/AiBlocks';
import { useAiContext } from '../ai/context';
import { runAirdropScout } from '../ai/tasks';
import { readScoutItems } from '../lib/reportData';
import type { AirdropItem, AirdropStatus } from '../types';

type Tab = 'tracker' | 'radar' | 'scout' | 'securite';

const STATUS: Record<AirdropStatus, string> = {
  idee: 'À étudier', farming: 'En cours', eligible: 'Éligible', claimable: 'À réclamer', claimed: 'Réclamé', abandoned: 'Abandonné',
};

export default function Airdrops({ embedded = false }: { embedded?: boolean } = {}) {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'tracker';
  return (
    <div className="space-y-4 sm:space-y-6">
      {!embedded && <PageHeader title="Airdrops" subtitle="Repère les protocoles susceptibles de distribuer un token, organise tes tâches de farming et évite les arnaques." />}
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'tracker', label: 'Mon tracker' },
        { value: 'radar', label: 'Radar DeFi' },
        { value: 'scout', label: 'Éclaireur IA' },
        { value: 'securite', label: 'Sécurité' },
      ]} />
      {tab === 'tracker' && <Tracker />}
      {tab === 'radar' && <RadarTab />}
      {tab === 'scout' && <Scout />}
      {tab === 'securite' && <Safety />}
    </div>
  );
}

function resetRecurring(a: AirdropItem): AirdropItem {
  const today = isoDay();
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDay(d); })();
  let changed = false;
  const tasks = a.tasks.map((t) => {
    if (!t.done || !t.recurring || !t.lastDone) return t;
    const stale = t.recurring === 'daily' ? t.lastDone < today : t.lastDone < monday;
    if (stale) { changed = true; return { ...t, done: false }; }
    return t;
  });
  return changed ? { ...a, tasks } : a;
}

function Tracker() {
  const items = useStore((s) => s.airdrops);
  const upsert = useStore((s) => s.upsertAirdrop);
  const remove = useStore((s) => s.removeAirdrop);
  const currency = useStore((s) => s.settings.currency);
  const [edit, setEdit] = useState<AirdropItem | null>(null);
  const list = useMemo(() => items.map(resetRecurring), [items]);
  const spent = list.reduce((s, a) => s + (a.costSpent || 0), 0);
  const est = list.reduce((s, a) => s + (a.estimatedValue || 0), 0);
  const blank = (): AirdropItem => ({ id: uid(), name: '', ecosystem: '', status: 'farming', tasks: [], wallet: '', costSpent: 0, potential: 3, createdAt: new Date().toISOString() });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(blank())}>Ajouter un airdrop</Button>
        {list.length > 0 && <span className="text-sm text-ink-2">Dépensé : <span className="font-medium text-ink">{fmtMoney(spent, currency, 0)}</span> · valeur espérée : <span className="font-medium text-ink">{fmtMoney(est, currency, 0)}</span></span>}
      </div>
      {!list.length && <Empty icon={<Gift className="size-8" />} title="Aucun airdrop suivi">Ajoute un projet depuis le Radar ou l’Éclaireur IA, puis coche tes tâches (quotidiennes, hebdomadaires…).</Empty>}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((a) => {
          const done = a.tasks.filter((t) => t.done).length;
          const overdue = a.deadline && a.deadline < isoDay() && a.status !== 'claimed';
          return (
            <Card key={a.id} title={a.name} subtitle={[a.ecosystem, a.wallet && `wallet : ${a.wallet}`].filter(Boolean).join(' · ')}
              actions={<><Badge tone={a.status === 'claimable' ? 'up' : a.status === 'abandoned' ? 'neutral' : 'accent'}>{STATUS[a.status]}</Badge><Button size="sm" variant="ghost" onClick={() => setEdit(a)}>Modifier</Button></>}>
              <div className="flex items-center gap-3 text-sm"><Stars value={a.potential} /><span className="text-xs text-muted">{done}/{a.tasks.length} tâches</span>{a.deadline && <span className={clsx('text-xs', overdue ? 'text-down' : 'text-muted')}>échéance {fmtDate(a.deadline)}</span>}</div>
              {a.tasks.length > 0 && <ScoreBar className="mt-2" value={(done / a.tasks.length) * 100} />}
              <ul className="mt-3 space-y-1.5">
                {a.tasks.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="flex w-full items-start gap-2 text-left text-sm" onClick={() => upsert({ ...a, tasks: a.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, lastDone: !x.done ? isoDay() : x.lastDone } : x)) })}>
                      {t.done ? <CheckSquare className="mt-0.5 size-4 shrink-0 text-good" /> : <Square className="mt-0.5 size-4 shrink-0 text-muted" />}
                      <span className={clsx(t.done ? 'text-muted line-through' : 'text-ink')}>{t.label}</span>
                      {t.recurring && <Badge className="ml-auto">{t.recurring === 'daily' ? 'quotidien' : 'hebdo'}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                <span>Coût : {fmtMoney(a.costSpent || 0, currency, 0)}</span>
                {a.estimatedValue ? <span>· espéré : {fmtMoney(a.estimatedValue, currency, 0)}</span> : null}
                {a.url && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(a.url!)}>Site</Button>}
                <Button size="sm" variant="ghost" className="ml-auto" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => remove(a.id)} />
              </div>
              {a.notes && <p className="mt-2 whitespace-pre-line text-xs text-ink-2">{a.notes}</p>}
            </Card>
          );
        })}
      </div>
      <AirdropModal item={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function AirdropModal({ item, onClose }: { item: AirdropItem | null; onClose: () => void }) {
  const upsert = useStore((s) => s.upsertAirdrop);
  const [a, setA] = useState<AirdropItem | null>(null);
  const [newTask, setNewTask] = useState('');
  const [rec, setRec] = useState<'' | 'daily' | 'weekly'>('');
  if (item && (!a || a.id !== item.id)) setA(item);
  if (!item) { if (a) setA(null); return null; }
  if (!a) return null;
  const set = (p: Partial<AirdropItem>) => setA({ ...a, ...p });
  return (
    <Modal open={!!item} onClose={onClose} title={a.name || 'Nouvel airdrop'} footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!a.name.trim()} onClick={() => { upsert(a); onClose(); }}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Projet"><Input value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Écosystème"><Input value={a.ecosystem} onChange={(e) => set({ ecosystem: e.target.value })} placeholder="Ex : Base, Solana" /></Field>
          <Field label="Statut"><Select value={a.status} onChange={(e) => set({ status: e.target.value as AirdropStatus })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Potentiel (1-5)"><Select value={a.potential} onChange={(e) => set({ potential: Number(e.target.value) as AirdropItem['potential'] })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</Select></Field>
          <Field label="Wallet utilisé"><Input value={a.wallet} onChange={(e) => set({ wallet: e.target.value })} placeholder="Ex : wallet airdrop #2" /></Field>
          <Field label="Échéance"><Input type="date" value={a.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} /></Field>
          <Field label="Coût engagé (frais, capital)"><NumberInput value={a.costSpent} onChange={(v) => set({ costSpent: v === '' ? 0 : v })} /></Field>
          <Field label="Valeur espérée"><NumberInput value={a.estimatedValue ?? ''} onChange={(v) => set({ estimatedValue: v === '' ? undefined : v })} /></Field>
        </div>
        <Field label="Site officiel"><Input value={a.url ?? ''} onChange={(e) => set({ url: e.target.value || undefined })} placeholder="https://…" /></Field>
        <div>
          <p className="mb-2 text-xs font-medium text-ink-2">Tâches</p>
          <ul className="space-y-1.5">
            {a.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{t.label}</span>
                {t.recurring && <Badge>{t.recurring === 'daily' ? 'quotidien' : 'hebdo'}</Badge>}
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} aria-label="Supprimer" onClick={() => set({ tasks: a.tasks.filter((x) => x.id !== t.id) })} />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Ex : faire un swap sur le DEX" />
            <Select value={rec} onChange={(e) => setRec(e.target.value as '' | 'daily' | 'weekly')} className="w-32"><option value="">Une fois</option><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option></Select>
            <Button onClick={() => { if (newTask.trim()) { set({ tasks: [...a.tasks, { id: uid(), label: newTask.trim(), done: false, recurring: rec || undefined }] }); setNewTask(''); } }}>Ajouter</Button>
          </div>
        </div>
        <Field label="Notes"><Textarea value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function RadarTab() {
  const [enabled, setEnabled] = useState(false);
  const defi = useDefi(enabled);
  const upsert = useStore((s) => s.upsertAirdrop);
  const items = useStore((s) => s.airdrops);
  const currency = useStore((s) => s.settings.currency);
  const fx = useFx();
  const rate = currency === 'EUR' ? fx : 1;
  const rows = useMemo(() => (defi.data?.protocols ?? [])
    .filter((p) => (!p.symbol || p.symbol === '-') && !p.gecko_id && !p.parentProtocol)
    .map((p) => ({ p, input: { name: p.name, category: p.category, tvl: p.tvl ?? 0, change7d: p.change_7d, chains: p.chains, listedAt: p.listedAt } }))
    .filter((r) => isAirdropCandidate(r.input))
    .map((r) => ({ ...r, s: scoreAirdrop(r.input) }))
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, 40), [defi.data]);

  if (!enabled) {
    return (
      <Card title={<span className="inline-flex items-center gap-2"><Radar className="size-4 text-accent" />Radar des protocoles sans token</span>} subtitle="Un protocole avec beaucoup de valeur déposée (TVL) mais sans token est un candidat naturel à un futur airdrop.">
        <p className="mb-3 text-sm text-ink-2">Source : DefiLlama (~10 Mo, chargé à la demande). Rien n’est garanti : un airdrop dépend toujours de la décision de l’équipe.</p>
        <Button variant="primary" icon={<Radar className="size-4" />} onClick={() => setEnabled(true)}>Lancer le radar</Button>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {defi.isLoading && <Spinner label="Analyse des protocoles DefiLlama…" />}
      {defi.error && <ErrorNote error={defi.error} onRetry={() => defi.refetch()} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ p, s }) => {
          const tracked = items.some((a) => a.name.toLowerCase() === p.name.toLowerCase());
          return (
            <div key={p.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <CoinIcon src={p.logo} symbol={p.name} size={28} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{p.name}</div><div className="truncate text-xs text-muted">{p.category} · {p.chains.slice(0, 3).join(', ')}</div></div>
                <span className="text-lg font-semibold text-ink">{s.score}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs"><span className="text-muted">TVL</span><span className="tnum text-ink">{fmtCompact((p.tvl ?? 0) * rate, currency)}</span><span className="text-muted">7 j</span><Delta value={p.change_7d} /></div>
              <div className="mt-2 flex flex-wrap gap-1">{s.flags.map((f, i) => <Badge key={i} tone={f.tone === 'good' ? 'up' : 'warn'}>{f.label}</Badge>)}</div>
              <div className="mt-3 flex gap-2">
                {p.url && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(p.url!)}>Site</Button>}
                <Button size="sm" disabled={tracked} onClick={() => upsert({ id: uid(), name: p.name, ecosystem: p.chains[0] ?? '', status: 'idee', tasks: [], wallet: '', costSpent: 0, potential: s.score >= 75 ? 4 : 3, url: p.url, notes: `Catégorie ${p.category}. Repéré par le radar Boussole (TVL ${fmtCompact(p.tvl ?? 0, 'USD')}).`, createdAt: new Date().toISOString() })}>{tracked ? 'Déjà suivi' : 'Suivre'}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scout() {
  const cfg = useAiConfig();
  const ctx = useAiContext();
  const runner = useAiRunner();
  const reports = useStore((s) => s.reports);
  const removeReport = useStore((s) => s.removeReport);
  const upsert = useStore((s) => s.upsertAirdrop);
  const items = useStore((s) => s.airdrops);
  const last = reports.find((r) => r.kind === 'airdrops');
  const found = readScoutItems(last?.data);

  return (
    <div className="space-y-4">
      <Card title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />Éclaireur d’airdrops</span>} subtitle="L’IA parcourt le web pour trouver les campagnes et programmes de points actifs, avec coût, effort, potentiel et risques.">
        {!cfg ? <NeedKey compact /> : !cfg.webSearch ? (
          <Banner tone="info" title="Disponible avec Claude + recherche web">L’éclaireur doit lire le web du jour pour trouver des campagnes actives : sans accès web, un modèle inventerait des airdrops périmés. Avec ton modèle actuel, utilise le <b>Radar DeFi</b> (données réelles DefiLlama) ou passe sur Claude dans Réglages.</Banner>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Sparkles className="size-4" />} disabled={runner.running} onClick={() => void runner.run((onP, signal) => runAirdropScout(cfg, { profile: ctx.profile(), radar: null }, onP, signal))}>Lancer l’exploration</Button>
            <CostHint calls={1} searches={8} />
          </div>
        )}
        {runner.running && <div className="mt-4"><AiProgress progress={runner.progress} onCancel={runner.cancel} /></div>}
        {runner.error && <div className="mt-4"><Banner tone="warn">{runner.error}</Banner></div>}
      </Card>
      {found.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {found.map((f, i) => {
            const tracked = items.some((a) => a.name.toLowerCase() === f.name.toLowerCase());
            return (
              <div key={i} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="font-medium text-ink">{f.name}</div><div className="text-xs text-muted">{[f.ecosystem, f.type, f.status].filter(Boolean).join(' · ')}</div></div>
                  <div className="text-right"><Stars value={f.potential ?? 3} /><div className="text-[0.7rem] text-muted">risque {f.risk ?? '?'}/5</div></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {f.cost && <Badge>{f.cost}</Badge>}
                  {f.effort && <Badge>effort {f.effort}</Badge>}
                  <Badge tone={f.confirmed ? 'up' : 'warn'}>{f.confirmed ? 'Token confirmé' : 'Spéculatif'}</Badge>
                  {f.deadline && <Badge>avant le {fmtDate(f.deadline)}</Badge>}
                </div>
                {f.steps?.length ? <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-ink-2">{f.steps.slice(0, 4).map((s, j) => <li key={j}>{s}</li>)}</ol> : null}
                <div className="mt-3 flex gap-2">
                  {f.url && <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(f.url!)}>Site</Button>}
                  <Button size="sm" disabled={tracked} onClick={() => upsert({
                    id: uid(), name: f.name, ecosystem: f.ecosystem ?? '', status: 'farming',
                    tasks: (f.steps ?? []).map((s) => ({ id: uid(), label: s, done: false })), wallet: '', costSpent: 0,
                    potential: Math.min(5, Math.max(1, Math.round(f.potential ?? 3))) as AirdropItem['potential'], deadline: f.deadline ?? undefined, url: f.url, createdAt: new Date().toISOString(),
                  })}>{tracked ? 'Déjà suivi' : 'Ajouter au tracker'}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {last && <ReportView report={last} onDelete={() => removeReport(last.id)} />}
    </div>
  );
}

function Safety() {
  const rules = [
    ['Un wallet dédié aux airdrops', 'Ne connecte jamais ton wallet principal (épargne) à un site d’airdrop. Crée un wallet séparé avec juste de quoi payer les frais.'],
    ['Vérifie chaque URL', 'Les faux sites d’airdrop sont la première arnaque crypto. Passe toujours par le compte X officiel ou la documentation du projet, jamais par une pub ou un message privé.'],
    ['Lis ce que tu signes', 'Un « claim » ne demande jamais d’approuver tous tes tokens (setApprovalForAll, permit illimité). Si ton wallet affiche un transfert de tes actifs, refuse.'],
    ['Révoque les approbations', 'Une fois par mois, révoque les autorisations inutiles avec revoke.cash ou l’outil intégré de ton wallet.'],
    ['Personne ne te contacte pour t’aider', 'Le support d’un projet ne t’écrit jamais en privé. Quiconque demande ta phrase secrète est un voleur, sans exception.'],
    ['Calcule ton coût réel', 'Frais de transaction + capital immobilisé + temps passé. Un airdrop incertain ne vaut pas 300 € de frais.'],
    ['Fiscalité', 'En France, un token reçu gratuitement a en principe un prix d’acquisition nul : sa revente en euros sera imposée sur la totalité.'],
  ];
  return (
    <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-accent" />Farmer sans se faire piéger</span>}>
      <ul className="space-y-3">
        {rules.map(([t, d]) => (
          <li key={t} className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
            <div><p className="text-sm font-medium text-ink">{t}</p><p className="text-sm text-ink-2">{d}</p></div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal('https://revoke.cash')}>revoke.cash</Button>
        <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal('https://defillama.com/airdrops')}>DefiLlama airdrops</Button>
      </div>
    </Card>
  );
}
