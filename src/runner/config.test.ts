// Configuration du runner : champs obligatoires, valeurs par défaut, surcharges par l'environnement.

import { describe, expect, it } from 'vitest';
import { applyEnv, validateConfig } from './config';

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
