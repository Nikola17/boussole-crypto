import { Bot, Eraser, History, MessageSquare, Send, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { useBriefing } from '../hooks/useBriefing';
import { useAiConfig } from '../components/AiBlocks';
import { useAiContext } from '../ai/context';
import { runChat } from '../ai/tasks';
import { aiLabel } from '../ai/run';
import { fmtDate, uid } from '../lib/format';
import { navigate, setQuery, useHashPath } from '../router';
import { AiProgress, CostHint, NeedKey, ReportView } from '../components/AiBlocks';
import { Badge, Banner, Button, Card, Empty, ErrorNote, PageHeader, Segmented, Textarea } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { CoinPicker } from '../components/CoinPicker';
import type { AiReportKind } from '../types';

type Tab = 'brief' | 'chat' | 'comite' | 'historique';

const KIND_LABEL: Record<AiReportKind, string> = {
  briefing: 'Brief', committee: 'Comité', quick: 'Analyse rapide', pulse: 'Pourquoi ça bouge', airdrops: 'Airdrops', journal: 'Journal', thesis: 'Thèse', gem: 'Pépite',
};

export default function Advisor() {
  const { query } = useHashPath();
  const tab = (query.get('tab') as Tab) || 'brief';
  const cfg = useAiConfig();
  const label = useStore((s) => aiLabel(s.settings));
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Copilote IA"
        subtitle={<>Ton conseiller personnel, propulsé par {label}. Il connaît ton profil, ton portefeuille, ton DCA et le marché du jour, et applique la méthode des grands investisseurs : faits sourcés, inversion, verdict clair.</>}
      />
      {!cfg && <NeedKey />}
      <Segmented value={tab} onChange={(v) => setQuery({ tab: v })} options={[
        { value: 'brief', label: 'Brief du jour' },
        { value: 'chat', label: 'Conseiller' },
        { value: 'comite', label: 'Comité des sages' },
        { value: 'historique', label: 'Historique' },
      ]} />
      {tab === 'brief' && <BriefTab />}
      {tab === 'chat' && <ChatTab />}
      {tab === 'comite' && <CommitteeTab />}
      {tab === 'historique' && <HistoryTab />}
    </div>
  );
}

function BriefTab() {
  const b = useBriefing();
  const removeReport = useStore((s) => s.removeReport);
  const reports = useStore((s) => s.reports);
  const previous = reports.filter((r) => r.kind === 'briefing' && r.id !== b.latest?.id).slice(0, 6);
  return (
    <div className="space-y-4">
      {b.cfg && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Sparkles className="size-4" />} disabled={b.running || !b.ready} onClick={() => void b.generate()}>{b.todays ? 'Régénérer le brief' : 'Générer le brief du jour'}</Button>
          <CostHint calls={1} searches={6} />
          {!b.ready && !b.loadError && <span className="text-xs text-muted">Chargement des données de marché…</span>}
        </div>
      )}
      {b.cfg && !b.ready && b.loadError && <ErrorNote error={b.loadError} onRetry={b.retry} />}
      {b.running && <AiProgress progress={b.progress} onCancel={b.cancel} />}
      {b.error && <Banner tone="warn" title="Brief impossible">{b.error}</Banner>}
      {b.latest ? <ReportView report={b.latest} onDelete={() => removeReport(b.latest!.id)} /> : !b.running && <Empty icon={<Sparkles className="size-8" />} title="Pas encore de brief">Le brief quotidien combine les données de marché, l’actualité (recherche web), ton portefeuille et ton DCA pour te dire quoi faire aujourd’hui. Active la génération automatique dans Réglages.</Empty>}
      {previous.length > 0 && (
        <Card title="Briefs précédents">
          <ul className="divide-y divide-line text-sm">
            {previous.map((r) => (
              <li key={r.id}><button type="button" className="flex w-full justify-between py-2 text-left hover:text-ink" onClick={() => setQuery({ tab: 'historique', id: r.id })}><span className="text-ink">{r.title}</span><span className="text-xs text-muted">{fmtDate(r.createdAt, true)}</span></button></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  'Est-ce un bon moment pour renforcer mon DCA sur Bitcoin ?',
  'Mon portefeuille est-il trop risqué pour mon profil ?',
  'Quelles positions devrais-je alléger si le marché devient euphorique ?',
  'Explique-moi simplement ce qu’est le multiple de Mayer.',
  'Quelles narratives crypto montent en ce moment, et lesquelles éviter ?',
  'Comment préparer ma déclaration fiscale crypto ?',
];

function ChatTab() {
  const cfg = useAiConfig();
  const ctx = useAiContext();
  const chat = useStore((s) => s.chat);
  const addChat = useStore((s) => s.addChat);
  const clearChat = useStore((s) => s.clearChat);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.length, streaming]);

  async function send(q?: string) {
    const question = (q ?? input).trim();
    if (!question || !cfg || streaming != null || !ctx.ready) return;
    setInput('');
    setError(null);
    const history = useStore.getState().chat;
    addChat({ id: uid(), role: 'user', content: question, createdAt: new Date().toISOString() });
    setStreaming('');
    ctrl.current = new AbortController();
    try {
      const r = await runChat(cfg, history, question, { market: ctx.market(), portfolio: ctx.portfolio(), profile: ctx.profile(), dca: ctx.dca(ctx.cycle?.temperature) }, (t) => setStreaming(t), ctrl.current.signal);
      addChat({ id: uid(), role: 'assistant', content: r.text, createdAt: new Date().toISOString(), usage: r.usage });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(null);
      ctrl.current = null;
    }
  }

  if (!cfg) return null;
  return (
    <Card padded={false} className="flex min-h-[60dvh] flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink"><MessageSquare className="size-4 text-accent" />Conseiller</span>
        {chat.length > 0 && <Button size="sm" variant="ghost" icon={<Eraser className="size-3.5" />} onClick={clearChat}>Effacer</Button>}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!chat.length && streaming == null && (
          <div>
            <p className="mb-3 text-sm text-ink-2">Pose ta question comme à un conseiller qui connaît ton dossier. Exemples :</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-3">{s}</button>)}
            </div>
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={clsx('max-w-[92%] rounded-2xl px-4 py-2.5 sm:max-w-[80%]', m.role === 'user' ? 'bg-accent text-accent-ink' : 'border border-line bg-surface-2')}>
              {m.role === 'user' ? <p className="whitespace-pre-wrap text-sm">{m.content}</p> : <Markdown>{m.content}</Markdown>}
              {m.usage && <p className="mt-1 text-[0.65rem] text-muted">{m.usage.costUsd.toFixed(3).replace('.', ',')} $</p>}
            </div>
          </div>
        ))}
        {streaming != null && (
          <div className="flex justify-start">
            <div className="max-w-[92%] rounded-2xl border border-line bg-surface-2 px-4 py-2.5 sm:max-w-[80%]">
              {streaming ? <Markdown>{streaming}</Markdown> : <span className="animate-pulse-soft text-sm text-muted">Réflexion en cours…</span>}
            </div>
          </div>
        )}
        {error && <Banner tone="warn">{error}</Banner>}
        <div ref={endRef} />
      </div>
      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea
          className="min-h-11 flex-1 resize-none"
          rows={1}
          value={input}
          placeholder="Ta question…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        {streaming != null
          ? <Button variant="secondary" onClick={() => ctrl.current?.abort()}>Arrêter</Button>
          : <Button type="submit" variant="primary" icon={<Send className="size-4" />} disabled={!input.trim() || !ctx.ready} title={ctx.ready ? undefined : 'Chargement des données de marché…'}>Envoyer</Button>}
      </form>
    </Card>
  );
}

