import { describe, expect, it } from 'vitest';
import { buildGrokPrompt, checkGrokOrders, parseGrokReply, type GrokPromptInput } from './grok';
import type { BasketContext } from './basket';
import type { BasketPlan, CoinRef } from '../types';

const coin = (id: string, sym = id.slice(0, 3)): CoinRef => ({ coinId: id, symbol: sym, name: id });
const basket: BasketPlan = {
  id: 'b', name: 'Panier', active: true, amountUsd: 25, daysOfWeek: [2, 5], startDate: '2026-01-01', discoveryMaxPct: 50,
  core: [{ ...coin('bitcoin', 'btc'), weight: 70 }, { ...coin('ethereum', 'eth'), weight: 30 }],
  discovery: [coin('sui', 'sui'), coin('prove', 'prove')], reserveUsd: 10, minOrderUsd: 5, reminder: true, createdAt: '',
};
const ctx: BasketContext = {
  temperature: 50, totalValueUsd: 5250, altTargetPct: 40, altCurrentPct: 7, values: { bitcoin: 3920, ethereum: 980, sui: 56, prove: 7 },
  change7d: {}, cdc: { bitcoin: 'exchange', ethereum: 'exchange', sui: 'exchange', prove: 'exchange', tao: 'unknown' }, scores: {},
  rules: { maxPerGemPct: 3, minLinePct: 1, maxDiscoveryLines: 5 }, discoveryLinesOpen: 3,
};
const known: Record<string, CoinRef> = { BTC: coin('bitcoin', 'btc'), ETH: coin('ethereum', 'eth'), SUI: coin('sui', 'sui'), PROVE: coin('prove', 'prove'), TAO: coin('tao', 'tao') };

const REPLY = `Analyse courte.\n\n\`\`\`json\n{"date":"2026-11-10","marche":"Peur modérée","ordres":[{"jeton":"ETH","type":"classique","montant_usdc":12.5,"raison":"retard"},{"jeton":"prove","type":"decouverte","montant_usdc":"12,5","raison":"finir la ligne"}],"reserve_usdc":10,"liste_decouverte":["PROVE","SUI"],"alertes":["x"],"non_verifie":["y"]}\n\`\`\``;

describe('prompt Grok', () => {
  const input: GrokPromptInput = {
    date: '2026-11-10', temperature: 31, zone: 'accumulation', fng: 28, btcPriceUsd: 75615, btcBelowAthPct: -40,
    budgetUsd: 25, discoveryMaxPct: 50, reserveUsd: 10, positions: [{ symbol: 'BTC', valueUsd: 3920, pct: 74.7 }],
    core: [{ symbol: 'BTC', weight: 70 }, { symbol: 'ETH', weight: 30 }], discovery: ['SUI', 'PROVE'], minLinePct: 1, maxPerGemPct: 3, minOrderUsd: 5,
  };
  it('remplit le contexte et les règles, sans zone laissée vide', () => {
    const p = buildGrokPrompt(input);
    expect(p).toContain('2026-11-10');
    expect(p).toContain('température 31/100 (accumulation)');
    expect(p).toContain('BTC : 3');
    expect(p).toContain('BTC 70 %, ETH 30 %');
    expect(p).toContain('SUI, PROVE');
    expect(p).toContain('inférieur à 5 USDC');
    expect(p).not.toMatch(/\{\{|undefined|NaN/);
    expect(p).toContain('"ordres"');
  });
  it('gère un contexte vide', () => {
    const p = buildGrokPrompt({ ...input, temperature: null, fng: null, btcPriceUsd: null, btcBelowAthPct: null, positions: [], core: [], discovery: [] });
    expect(p).toContain('aucune position enregistrée');
    expect(p).toContain('température inconnue');
    expect(p).not.toMatch(/undefined|NaN/);
  });
});

describe('lecture de la réponse de Grok', () => {
  it('lit le bloc JSON balisé, les nombres à virgule et les types français', () => {
    const r = parseGrokReply(REPLY)!;
    expect(r.orders).toEqual([
      { symbol: 'ETH', kind: 'core', usd: 12.5, reason: 'retard' },
      { symbol: 'PROVE', kind: 'discovery', usd: 12.5, reason: 'finir la ligne' },
    ]);
    expect(r.discoveryList).toEqual(['PROVE', 'SUI']);
    expect(r.market).toBe('Peur modérée');
    expect(r.reserveUsd).toBe(10);
  });
  it('lit un JSON sans balises et des clés anglaises', () => {
    const r = parseGrokReply('Voici : {"orders":[{"token":"btc","kind":"core","amount":20}]} fin')!;
    expect(r.orders[0]).toMatchObject({ symbol: 'BTC', kind: 'core', usd: 20 });
  });
  it("renvoie null quand rien n'est exploitable", () => {
    expect(parseGrokReply('pas de json ici')).toBeNull();
    expect(parseGrokReply('```json\n{ cassé \n```')).toBeNull();
    expect(parseGrokReply('```json\n{"autre":1}\n```')).toBeNull();
  });
  it('ignore les ordres sans montant et reconnaît « cœur »', () => {
    const r = parseGrokReply('{"ordres":[{"jeton":"BTC","type":"cœur","montant":10},{"jeton":"ETH","montant":0}]}')!;
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].kind).toBe('core');
  });
});

