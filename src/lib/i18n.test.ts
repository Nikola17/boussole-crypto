import { describe, expect, it } from 'vitest';
import { en, resolveLocale, translate } from './i18n';

describe('i18n', () => {
  it('détecte la langue de l’appareil en « auto »', () => {
    expect(resolveLocale('auto', 'fr-FR')).toBe('fr');
    expect(resolveLocale('auto', 'fr')).toBe('fr');
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'de-DE')).toBe('en');
    expect(resolveLocale('fr', 'en-US')).toBe('fr');
    expect(resolveLocale('en', 'fr-FR')).toBe('en');
  });

  it('retombe sur le français quand la clé est inconnue', () => {
    expect(translate('en', 'Chaîne jamais traduite')).toBe('Chaîne jamais traduite');
    expect(translate('fr', 'Cockpit')).toBe('Cockpit');
  });

  it('traduit les clés connues en anglais', () => {
    expect(translate('en', 'Cockpit')).toBe('Dashboard');
    expect(translate('en', 'Enregistrer')).toBe('Save');
  });

  it('remplace les variables {nom}', () => {
    expect(translate('fr', 'Bonjour {name}', { name: 'Nico' })).toBe('Bonjour Nico');
    expect(translate('en', 'Bonjour {name}', { name: 'Nico' })).toBe('Bonjour Nico'); // clé inconnue : FR + variable
    expect(translate('en', 'alertes armées')).toBe('armed alerts');
  });

  it('le dictionnaire anglais ne contient que des chaînes non vides', () => {
    for (const [k, v] of Object.entries(en)) {
      expect(typeof k).toBe('string');
      expect(typeof v).toBe('string');
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});
