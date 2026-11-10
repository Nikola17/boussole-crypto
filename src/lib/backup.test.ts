import { describe, expect, it } from 'vitest';
import { countsOf, DATA_VERSION, hasUserData, importableSettings, validateBackup } from './backup';
import { readBriefActions, readScoutItems, readThesisStatuses, sanitizeReportData } from './reportData';
import { autoBackupDue, backupFileName, backupReminderDue, backupsToPrune, daysSinceBackup, describeBackupAge } from './autoBackup';

const tx = (over: Record<string, unknown> = {}) => ({
  id: 't1', coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', date: '2026-08-01', type: 'buy', quantity: 0.001, price: 60000, currency: 'EUR', fee: 0, fxEurPerUsd: 0.87, ...over,
});
const file = (over: Record<string, unknown> = {}) => ({ app: 'boussole-crypto', version: DATA_VERSION, exportedAt: '2026-11-09T10:00:00.000Z', transactions: [tx()], accounts: [], ...over });

describe('vérification d’un fichier de sauvegarde', () => {
  it('accepte une sauvegarde valide et la résume', () => {
    const c = validateBackup(file());
    expect(c.ok).toBe(true);
    expect(c.summary.counts.find((x) => x.label === 'transactions')?.n).toBe(1);
    expect(c.summary.exportedAt).toBe('2026-11-09T10:00:00.000Z');
    expect(c.dropped).toBe(0);
  });

  it('refuse ce qui n’est pas une sauvegarde Boussole', () => {
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup([1, 2]).ok).toBe(false);
    expect(validateBackup({ app: 'boussole-crypto' }).errors.join(' ')).toContain('aucune donnée');
  });

  it('refuse une sauvegarde d’une version plus récente (rien n’est importé)', () => {
    const c = validateBackup(file({ version: DATA_VERSION + 1 }));
    expect(c.ok).toBe(false);
    expect(c.errors[0]).toContain('plus récente');
    expect(c.data).toEqual({});
  });

  it('refuse une rubrique du mauvais type au lieu de l’écraser', () => {
    const c = validateBackup(file({ transactions: 'oups' }));
    expect(c.ok).toBe(false);
    expect(c.errors.join(' ')).toContain('transactions');
    expect(validateBackup(file({ basket: 12 })).ok).toBe(false);
    expect(validateBackup(file({ profile: [] })).ok).toBe(false);
  });

  it('écarte les transactions inexploitables et le dit', () => {
    const c = validateBackup(file({ transactions: [tx(), tx({ id: 't2', quantity: 'beaucoup' }), tx({ id: 't3', type: 'gift' }), tx({ id: 't4', date: 'hier' }), { id: 't5' }, 42, tx({ id: 't6', fxEurPerUsd: 0 })] }));
    expect(c.ok).toBe(true);
    expect((c.data.transactions as unknown[]).length).toBe(1);
    expect(c.dropped).toBe(6);
    expect(c.warnings.join(' ')).toContain('6 éléments illisibles');
  });

  it('ne reprend jamais les clés, le serveur d’IA ni les réglages propres à un appareil', () => {
    const evil = { currency: 'USD', theme: 'dark', compatBaseUrl: 'https://pirate.example/v1', aiProvider: 'compat', compatKey: 'sk-x', anthropicKey: 'sk-y', coingeckoKey: 'CG-z', closeToTray: false, autoStart: true, notifications: false, taxRatePct: 30 };
    const c = validateBackup(file({ settings: evil }));
    expect(c.data.settings).toEqual({ currency: 'USD', theme: 'dark', taxRatePct: 30 });
  });

  it('les réglages importés sont typés (valeurs absurdes ignorées)', () => {
    expect(importableSettings({ currency: 'BTC', theme: 'rose', taxRatePct: 900, scanSize: 7, briefingAuto: 'oui', aiModel: '' })).toEqual({});
    expect(importableSettings('x')).toEqual({});
    expect(importableSettings({ scanSize: 100, aiWebSearch: false, compatModel: 'deepseek/deepseek-v4.1-flash' })).toEqual({ scanSize: 100, aiWebSearch: false, compatModel: 'deepseek/deepseek-v4.1-flash' });
  });

  it('remet en forme le JSON des rapports IA importés', () => {
    const reports = [
      { id: 'r1', kind: 'briefing', title: 'Brief', createdAt: 'x', day: 'x', model: 'm', markdown: 'ok', data: { actions: 'pas une liste' } },
      { id: 'r2', kind: 'briefing', title: 'Brief', createdAt: 'x', day: 'x', model: 'm', markdown: 'ok', data: { actions: [{ type: 'ACHAT', asset: 'BTC', detail: 'x', priority: 1 }, null, 7] } },
    ];
    const c = validateBackup(file({ reports }));
    const out = c.data.reports as { data: Record<string, unknown> | null }[];
    expect(out[0].data?.actions).toBeUndefined();
    expect((out[1].data?.actions as unknown[]).length).toBe(1);
  });

  it('exitDone ne garde que des nombres', () => {
    const c = validateBackup(file({ exitDone: { bitcoin: [2, 'x', 3, null] } }));
    expect(c.data.exitDone).toEqual({ bitcoin: [2, 3] });
  });

  it('compte les rubriques, et reconnaît un état vide', () => {
    expect(countsOf({ transactions: [1, 2], accounts: [] }).find((c) => c.label === 'transactions')?.n).toBe(2);
    expect(hasUserData({ transactions: [], wallets: [], basket: null })).toBe(false);
    expect(hasUserData({ transactions: [1] })).toBe(true);
    expect(hasUserData({ basket: { id: 'b' } })).toBe(true);
  });
});

