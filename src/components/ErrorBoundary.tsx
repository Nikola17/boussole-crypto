// Écran de secours : une erreur d'affichage ne doit jamais laisser un écran blanc ni bloquer l'accès aux données.

import { Component, useState, type ReactNode } from 'react';
import { exportBackup, useStore } from '../store/useStore';
import { isoDay } from '../lib/format';
import { saveTextFile } from '../lib/platform';
import { noteManualBackup } from '../hooks/useBackup';

function Fallback({ error, scope, onRetry }: { error: Error; scope: 'app' | 'page'; onRetry: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const btn = 'inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface-2 px-3.5 text-sm font-medium text-ink hover:bg-surface-3';

  async function doExport() {
    try {
      setMsg(await saveTextFile(`boussole-sauvegarde-${isoDay()}.json`, exportBackup(false)));
      noteManualBackup();
    } catch (e) {
      setMsg(`Export impossible : ${(e as Error).message}`);
    }
  }

  return (
    <div className={scope === 'app' ? 'flex min-h-full items-center justify-center bg-page p-4' : 'p-1'}>
      <div className="w-full max-w-xl rounded-xl border border-critical/40 bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">{scope === 'app' ? 'Boussole a rencontré un problème' : 'Cet écran a rencontré un problème'}</h2>
        <p className="mt-2 text-sm text-ink-2">
          Tes données ne sont pas perdues : elles sont toujours enregistrées sur cet appareil. Tu peux réessayer, ou exporter une copie avant toute autre action.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={onRetry}>Réessayer</button>
          <button type="button" className={btn} onClick={() => void doExport()}>Exporter mes données</button>
          <button type="button" className={btn} onClick={() => { useStore.setState({ reports: [], chat: [] }); onRetry(); }}>Supprimer les rapports IA</button>
          {scope === 'app' && <button type="button" className={btn} onClick={() => window.location.reload()}>Recharger</button>}
        </div>
        <p className="mt-2 text-xs text-muted">« Supprimer les rapports IA » règle la plupart des erreurs venant d’une réponse d’IA mal formée ; tes transactions, plans et réglages ne sont pas touchés.</p>
        {msg && <p className="mt-3 text-sm text-ink-2">{msg}</p>}
        <div className="mt-4 border-t border-line pt-3">
          {!confirmReset ? (
            <button type="button" className="text-xs text-muted underline" onClick={() => setConfirmReset(true)}>Dernier recours : tout réinitialiser…</button>
          ) : (
            <div className="space-y-2 text-sm text-ink-2">
              <p><b className="text-ink">Cela efface toutes tes données</b> (transactions, plans, thèses…). Exporte-les d’abord.</p>
              <div className="flex gap-2">
                <button type="button" className={btn} onClick={() => setConfirmReset(false)}>Annuler</button>
                <button type="button" className={`${btn} border-critical/60 text-critical`} onClick={() => { useStore.getState().resetAll(); onRetry(); }}>Tout effacer</button>
              </div>
            </div>
          )}
        </div>
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">Détail technique</summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words">{error.message}</pre>
        </details>
      </div>
    </div>
  );
}

interface Props { children: ReactNode; scope: 'app' | 'page'; /** Change quand l'utilisateur navigue : l'écran se débloque tout seul. */ resetKey?: string }

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Fallback error={this.state.error} scope={this.props.scope} onRetry={() => this.setState({ error: null })} />;
  }
}
