// Chiffrement de la synchronisation : aller-retour complet, phrase de passe fautive refusée clairement,
// contenu trafiqué refusé. AES-GCM : le moindre bit modifié invalide le déchiffrement.

import { describe, expect, it } from 'vitest';
import { checkPassphrase, seal, unseal } from './crypto';

const secret = { portfolio: { valeur: 4242 }, prenom: 'Nico' };

describe('phrase de passe', () => {
  it('trop courte : refusée avant tout chiffrement', () => {
    expect(checkPassphrase('')).toContain('au moins 8');
    expect(checkPassphrase('1234567')).toContain('au moins 8');
    expect(checkPassphrase('correct horse battery')).toBeNull();
  });

  it('une phrase trop courte refuse de chiffrer', async () => {
    await expect(seal(secret, 'court')).rejects.toThrow('au moins 8');
  });
});

describe('aller-retour', () => {
  it('chiffre puis déchiffre fidèlement, avec un format versionné', async () => {
    const s = await seal(secret, 'ma phrase de passe');
    expect(s.startsWith('BC1|')).toBe(true);
    expect(s.split('|')).toHaveLength(4);
    expect(s).not.toContain('4242');
    expect(s).not.toContain('Nico');
    expect(await unseal(s, 'ma phrase de passe')).toEqual(secret);
  });

  it('la même phrase sur un sel différent donne un chiffré différent (sel aléatoire)', async () => {
    const a = await seal(secret, 'ma phrase de passe');
    const b = await seal(secret, 'ma phrase de passe');
    expect(a).not.toBe(b);
    expect(await unseal(a, 'ma phrase de passe')).toEqual(await unseal(b, 'ma phrase de passe'));
  });

  it('une phrase de passe fautive est refusée explicitement, sans rien lâcher', async () => {
    const s = await seal(secret, 'la bonne phrase');
    await expect(unseal(s, 'la mauvaise phrase')).rejects.toThrow('Phrase de passe incorrecte');
  });

  it('un contenu trafiqué au passage est refusé', async () => {
    const s = (await seal(secret, 'la bonne phrase')).split('|');
    const bytes = atob(s[3]);
    const flipped = bytes.slice(0, Math.max(0, bytes.length - 2)) + (bytes.at(-2) === 'A' ? 'B' : 'A') + bytes.at(-1);
    await expect(unseal([s[0], s[1], s[2], btoa(flipped)].join('|'), 'la bonne phrase')).rejects.toThrow('Phrase de passe incorrecte');
  });

  it('un fichier qui n’est pas de Boussole est refusé sans ambiguousité', async () => {
    await expect(unseal('hello world', 'la bonne phrase')).rejects.toThrow('format attendu');
    await expect(unseal('XX|a|b|c', 'la bonne phrase')).rejects.toThrow('format attendu');
  });
});
