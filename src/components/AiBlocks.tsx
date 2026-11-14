// Briques d'interface IA : lancement avec estimation du coût, progression en direct, affichage des rapports.

import { Bot, ChevronDown, ExternalLink, KeyRound, Sparkles, Square, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useStore } from '../store/useStore';
import { MODEL_INFO } from '../ai/claude';
import { buildAiConfig, prettyModel } from '../ai/run';
import type { AiConfig, Progress } from '../ai/tasks';
import { useCompatModels, findModel } from '../hooks/useAiModels';
import type { AiReport } from '../types';
import { fmtDate, fmtNum } from '../lib/format';
import { openExternal } from '../lib/platform';
import { navigate } from '../router';
import { Banner, Button, Card, Spinner } from './ui';
import { Markdown } from './Markdown';

export function useAiConfig(): AiConfig | null {
  const s = useStore((st) => st.settings);
  const name = useStore((st) => st.profile.name);
  return buildAiConfig(s, name);
}

/** Exécute une tâche IA avec état (progression, erreur, annulation) et enregistre le rapport. */
export function useAiRunner() {
  const addReport = useStore((s) => s.addReport);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  async function run(task: (onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<AiReport>): Promise<AiReport | null> {
    setRunning(true);
    setError(null);
    setProgress({ step: 'Préparation…' });
    ctrl.current = new AbortController();
    try {
      const report = await task((p) => setProgress(p), ctrl.current.signal);
      addReport(report);
      return report;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setRunning(false);
      setProgress(null);
      ctrl.current = null;
    }
  }

  return { run, running, progress, error, cancel: () => ctrl.current?.abort(), clearError: () => setError(null) };
}

export function NeedKey({ compact }: { compact?: boolean }) {
  return (
    <Banner
      tone="info"
      title="Active ton copilote IA"
      action={<Button size="sm" variant="primary" icon={<KeyRound className="size-4" />} onClick={() => navigate('/reglages')}>Configurer</Button>}
    >
      {compact ? 'Ajoute ta clé API (Nous Portal, Mistral AI ou Claude) dans Réglages.' : 'Ajoute ta clé API (Nous Portal ou Mistral AI pour des modèles économiques, ou Anthropic pour Claude) dans Réglages afin d’obtenir le brief quotidien, le comité des sages et le conseiller. La clé reste sur ton appareil.'}
    </Banner>
  );
}

export function CostHint({ calls, searches = 0 }: { calls: number; searches?: number }) {
  const settings = useStore((s) => s.settings);
  const compat = settings.aiProvider === 'compat';
  const models = useCompatModels(settings.compatBaseUrl, undefined);
  let label: string;
  let perCall: number | null;
  if (settings.aiProvider === 'mistral') {
    // Mistral ne publie pas ses tarifs dans son API : pas d'estimation chiffrée, le rapport affichera les jetons consommés.
    label = prettyModel(settings.mistralModel);
    perCall = null;
  } else if (compat) {
    // Ordre de grandeur : ~20k jetons d'entrée et ~5k de sortie (réflexion comprise) par appel.
    const m = findModel(models.data, settings.compatModel);
    label = prettyModel(settings.compatModel);
    perCall = m?.inPerM != null && m.outPerM != null ? (20000 * m.inPerM + 5000 * m.outPerM) / 1e6 : null;
  } else {
    const m = MODEL_INFO[settings.aiModel];
    label = m.label;
    // Ordre de grandeur : ~20k jetons d'entrée (recherches incluses) et ~3k de sortie par appel.
    perCall = (20000 * m.input + 3000 * m.output) / 1e6 + (settings.aiWebSearch ? (searches / Math.max(calls, 1)) * 0.01 : 0);
  }
  if (perCall == null) return <span className="text-xs text-muted">coût très faible · {label}</span>;
  const est = perCall * calls;
  return <span className="text-xs text-muted">≈ {est < 0.01 ? '< 0,01' : fmtNum(est, 2)} $ · {label}</span>;
}

export function AiProgress({ progress, onCancel }: { progress: Progress | null; onCancel?: () => void }) {
  if (!progress) return null;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <Spinner label={progress.step} />
        {onCancel && <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={onCancel}>Arrêter</Button>}
      </div>
      {progress.total != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-accent/20">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((progress.done ?? 0) / progress.total) * 100}%` }} />
        </div>
      )}
      {progress.text && (
        <div className="mt-3 max-h-80 overflow-y-auto border-t border-line pt-3 opacity-90">
          <Markdown>{progress.text}</Markdown>
        </div>
      )}
    </div>
  );
}

export function SourcesList({ report }: { report: AiReport }) {
  if (!report.sources?.length) return null;
  return (
    <details className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <summary className="cursor-pointer text-ink-2">Sources et actualités ({report.sources.length})</summary>
      <ul className="mt-2 space-y-1">
        {report.sources.map((s) => (
          <li key={s.url}>
            <button type="button" className="inline-flex items-start gap-1 text-left text-accent hover:underline" onClick={() => openExternal(s.url)}>
              <ExternalLink className="mt-0.5 size-3 shrink-0" />
              <span className="break-all">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ReportView({ report, onDelete, headerExtra }: { report: AiReport; onDelete?: () => void; headerExtra?: ReactNode }) {
  const [openPart, setOpenPart] = useState<number | null>(null);
  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" />{report.title}</span>}
      subtitle={`${fmtDate(report.createdAt, true)} · ${prettyModel(report.model)}${report.usage && report.usage.costKnown !== false ? ` · ${fmtNum(report.usage.costUsd, 3)} $` : report.usage && report.usage.inputTokens + report.usage.outputTokens > 0 ? ` · ${fmtNum(report.usage.inputTokens + report.usage.outputTokens, 0)} jetons` : ''}${report.usage?.searches ? ` · ${report.usage.searches} recherches` : ''}`}
      actions={<>{headerExtra}{onDelete && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={onDelete} aria-label="Supprimer le rapport" />}</>}
    >
      <Markdown>{report.markdown}</Markdown>
      {report.parts && report.parts.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-medium text-muted">Rapports détaillés des analystes</p>
          {report.parts.map((p, i) => (
            <div key={i} className="rounded-lg border border-line">
              <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-ink" onClick={() => setOpenPart(openPart === i ? null : i)}>
                <span className="inline-flex items-center gap-2"><Bot className="size-4 text-muted" />{p.title}</span>
                <ChevronDown className={clsx('size-4 text-muted transition-transform', openPart === i && 'rotate-180')} />
              </button>
              {openPart === i && <div className="border-t border-line px-3 py-3"><Markdown>{p.markdown}</Markdown></div>}
            </div>
          ))}
        </div>
      )}
      <SourcesList report={report} />
      <p className="mt-4 text-[0.7rem] text-muted">Analyse générée par IA à partir de données publiques : elle peut contenir des erreurs. Ce n’est pas un conseil en investissement personnalisé — tu restes seul décisionnaire.</p>
    </Card>
  );
}
