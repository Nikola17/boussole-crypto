// Configuration du runner : champs obligatoires, valeurs par défaut, surcharges par l'environnement.

import { describe, expect, it } from 'vitest';
import { applyEnv, validateConfig } from './config';
import { inQuietWindow } from './state';

const OK = {
  syncRepo: 'Nikola17/boussole-sync',
  syncToken: 'github_xxx',
  passphrase: 'ma phrase de passe',
  telegramToken: '123:abc',
  telegramChatId: '424242',
};

describe('configuration du runner', () => {
  it('complète : valeurs par défaut saines (chemin du fichier, devise, fuseau, cadence, heure du brief)', () => {
    const { config, problems } = validateConfig(OK);
    expect(problems).toEqual([]);
    expect(config).toMatchObject({
      syncRepo: 'Nikola17/boussole-sync',
      syncPath: 'boussole-sync.enc',
      coingeckoKey: null,
      currency: 'EUR',
      intervalMinutes: 5,
      briefHour: 8,
      briefEnabled: true,
      timeZone: 'Europe/Paris',
      device: 'vps-boussole',
    });
  });

  it('chaque secret manquant est nommé, l’un après l’autre, dans un message exploitable', () => {
    const { config, problems } = validateConfig({ syncRepo: 'Nikola17/boussole-sync' });
    expect(config).toBeNull();
    const text = problems.join(' ');
    for (const needle of ['syncToken', 'passphrase', 'telegramToken', 'telegramChatId']) expect(text).toContain(needle);
  });

  it('dépôt malformé, fuseau inconnu, heures et cadences impossibles : refusés explicitement', () => {
    expect(validateConfig({ ...OK, syncRepo: 'nimporte quoi' }).problems[0]).toContain('syncRepo');
    expect(validateConfig({ ...OK, timeZone: 'Europe/Parisis' }).problems.some((p) => p.includes('timeZone'))).toBe(true);
    expect(validateConfig({ ...OK, briefHour: 24 }).problems.some((p) => p.includes('briefHour'))).toBe(true);
    expect(validateConfig({ ...OK, intervalMinutes: 0 }).problems.some((p) => p.includes('intervalMinutes'))).toBe(true);
    expect(validateConfig({ ...OK, briefEnabled: 'oui' }).problems.some((p) => p.includes('briefEnabled'))).toBe(true);
    expect(validateConfig('pas un objet').problems[0]).toContain('illisible');
  });

  it('--discover doit pouvoir tourner sans chat id (c’est son rôle de le trouver)', () => {
    const { config, problems } = validateConfig({ ...OK, telegramChatId: '' }, { allowMissingChatId: true });
    expect(problems).toEqual([]);
    expect(config?.telegramChatId).toBe('');
    // Sans l'option, le chat id reste exigé (les autres modes en ont besoin).
    expect(validateConfig({ ...OK, telegramChatId: '' }).problems.some((p) => p.includes('telegramChatId'))).toBe(true);
  });

  it('l’environnement remplace la configuration lue (les secrets n’ont pas à vivre dans un fichier)', () => {
    const merged = applyEnv({ syncRepo: 'a/b', passphrase: 'dans-le-fichier', telegramChatId: 'chat-du-fichier' }, {
      BOUSSOLE_SYNC_TOKEN: 'tok-env',
      TELEGRAM_BOT_TOKEN: 'tg-env',
      BOUSSOLE_PASSPHRASE: '', // vide : n'écrase pas la valeur du fichier
      COINGECKO_KEY: 'cg-demo',
    });
    const { config } = validateConfig(merged);
    expect(config).toMatchObject({ syncRepo: 'a/b', syncToken: 'tok-env', telegramToken: 'tg-env', passphrase: 'dans-le-fichier', telegramChatId: 'chat-du-fichier', coingeckoKey: 'cg-demo' });
  });
});

describe('configuration — silence nocturne', () => {
  it('heures invalides refusées ; absentes : silence 23 h → 8 h par défaut', () => {
    expect(validateConfig({ ...OK, quietStart: 'minuit' }).problems.some((p) => p.includes('quietStart'))).toBe(true);
    expect(validateConfig({ ...OK, quietEnd: 24 }).problems.some((p) => p.includes('quietEnd'))).toBe(true);
    const { config } = validateConfig(OK);
    expect(config).toMatchObject({ quietStart: 23, quietEnd: 8 });
  });
  it('deux heures identiques annulent le silence (la fenêtre n’existe pas)', () => {
    expect(inQuietWindow(23, 8, new Date(2026, 10, 20, 2, 0))).toBe(true);
    expect(inQuietWindow(23, 8, new Date(2026, 10, 20, 12, 0))).toBe(false);
    expect(inQuietWindow(8, 8, new Date(2026, 10, 20, 2, 0))).toBe(false); // désactivé
    expect(inQuietWindow(0, 6, new Date(2026, 10, 20, 3, 0))).toBe(true); // fenêtre simple sans minuit
  });
});
