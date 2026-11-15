// Adresses de l'application : le menu regroupé en 9 entrées, et les anciennes adresses qui restent valides
// (un lien enregistré vers /smart, /airdrops ou /papier ouvre la page qui les accueille, au bon onglet).

export type Page = 'cockpit' | 'marche' | 'dca' | 'portefeuille' | 'labo' | 'pepites' | 'trading' | 'ia' | 'plus' | 'defi' | 'guide' | 'reglages';

const PAGES = new Set<string>(['marche', 'dca', 'portefeuille', 'labo', 'pepites', 'trading', 'ia', 'plus', 'defi', 'guide', 'reglages']);
const MOVED: Record<string, { page: Page; tab: string }> = {
  '/smart': { page: 'pepites', tab: 'smart' },
  '/airdrops': { page: 'pepites', tab: 'airdrops' },
  '/papier': { page: 'labo', tab: 'papier' },
};

export function resolveRoute(path: string): { page: Page; tab?: string } {
  if (MOVED[path]) return MOVED[path];
  const p = path.replace(/^\//, '');
  return PAGES.has(p) ? { page: p as Page } : { page: 'cockpit' };
}

export interface NavRoute { to: string; label: string; mobile?: boolean; also?: string[] }

/** Menu : 9 entrées ; barre du bas sur téléphone : les 5 premières. `also` : adresses où l'entrée est active. */
export const NAV_ROUTES: NavRoute[] = [
  { to: '/', label: 'Cockpit', mobile: true },
  { to: '/marche', label: 'Signaux', mobile: true, also: ['/coin/'] },
  { to: '/dca', label: 'DCA', mobile: true },
  { to: '/portefeuille', label: 'Wallet', mobile: true },
  { to: '/labo', label: 'Labo', mobile: true, also: ['/papier'] },
  { to: '/pepites', label: 'Pépites', also: ['/smart', '/airdrops'] },
  { to: '/trading', label: 'Trading' },
  { to: '/ia', label: 'Copilote IA' },
  { to: '/plus', label: 'Plus', also: ['/defi', '/guide', '/reglages'] },
];

export function isNavActive(path: string, n: NavRoute): boolean {
  if (n.to === '/') return path === '/' || path === '';
  return path === n.to || path.startsWith(`${n.to}/`) || (n.also ?? []).some((a) => (a.endsWith('/') ? path.startsWith(a) : path === a));
}