describe('JSON de l’IA remis en forme', () => {
  it('actions du brief : liste d’objets, tout le reste est écarté', () => {
    expect(readBriefActions('x')).toEqual([]);
    expect(readBriefActions({ a: 1 })).toEqual([]);
    expect(readBriefActions([null, 3, 'a', { detail: '' }])).toEqual([]);
    const r = readBriefActions([{ type: 'ACHAT', asset: 'BTC', detail: 'Achète 12 USDC', priority: '2' }, { detail: 'sans type' }]);
    expect(r).toEqual([{ type: 'ACHAT', asset: 'BTC', detail: 'Achète 12 USDC', priority: 2 }, { type: '', asset: '', detail: 'sans type', priority: 3 }]);
    expect(readBriefActions(Array.from({ length: 30 }, (_, i) => ({ detail: `a${i}` }))).length).toBe(10);
  });

  it('éclaireur d’airdrops : seuls les liens https sont gardés, notes entre 1 et 5', () => {
    const r = readScoutItems([
      { name: 'Proto', potential: 9, risk: '2', url: 'javascript:alert(1)', steps: ['a', 3, 'b'], deadline: null },
      { name: 'Autre', url: 'https://exemple.org/x', confirmed: true },
      { nom: 'sans nom' },
      'texte',
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ name: 'Proto', potential: 5, risk: 2, url: undefined, steps: ['a', '3', 'b'], deadline: null });
    expect(r[1]).toMatchObject({ url: 'https://exemple.org/x', confirmed: true });
    expect(readScoutItems({ name: 'x' })).toEqual([]);
  });

  it('statuts de thèse : seulement ok / weak / broken / dead', () => {
    expect(readThesisStatuses(['OK', 'cassée', 'dead', 5])).toEqual(['ok', 'weak', 'dead', 'weak']);
    expect(readThesisStatuses('ok')).toEqual([]);
  });

  it('sanitizeReportData selon le type de rapport', () => {
    expect(sanitizeReportData('quick', 'texte')).toBeNull();
    expect(sanitizeReportData('quick', [1])).toBeNull();
    expect(sanitizeReportData('quick', { verdict: 'ATTENDRE' })).toEqual({ verdict: 'ATTENDRE' });
    expect(sanitizeReportData('briefing', { actions: 42, autre: 1 })).toEqual({ autre: 1 });
    expect(sanitizeReportData('airdrops', [{ name: 'X' }])).not.toBeNull();
    expect(sanitizeReportData('airdrops', { name: 'X' })).toBeNull();
    expect(sanitizeReportData('thesis', { verdict: 'intacte', statuses: ['ok', 'zzz'] })).toEqual({ verdict: 'intacte', statuses: ['ok', 'weak'] });
  });
});

describe('sauvegarde automatique : calendrier et nettoyage', () => {
  const at = (iso: string) => ({ at: iso, where: '', kind: 'auto' as const });
  const now = new Date(2026, 10, 9, 21, 0, 0);

  it('une sauvegarde automatique est due si aucune n’a été faite aujourd’hui', () => {
    expect(autoBackupDue(null, now)).toBe(true);
    expect(autoBackupDue(at(new Date(2026, 10, 9, 8, 0).toISOString()), now)).toBe(false);
    expect(autoBackupDue(at(new Date(2026, 10, 8, 23, 59).toISOString()), now)).toBe(true);
    expect(autoBackupDue({ ...at(new Date(2026, 10, 9, 8, 0).toISOString()), kind: 'manuel' }, now)).toBe(true);
  });

  it('rappel au Cockpit : jamais, ou plus de 7 jours', () => {
    expect(backupReminderDue(null, now)).toBe(true);
    expect(backupReminderDue(at(new Date(2026, 10, 2, 8, 0).toISOString()), now)).toBe(false); // 7 jours
    expect(backupReminderDue(at(new Date(2026, 10, 1, 8, 0).toISOString()), now)).toBe(true); // 8 jours
    expect(daysSinceBackup(at(new Date(2026, 10, 9, 1, 0).toISOString()), now)).toBe(0);
    expect(describeBackupAge(null, now)).toContain('Aucune');
    expect(describeBackupAge(at(new Date(2026, 10, 6, 8, 0).toISOString()), now)).toContain('3 jours');
  });

  it('noms de fichiers triables, et nettoyage des plus anciens par type', () => {
    expect(backupFileName('auto', new Date(2026, 10, 9, 20, 30, 15))).toBe('boussole-auto-2026-11-09_203015.json');
    const names = [
      ...Array.from({ length: 16 }, (_, i) => `boussole-auto-2026-10-${String(10 + i).padStart(2, '0')}_090000.json`),
      'boussole-avant-import-2026-11-01_100000.json', 'boussole-avant-import-2026-11-02_100000.json', 'autre-fichier.json', 'notes.txt',
    ];
    const old = backupsToPrune(names, 'auto');
    expect(old).toEqual(['boussole-auto-2026-10-11_090000.json', 'boussole-auto-2026-10-10_090000.json']);
    expect(backupsToPrune(names, 'avant-import')).toEqual([]);
    expect(backupsToPrune(names, 'avant-import', 1)).toEqual(['boussole-avant-import-2026-11-01_100000.json']);
  });
});
