// Comparaison de versions (x.y.z) pour le bandeau « une mise à jour est disponible ».

import { describe, expect, it } from 'vitest';
import { isNewerVersion, updateAssetUrl } from './useUpdate';

describe('isNewerVersion', () => {
  it('voit les vraies montées de version, ignore le reste', () => {
    expect(isNewerVersion('1.19.0', '1.18.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true);
    expect(isNewerVersion('1.18.1', '1.18.0')).toBe(true);
    expect(isNewerVersion('1.18.0', '1.18.0')).toBe(false);
    expect(isNewerVersion('1.17.9', '1.18.0')).toBe(false);
    expect(isNewerVersion('', '1.18.0')).toBe(false);
    expect(isNewerVersion(null, '1.18.0')).toBe(false);
    expect(isNewerVersion('v1.19.0', '1.18.0')).toBe(true); // « v » toléré
  });
});

describe('updateAssetUrl', () => {
  it('construit les URL des releases publiques, sans jeton, version validée', () => {
    expect(updateAssetUrl('1.20.0', 'windows')).toBe('https://github.com/Nikola17/boussole-crypto/releases/download/v1.20.0/Boussole-Crypto-Setup-1.20.0.exe');
    expect(updateAssetUrl('v1.20.1', 'android')).toBe('https://github.com/Nikola17/boussole-crypto/releases/download/v1.20.1/Boussole-Crypto-1.20.1.apk');
  });
  it('refuse toute version louche : pas d\u2019URL fabriquée', () => {
    expect(updateAssetUrl('../1.0.0', 'windows')).toBe('');
    expect(updateAssetUrl('', 'android')).toBe('');
  });
});
