import { describe, expect, it } from 'vitest';
import { buildWebhookPayload, fireWebhook, validWebhookUrl } from './webhook';

describe('webhook', () => {
  it('n’accepte que les URL https', () => {
    expect(validWebhookUrl('https://hooks.example.com/x')).toBe(true);
    expect(validWebhookUrl('http://192.168.1.1/x')).toBe(false);
    expect(validWebhookUrl('pas une url')).toBe(false);
    expect(validWebhookUrl('')).toBe(false);
  });

  it('construit un payload signé Boussole', () => {
    const p = buildWebhookPayload('price_alert', 'Alerte BTC', 'au-dessus de 100 000 $', { symbol: 'BTC' });
    expect(p.app).toBe('boussole-crypto');
    expect(p.event).toBe('price_alert');
    expect(p.title).toBe('Alerte BTC');
    expect(p.data?.symbol).toBe('BTC');
    expect(() => Date.parse(p.at)).not.toThrow();
  });

  it('fireWebhook renvoie false sans appeler le réseau sur une URL invalide', async () => {
    expect(await fireWebhook('http://interne.local', buildWebhookPayload('x', 't', 'b'))).toBe(false);
    expect(await fireWebhook('', buildWebhookPayload('x', 't', 'b'))).toBe(false);
  });
});
