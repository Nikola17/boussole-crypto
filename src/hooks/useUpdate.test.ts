// Comparaison de versions (x.y.z) pour le bandeau « une mise à jour est disponible ».

import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './useUpdate';

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
