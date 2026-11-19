import { describe, expect, it } from 'vitest';
import { copyAlertText, copyRiskFlag } from './copyWatch';
import { fundingAlertText, fundingAnnualizedPct, fundingVerdict } from './funding';
import { upcomingDated } from './unlocks';

describe('copy trading watchlist', () => {
  it('drapeaux de risque selon drawdown et ROI 30 j', () => {
    expect(copyRiskFlag({ roi30dPct: 25, maxDrawdown30dPct: -5 })).toBe('ok');
    expect(copyRiskFlag({ roi30dPct: -5, maxDrawdown30dPct: -10 })).toBe('warn');
    expect(copyRiskFlag({ roi30dPct: 10, maxDrawdown30dPct: -18 })).toBe('warn');
    expect(copyRiskFlag({ roi30dPct: 10, maxDrawdown30dPct: -35 })).toBe('danger');
    expect(copyRiskFlag({ roi30dPct: -25, maxDrawdown30dPct: -10 })).toBe('danger');
    expect(copyRiskFlag({ roi30dPct: null, maxDrawdown30dPct: null })).toBe('ok');
  });
  it('le texte d’alerte ne promet aucune copie automatique', () => {
    const t = copyAlertText('Trader X', { roi30dPct: -22, maxDrawdown30dPct: -31 });
    expect(t).toContain('Trader X');
    expect(t).toContain('-22.0 %');
    expect(t).toContain('ne copie personne automatiquement');
  });
});

describe('funding perp', () => {
  it('seuil extrême à ±0,05 %/8 h', () => {
    expect(fundingVerdict(null)).toBe('normal');
    expect(fundingVerdict(0.0001)).toBe('normal');
    expect(fundingVerdict(0.0005)).toBe('extreme-long');
    expect(fundingVerdict(-0.0006)).toBe('extreme-short');
  });
  it('annualisé : 0,05 %/8 h ≈ 54 %/an', () => {
    expect(fundingAnnualizedPct(0.0005)).toBeCloseTo(54.75, 1);
  });
  it('le texte d’alerte mentionne le squeeze et le côté de la foule', () => {
    expect(fundingAlertText('BTCUSDT', 0.001)).toContain('longues');
    expect(fundingAlertText('ETHUSDT', -0.001)).toContain('courtes');
  });
});

describe('upcomingDated (générique)', () => {
  it('trie par proximité et borne à l’horizon', () => {
    const r = upcomingDated([{ date: '2026-11-25' }, { date: '2026-11-21' }, { date: '2027-01-01' }], '2026-11-20', 7);
    expect(r.map((x) => x.daysUntil)).toEqual([1, 5]);
  });
});
