// Mini-routeur par hash (#/chemin) : fonctionne en file:// (Electron) et dans la WebView Android.

import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

function current(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHashPath(): { path: string; query: URLSearchParams; full: string } {
  const full = useSyncExternalStore(subscribe, current, () => '/');
  const [path, qs] = full.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? ''), full };
}

export function navigate(to: string) {
  if (current() === to) return;
  window.location.hash = to;
  window.scrollTo({ top: 0 });
}

export function setQuery(params: Record<string, string | null>) {
  const { path, query } = { path: current().split('?')[0], query: new URLSearchParams(current().split('?')[1] ?? '') };
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') query.delete(k);
    else query.set(k, v);
  }
  const qs = query.toString();
  const next = `${path}${qs ? `?${qs}` : ''}`;
  if (next !== current()) window.history.replaceState(null, '', `#${next}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