function CommitteeTab() {
  const reports = useStore((s) => s.reports);
  const [coin, setCoin] = useState<{ coinId: string; symbol: string; name: string; image?: string } | null>(null);
  const committees = reports.filter((r) => r.kind === 'committee').slice(0, 10);
  return (
    <div className="space-y-4">
      <Card title={<span className="inline-flex items-center gap-2"><Users className="size-4 text-accent" />Le comité des 4 sages</span>} subtitle="Quatre analystes IA étudient une crypto en parallèle, chacun avec la grille d’un grand investisseur, puis un président tranche.">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Le Bâtisseur', 'Duan Yongping', 'Produit, adoption, modèle économique, capture de valeur par le token.'],
            ['L’Évaluateur', 'Warren Buffett', 'Tokenomics, déblocages, valorisation (P/F, P/S), marge de sécurité.'],
            ['L’Avocat du diable', 'Charlie Munger', 'Concurrence, inversion : comment ce projet peut-il mourir ?'],
            ['Le Gardien', 'Li Lu', 'Équipe, gouvernance, sécurité, réglementation, horizon 5-10 ans.'],
          ].map(([n, i, d]) => (
            <div key={n} className="rounded-lg bg-surface-2 p-3"><p className="font-medium text-ink">{n}</p><p className="text-xs text-muted">inspiré de {i}</p><p className="mt-1 text-xs text-ink-2">{d}</p></div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm"><CoinPicker value={coin} onChange={setCoin} /></div>
          <Button variant="primary" disabled={!coin} icon={<Bot className="size-4" />} onClick={() => coin && navigate(`/coin/${coin.coinId}`)}>Ouvrir la fiche et lancer le comité</Button>
          <CostHint calls={5} searches={16} />
        </div>
        <p className="mt-2 text-xs text-muted">Le comité se lance depuis la fiche d’une crypto, pour profiter de ses données techniques.</p>
      </Card>
      {committees.map((r) => <ReportView key={r.id} report={r} />)}
    </div>
  );
}

function HistoryTab() {
  const { query } = useHashPath();
  const reports = useStore((s) => s.reports);
  const removeReport = useStore((s) => s.removeReport);
  const selected = query.get('id');
  const sel = reports.find((r) => r.id === selected) ?? null;
  const monthCost = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return reports.filter((r) => r.createdAt.startsWith(ym)).reduce((s, r) => s + (r.usage?.costUsd ?? 0), 0);
  }, [reports]);
  if (!reports.length) return <Empty icon={<History className="size-8" />} title="Aucun rapport">Tes analyses IA sont conservées ici (les 60 dernières).</Empty>;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Rapports" subtitle={`Coût IA estimé ce mois-ci : ${monthCost.toFixed(2).replace('.', ',')} $`}>
        <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
          {reports.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setQuery({ id: r.id })} className={clsx('w-full px-2 py-2 text-left hover:bg-surface-2', selected === r.id && 'bg-surface-2')}>
                <div className="flex items-center gap-2"><Badge>{KIND_LABEL[r.kind]}</Badge><span className="truncate text-sm text-ink">{r.title}</span></div>
                <div className="mt-0.5 text-xs text-muted">{fmtDate(r.createdAt, true)}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="lg:col-span-2">
        {sel ? <ReportView report={sel} onDelete={() => { removeReport(sel.id); setQuery({ id: null }); }} /> : <Empty title="Sélectionne un rapport" />}
      </div>
    </div>
  );
}
