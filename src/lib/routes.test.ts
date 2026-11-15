import { describe, expect, it } from 'vitest';
import { NAV_ROUTES, resolveRoute } from './routes';

describe('adresses de l’application', () => {
  it('les anciennes adresses ouvrent la bonne page au bon onglet', () => {
    expect(resolveRoute('/smart')).toEqual({ page: 'pepites', tab: 'smart' });
    expect(resolveRoute('/airdrops')).toEqual({ page: 'pepites', tab: 'airdrops' });
    expect(resolveRoute('/papier')).toEqual({ page: 'labo', tab: 'papier' });
    for (const p of ['defi', 'guide', 'reglages', 'ia', 'dca', 'trading', 'marche', 'portefeuille', 'labo', 'pepites', 'plus']) expect(resolveRoute(`/${p}`)).toEqual({ page: p });
    expect(resolveRoute('/')).toEqual({ page: 'cockpit' });
    expect(resolveRoute('/inconnue')).toEqual({ page: 'cockpit' });
  });
  it('menu de 9 entrées, barre du bas de 5', () => {
    expect(NAV_ROUTES.map((n) => n.label)).toEqual(['Cockpit', 'Signaux', 'DCA', 'Wallet', 'Labo', 'Pépites', 'Trading', 'Copilote IA', 'Plus']);
    expect(NAV_ROUTES.filter((n) => n.mobile).map((n) => n.label)).toEqual(['Cockpit', 'Signaux', 'DCA', 'Wallet', 'Labo']);
  });
});
