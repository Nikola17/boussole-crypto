// Structure de l'application : barre latérale (ordinateur), barre du bas + menu (mobile).

import { clsx } from 'clsx';
import {
  Bot, CandlestickChart, FlaskConical, Gem, LayoutDashboard, LineChart, Menu, MoreHorizontal, Repeat, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { isNavActive, NAV_ROUTES } from '../lib/routes';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useHashPath } from '../router';
import { useStore } from '../store/useStore';
import { aiReady } from '../ai/run';
import { StaleDataBanner, StorageBanner } from './StatusBanners';

const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard, '/marche': LineChart, '/dca': Repeat, '/portefeuille': Wallet, '/labo': FlaskConical,
  '/pepites': Gem, '/trading': CandlestickChart, '/ia': Bot, '/plus': MoreHorizontal,
};
export const NAV = NAV_ROUTES.map((n) => ({ ...n, icon: ICONS[n.to] ?? MoreHorizontal }));
const NAV_BY_TO = new Map(NAV_ROUTES.map((n) => [n.to, n]));
const isActive = (path: string, to: string) => { const n = NAV_BY_TO.get(to); return n ? isNavActive(path, n) : path === to; };


export function Layout({ children }: { children: ReactNode }) {
  const { path } = useHashPath();
  const [menu, setMenu] = useState(false);
  const name = useStore((s) => s.profile.name);
  const hasKey = useStore((s) => aiReady(s.settings));

  // Sur mobile, le clavier remonte la barre du bas au milieu de l'écran : on la masque pendant la saisie.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement
      || t instanceof HTMLSelectElement
      || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(t.type));
    const onIn = (e: FocusEvent) => setTyping(isTextField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  return (
    <div className="flex min-h-full overflow-x-clip">
      {/* Barre latérale */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <img src="./icon.svg" alt="" className="size-9" />
          <span>
            <span className="block text-[0.95rem] font-semibold leading-tight text-ink">Boussole</span>
            <span className="block text-[0.7rem] text-muted">Copilote crypto</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                isActive(path, n.to) ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <n.icon className={clsx('size-[18px]', isActive(path, n.to) ? 'text-accent' : 'text-muted')} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-lg border border-line p-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className={clsx('size-2 rounded-full', hasKey ? 'bg-good' : 'bg-surface-3')} />
            {hasKey ? 'IA connectée' : 'IA non configurée'}
          </div>
          {name && <div className="mt-1">Profil : {name}</div>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre supérieure mobile */}
        <header className="safe-top sticky top-0 z-30 flex items-center justify-between border-b border-line bg-page/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link to="/" className="flex items-center gap-2">
            <img src="./icon.svg" alt="" className="size-8" />
            <span className="text-[0.95rem] font-semibold text-ink">Boussole</span>
          </Link>
          <button type="button" aria-label="Ouvrir le menu" onClick={() => setMenu(true)} className="inline-flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2">
            <Menu className="size-5" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="space-y-3 empty:hidden [&:not(:empty)]:mb-4"><StorageBanner /><StaleDataBanner /></div>
          {children}
        </main>

        {/* Barre du bas mobile */}
        <nav className={clsx('safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden', typing && 'hidden')} aria-label="Navigation">
          {NAV.filter((n) => n.mobile).map((n) => (
            <Link key={n.to} to={n.to} className={clsx('flex flex-col items-center gap-0.5 py-2 text-[0.65rem]', isActive(path, n.to) ? 'text-accent' : 'text-muted')}>
              <n.icon className="size-5" />
              {n.label.replace('Copilote ', '')}
            </Link>
          ))}
        </nav>
      </div>

      {/* Menu mobile complet */}
      {menu && (
        <div className="fixed inset-0 z-50 bg-black/55 lg:hidden" onClick={() => setMenu(false)}>
          <div className="safe-top absolute right-0 top-0 h-full w-72 max-w-[85vw] border-l border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-ink">Menu</span>
              <button type="button" aria-label="Fermer le menu" onClick={() => setMenu(false)} className="inline-flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"><X className="size-5" /></button>
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className={clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm', isActive(path, n.to) ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2')}>
                  <n.icon className="size-[18px] text-muted" />
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
