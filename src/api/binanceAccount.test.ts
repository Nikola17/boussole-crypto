import { describe, expect, it } from 'vitest';
import { hmacSha256Hex, signedQuery } from './binanceAccount';

describe('binanceAccount', () => {
  it('calcule le bon HMAC-SHA256 (vecteur connu RFC 4231-ish)', async () => {
    // Vecteur connu : HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    const hex = await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog');
    expect(hex).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('ajoute timestamp, recvWindow et signature à la query', async () => {
    const q = await signedQuery({ foo: 'bar' }, 'secret');
    const p = new URLSearchParams(q);
    expect(p.get('foo')).toBe('bar');
    expect(p.get('timestamp')).toMatch(/^\d+$/);
    expect(p.get('recvWindow')).toBe('10000');
    expect(p.get('signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
