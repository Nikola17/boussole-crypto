// Formatage FR : prix adapté aux petits tokens, montants compacts, pourcentages signés, dates, identifiants.

import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtQty, isoDay, shortAddress, uid } from './format';

// Les attentes notent séparément les espaces insécables de l'ICU (\u202f) : on teste les règles de
// Boussole (bornes de décimales, signes, suffixes compacts), pas la bibliothèque de Node.

const spaces = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

describe('prix adaptatif', () => {
  it('les grandes valeurs n’ont pas de centimes, les petits tokens gardent des décimales', () => {
    expect(spaces(fmtPrice(83500, 'EUR'))).toBe('83 500 €');
    expect(spaces(fmtPrice(2.5, 'USD'))).toBe('2,50 $US');
    // un micro-prix garde 6 décimales (borne maximum sur les prix)
    expect(spaces(fmtPrice(0.00012345, 'EUR'))).toBe('0,000123 €');
  });

  it('une valeur absente affiche un tiret, jamais « 0 € » ni NaN', () => {
    expect(fmtPrice(null)).toBe('—');
    expect(fmtPrice(NaN)).toBe('—');
    expect(fmtPrice(undefined)).toBe('—');
    expect(fmtMoney(null)).toBe('—');
  });
});

describe('montants', () => {
  it('arrondi aux bornes demandées', () => {
    expect(spaces(fmtMoney(1234.567, 'EUR', 0))).toBe('1 235 €');
    expect(spaces(fmtMoney(1234.5, 'EUR', 2))).toBe('1 234,50 €');
  });

  it('compact : k seulement au-delà de 10 000, puis M et Md', () => {
    expect(spaces(fmtCompact(1500, 'EUR'))).toBe('1 500 €'); // 1 500 € reste lisible : pas de « k »
    expect(fmtCompact(35000, 'EUR')).toBe('35 k€'); // une décimale sous 100
    expect(fmtCompact(3.4e6, 'EUR')).toBe('3,4 M€');
    expect(fmtCompact(1.2e9, 'USD')).toBe('1,2 Md$');
  });
});

describe('nombre, quantité, pourcentage', () => {
  it('quantités : décimales selon l’ordre de grandeur (zéros de fin coupés)', () => {
    expect(spaces(fmtQty(1234.5678))).toBe('1 234,57');
    expect(fmtQty(0.00123)).toBe('0,00123');
    expect(fmtQty(0.00000042)).toBe('0,00000042');
  });

  it('pourcentage signé', () => {
    expect(fmtPct(12.34, 1)).toBe('+12,3 %');
    expect(fmtPct(-12.34, 1)).toBe('-12,3 %');
    expect(fmtPct(0.5, 0, false)).toBe('1 %');
  });

  it('nombres : jamais de NaN, décimales coupées au maximum demandé', () => {
    expect(fmtNum(1.005, 2)).toBe('1,01');
    expect(fmtNum(NaN, 2)).toBe('—');
  });
});

describe('utilitaires', () => {
  it('isoDay : date locale à quatre chiffres, jamais un mois à un chiffre', () => {
    const d = new Date(2026, 0, 5);
    expect(isoDay(d)).toBe('2026-01-05');
  });

  it('shortAddress coupe le milieu, garde les extrémités', () => {
    expect(shortAddress('bc1qabcdefghijklmnopqrstuvwxyz0123')).toBe('bc1qab…0123');
    expect(shortAddress('0x1234')).toBe('0x1234');
  });

  it('uid : unique même à la même milliseconde', () => {
    const seen = new Set(Array.from({ length: 500 }, () => uid()));
    expect(seen.size).toBe(500);
  });
});