describe('contrôle des ordres de Grok', () => {
  const check = (text: string, c: Partial<BasketContext> = {}, b: Partial<BasketPlan> = {}) => checkGrokOrders(parseGrokReply(text)!, { ...basket, ...b }, { ...ctx, ...c }, known);
  const mk = (orders: object[]) => JSON.stringify({ ordres: orders });

  it('une réponse conforme est « ok »', () => {
    const r = check(REPLY);
    expect(r.status).toBe('ok');
    expect(r.lines.every((l) => l.status === 'ok')).toBe(true);
    expect(r.totalUsd).toBe(25);
  });
  it('plus de deux ordres, ou deux « découverte » : à corriger', () => {
    const r = check(mk([{ jeton: 'BTC', type: 'classique', montant: 10 }, { jeton: 'SUI', type: 'decouverte', montant: 8 }, { jeton: 'PROVE', type: 'decouverte', montant: 7 }]));
    expect(r.status).toBe('fix');
    expect(r.messages.join(' ')).toContain('2 au plus');
    expect(r.messages.join(' ')).toContain('un seul par échéance');
  });
  it('total au-dessus du budget : à corriger sans réserve, avertissement avec réserve suffisante', () => {
    const two = mk([{ jeton: 'BTC', type: 'classique', montant: 20 }, { jeton: 'SUI', type: 'decouverte', montant: 10 }]);
    expect(check(two, {}, { reserveUsd: 0 }).status).toBe('fix');
    const ok = check(two, {}, { reserveUsd: 10 });
    expect(ok.messages.join(' ')).toContain('puisés dans ta réserve');
    expect(ok.status).toBe('warn');
  });
  it('anti-FOMO, plafond, minimum et crypto hors Crypto.com', () => {
    const fomo = check(mk([{ jeton: 'PROVE', type: 'decouverte', montant: 12.5 }]), { change7d: { prove: 70 } });
    expect(fomo.lines[0].messages.join(' ')).toContain('anti-FOMO');
    expect(fomo.status).toBe('fix');
    const cap = check(mk([{ jeton: 'SUI', type: 'decouverte', montant: 12.5 }]), { values: { ...ctx.values, sui: 150 } });
    expect(cap.lines[0].messages.join(' ')).toContain('plafond');
    expect(check(mk([{ jeton: 'BTC', type: 'classique', montant: 3 }])).lines[0].status).toBe('fix');
    const tao = check(mk([{ jeton: 'TAO', type: 'decouverte', montant: 12.5 }]));
    expect(tao.lines[0].messages.join(' ')).toContain('Crypto.com');
  });
  it("ouvrir une nouvelle ligne alors qu'une ligne est sous le minimum : avertissement", () => {
    const r = check(mk([{ jeton: 'TAO', type: 'decouverte', montant: 12.5 }]));
    expect(r.lines[0].messages.join(' ')).toContain('finis d’abord');
  });
  it('crypto inconnue de Boussole : avertissement', () => {
    const r = check(mk([{ jeton: 'ZZZ', type: 'decouverte', montant: 12.5 }]));
    expect(r.lines[0].coin).toBeNull();
    expect(r.lines[0].status).toBe('warn');
  });
});
