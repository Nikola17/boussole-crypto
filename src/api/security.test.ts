// Tests du scan de sécurité GoPlus (fonctions pures, sans réseau) — dont l'historique du créateur.

import { describe, expect, it } from 'vitest';
import { evmReportFrom } from './security';

const clean = {
  is_honeypot: '0', is_open_source: '1', buy_tax: '0', sell_tax: '0',
  is_mintable: '0', owner_change_balance: '0', hidden_owner: '0', cannot_sell_all: '0',
  holder_count: '1000', holders: [], lp_holders: [], is_in_dex: '1',
};

const wrap = (extra: Record<string, unknown>) => ({ code: 1, result: { '0xabc': { ...clean, ...extra } } });

describe('evmReportFrom — historique et part du créateur', () => {
  it('antécédent de honeypot du créateur : danger immédiat', () => {
    const r = evmReportFrom(wrap({ honeypot_with_same_creator: '1' }), '0xABC');
    expect(r.flags.some((f) => f.severity === 'danger' && f.label.includes('déjà déployé un honeypot'))).toBe(true);
    expect(r.verdict).toBe('Danger');
  });

  it('créateur trop gros détenteur : avertissement proportionné', () => {
    const mid = evmReportFrom(wrap({ creator_percent: '18' }), '0xABC');
    expect(mid.flags.some((f) => f.label.includes('créateur détient') && f.severity === 'warn')).toBe(true);
    const big = evmReportFrom(wrap({ creator_percent: '30' }), '0xABC');
    expect(big.flags.some((f) => f.label.includes('créateur détient') && f.severity === 'danger')).toBe(true);
  });

  it('propriétaire discret : information rassurante, pas d\'alerte', () => {
    const r = evmReportFrom(wrap({ owner_percent: '2' }), '0xABC');
    expect(r.flags.some((f) => f.label.includes('propriétaire du contrat détient') && f.severity === 'ok')).toBe(true);
    expect(r.flags.some((f) => f.label.includes('propriétaire du contrat détient') && f.severity !== 'ok')).toBe(false);
  });

  it('un contrat sain sans ces signaux reste « Plutôt sain »', () => {
    const r = evmReportFrom(wrap({}), '0xABC');
    expect(r.verdict).toBe('Plutôt sain');
    expect(r.flags.some((f) => f.label.includes('créateur'))).toBe(false);
  });
});
