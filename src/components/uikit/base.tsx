import { clsx } from 'clsx';
import { type ReactNode } from 'react';
// Structure de page : la carte et l'en-tête, socle de chaque écran (découpage du grand ui.tsx, lot 18).

export function Card({ title, subtitle, actions, children, className, padded = true, id }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; padded?: boolean; id?: string;
}) {
  return (
    <section id={id} className={clsx('rounded-xl border border-line bg-surface', padded && 'p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className={clsx('mb-3 flex items-start justify-between gap-3', !padded && 'px-4 pt-4 sm:px-5 sm:pt-5')}>
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold leading-tight text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

