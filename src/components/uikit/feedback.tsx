import { clsx } from 'clsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Info, Loader2, X } from 'lucide-react';
import { Button, IconButton } from './buttons';
import { createPortal } from 'react-dom';
// Retours de l'interface : attente, vide, bannière, erreur, explication, fenêtre modale (découpage du grand ui.tsx, lot 18).

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'success' ? Check : tone === 'info' ? Info : CircleAlert;
  return (
    <div
      className={clsx(
        'flex gap-3 rounded-xl border p-3.5 text-sm',
        tone === 'info' && 'border-accent/30 bg-accent/8',
        tone === 'warn' && 'border-warn/40 bg-warn/10',
        tone === 'danger' && 'border-critical/40 bg-critical/10',
        tone === 'success' && 'border-good/40 bg-good/10',
      )}
    >
      <Icon className={clsx('mt-0.5 size-4 shrink-0', tone === 'info' && 'text-accent', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-critical', tone === 'success' && 'text-good')} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={clsx('text-ink-2', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Banner tone="warn" title="Données indisponibles" action={onRetry ? <Button size="sm" onClick={onRetry}>Réessayer</Button> : undefined}>
      {msg}
    </Banner>
  );
}

/** Petite bulle d'explication (clic ou survol). */
export function InfoTip({ children, label = 'Explication' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface-2 p-3 text-left text-xs font-normal leading-relaxed text-ink-2 shadow-[var(--shadow)]">
          {children}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ Fenêtre modale

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={clsx('safe-bottom flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-[var(--shadow)] sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h3 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h3>
          <IconButton label="Fermer" onClick={onClose}><X className="size-4" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
