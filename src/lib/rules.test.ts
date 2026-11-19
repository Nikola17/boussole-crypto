import { describe, expect, it } from 'vitest';
import { impulseVerdict, isTinyLine, lagsBitcoin, outsideDcaCheck, panicVerdict, trimStatus } from './rules';
import { rebalance, rebalanceAction } from './portfolio';
import { exitLadder, pendingRungs, DEFAULT_LADDER } from './exit';
import { ARCHETYPES } from './profile';
import { fngMultiplier } from './dca';
import { zoneFor } from './cycle';
import { fngLabel } from '../api/feargreed';
import { TEMPERATURE } from './thresholds';
import { todayContext } from '../ai/today';
import { planBasketOrder } from './basket';

describe('Ma stratégie : le préréglage correspond à docs/STRATEGIE.md', () => {
  const p = ARCHETYPES['Ma stratégie'];
  it('cible : socle BTC/ETH à 85 %, altcoins à 15 %, total 100', () => {
    expect(p.target.btc + p.target.eth).toBe(85);
    expect(p.target.large + p.target.mid + p.target.small).toBe(15);
    expect(Object.values(p.target).reduce((s, v) => s + v, 0)).toBe(100);
  });
  it('règles : 1 % minimum par ligne, 5 lignes découverte, 12 lignes au plus', () => {
    expect(p.rules).toMatchObject({ minLinePct: 1, maxDiscoveryLines: 5, maxLines: 12 });
  });
});

describe('rééquilibrage : le cœur n’est jamais allégé hors euphorie', () => {
  // ≈ ta situation : 75 % de Bitcoin pour une cible générique de 45 %
  const alloc = { btc: 3920, eth: 980, large: 150, mid: 100, small: 100, stable: 0 };
  const lines = rebalance(alloc, { btc: 45, eth: 20, large: 15, mid: 5, small: 5, stable: 10 });
  const btc = lines.find((l) => l.bucket === 'btc')!;

  it('Bitcoin 75 % pour 45 % visés : « hold » (oriente le DCA), pas « trim »', () => {
    expect(btc.diffValue).toBeLessThan(0);
    expect(rebalanceAction(btc, false)).toBe('hold');
  });
  it('en euphorie, une tranche devient possible', () => {
    expect(rebalanceAction(btc, true)).toBe('trim');
  });
  it('un excès hors cœur reste « trim », un manque reste « buy », un petit écart « ok »', () => {
    expect(rebalanceAction({ bucket: 'small', currentPct: 12, targetPct: 5, diffValue: -300 }, false)).toBe('trim');
    expect(rebalanceAction({ bucket: 'btc', currentPct: 30, targetPct: 45, diffValue: 500 }, false)).toBe('buy');
    expect(rebalanceAction({ bucket: 'btc', currentPct: 46, targetPct: 45, diffValue: -50 }, false)).toBe('ok');
  });
  it('avec « Ma stratégie », Bitcoin à 75 % pour 65 % reste en « hold »', () => {
    const mine = rebalance(alloc, ARCHETYPES['Ma stratégie'].target).find((l) => l.bucket === 'btc')!;
    expect(mine.currentPct - mine.targetPct).toBeLessThan(15);
    expect(rebalanceAction(mine, false)).toBe('hold');
  });
});

describe('plan de sortie : montants minimaux et délai entre tranches', () => {
  it('un palier atteint mais de moins de 20 $ n’est pas conseillé', () => {
    const rungs = exitLadder({ avgCostUsd: 1, priceUsd: 2.5, quantity: 4, steps: DEFAULT_LADDER, doneMultiples: [] }); // ×2 atteint, 25 % de 4 = 1 unité ≈ 2,5 $
    expect(rungs[0].reached).toBe(true);
    expect(pendingRungs(rungs)).toHaveLength(0);
    expect(pendingRungs(rungs, 1)).toHaveLength(1);
  });
  it('un palier assez gros est conseillé', () => {
    const rungs = exitLadder({ avgCostUsd: 10, priceUsd: 25, quantity: 20, steps: DEFAULT_LADDER, doneMultiples: [] }); // 5 unités à 25 $ = 125 $
    expect(pendingRungs(rungs).map((r) => r.multiple)).toEqual([2]);
  });
  it('délai de 30 jours après une tranche du cœur', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(trimStatus(undefined, now).allowed).toBe(true);
    expect(trimStatus('not-a-date', now).allowed).toBe(true);
    const recent = trimStatus('2026-11-01T12:00:00Z', now);
    expect(recent.allowed).toBe(false);
    expect(recent.daysLeft).toBe(21);
    expect(recent.nextDate?.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(trimStatus('2026-10-01T12:00:00Z', now).allowed).toBe(true);
  });
  it('une ligne sous la ligne minimale est « à regrouper »', () => {
    expect(isTinyLine(30, 5250, 1)).toBe(true);
    expect(isTinyLine(100, 5250, 1)).toBe(false);
    expect(isTinyLine(10, 0, 1)).toBe(false);
  });
});

describe('règles de STRATEGIE.md traduites en avertissements', () => {
  it('« 6 mois sous Bitcoin sans progrès » : 10 points d’écart sur 200 jours', () => {
    expect(lagsBitcoin(-20, 15)).toBe(true);
    expect(lagsBitcoin(10, 15)).toBe(false); // 5 points : pas assez
    expect(lagsBitcoin(40, 15)).toBe(false);
    expect(lagsBitcoin(null, 15)).toBe(false);
    expect(lagsBitcoin(-20, undefined)).toBe(false);
    expect(lagsBitcoin(NaN, 5)).toBe(false);
  });
  it('« achat hors DCA : réserve et température sous 30 »', () => {
    expect(outsideDcaCheck({ temperature: 22, reserveUsd: 100, amountUsd: 50 }).allowed).toBe(true);
    expect(outsideDcaCheck({ temperature: 52, reserveUsd: 100, amountUsd: 50 }).reasons[0]).toContain('pas assez peur');
    expect(outsideDcaCheck({ temperature: 22, reserveUsd: 20, amountUsd: 50 }).reasons[0]).toContain('dépasse ta réserve');
    expect(outsideDcaCheck({ temperature: null, reserveUsd: null, amountUsd: 50 }).allowed).toBe(false);
    expect(outsideDcaCheck({ temperature: 22, reserveUsd: null, amountUsd: 50 }).allowed).toBe(true); // pas de panier : seule la température compte
  });
});

describe('seuils partagés (Fear & Greed, zones de température)', () => {
  it('la peur extrême commence au même endroit partout (Fear & Greed ≤ 24)', () => {
    expect(fngLabel(24)).toBe('Peur extrême');
    expect(fngMultiplier(24)).toBe(2);
    expect(fngLabel(25)).toBe('Peur');
    expect(fngMultiplier(25)).toBe(1.5);
  });
  it('les zones de température du cycle utilisent les mêmes bornes que les signaux', () => {
    expect(zoneFor(TEMPERATURE.extremeFear - 1).key).toBe('capitulation');
    expect(zoneFor(TEMPERATURE.extremeFear).key).toBe('accumulation');
    expect(zoneFor(TEMPERATURE.euphoria).key).toBe('euphorie');
  });
});

describe('ordre du jour transmis à l’IA', () => {
  const basket = {
    id: 'b', name: 'P', active: true, amountUsd: 25, daysOfWeek: [2, 5], startDate: '2026-01-01', discoveryMaxPct: 50,
    core: [{ coinId: 'bitcoin', symbol: 'btc', name: 'Bitcoin', weight: 100 }], discovery: [], reserveUsd: 0, minOrderUsd: 5, reminder: true, createdAt: '',
  };
  const plan = planBasketOrder(basket, {
    temperature: 50, totalValueUsd: 5000, altTargetPct: 15, altCurrentPct: 7, values: {}, change7d: {}, cdc: null, scores: {},
    rules: { maxPerGemPct: 3, minLinePct: 1, maxDiscoveryLines: 5 }, discoveryLinesOpen: 0,
  });
  const rules = ARCHETYPES['Ma stratégie'].rules;

  it('reprend les montants du panier et les règles fixes', () => {
    const c = todayContext({ guidance: [{ title: 'Panier DCA', detail: '25 USDC' }], basketDue: true, plan, rules, portfolioComplete: true, temperature: 50.4 });
    const panier = c.panierDca as { ordres: { montantUsdc: number }[]; totalInvestiUsdc: number };
    expect(panier.ordres.reduce((s, o) => s + o.montantUsdc, 0)).toBe(panier.totalInvestiUsdc);
    expect(c.actionsDuJour).toEqual(['Panier DCA — 25 USDC']);
    expect((c.reglesFixes as string[]).join(' ')).toContain('jamais en vendant');
    expect(c.temperatureMarche).toBe(50);
    expect(c.avertissement).toBeNull();
  });
  it('après validation, transmet l’échéance passée et non un ordre recalculé', () => {
    const doneExecution = { id: 'e1', basketId: basket.id, periodKey: '2026-11-14', date: '2026-11-14', investedUsd: 20, reserveDeltaUsd: 0, orders: [
      { coinId: 'solana', symbol: 'sol', name: 'Solana', usd: 20, quantity: 0.1, price: 200, kind: 'core' as const },
    ] };
    const c = todayContext({ guidance: [], basketDue: false, plan, doneExecution, rules, portfolioComplete: true, temperature: 50 });
    const panier = c.panierDca as { echeanceFaite: boolean; ordresPasses: { ligne: string; montantUsdc: number }[]; ordres?: unknown };
    expect(panier.echeanceFaite).toBe(true);
    expect(panier.ordresPasses).toEqual([{ ligne: 'SOL', montantUsdc: 20 }]);
    expect(panier.ordres).toBeUndefined();
  });
  it('signale un portefeuille partiel et l’absence de panier', () => {
    const c = todayContext({ guidance: [], basketDue: false, plan: null, rules, portfolioComplete: false, temperature: null });
    expect(c.panierDca).toBeNull();
    expect(String(c.avertissement)).toContain('partiel');
    expect(c.temperatureMarche).toBeNull();
  });
});

describe('délai de réflexion 24 h (anti-FOMO)', () => {
  const NOW = Date.parse('2026-11-20T15:00:00Z');
  it('sans emballement constaté, aucun blocage — la règle ne s’invente pas de données', () => {
    expect(impulseVerdict(12, undefined, NOW).blocked).toBe(false);
    expect(impulseVerdict(null, undefined, NOW).blocked).toBe(false); // marché indisponible : ouvert
  });
  it('+50 % en 7 jours sans attente : bloqué, l’attente doit être posée explicitement', () => {
    const v = impulseVerdict(51, undefined, NOW);
    expect(v).toMatchObject({ blocked: true, started: false, unlockAt: null });
    expect(v.hoursLeft).toBe(24);
  });
  it('une attente en cours décompte ; expirée, elle débloque l’achat', () => {
    const unlockAt = new Date(NOW + 5 * 3600_000).toISOString();
    const v = impulseVerdict(88, { unlockAt }, NOW);
    expect(v).toMatchObject({ blocked: true, started: true, hoursLeft: 5 });
    const done = impulseVerdict(88, { unlockAt: new Date(NOW - 60_000).toISOString() }, NOW);
    expect(done).toMatchObject({ blocked: false, started: true, hoursLeft: 0 });
  });
});

describe('circuit breaker anti-panique (ventes en krach)', () => {
  const NOW = Date.parse('2026-11-20T15:00:00Z');
  it('F&G >= 25 ou inconnu : aucun blocage', () => {
    expect(panicVerdict(30, undefined, NOW).blocked).toBe(false);
    expect(panicVerdict(null, undefined, NOW).blocked).toBe(false); // donnée indisponible : ouvert
  });
  it('F&G < 25 sans attente : vente bloquée, attente à poser', () => {
    const v = panicVerdict(18, undefined, NOW);
    expect(v).toMatchObject({ blocked: true, started: false, fng: 18 });
    expect(v.hoursLeft).toBe(24);
  });
  it('attente en cours décompte ; expirée, la vente est débloquée', () => {
    const unlockAt = new Date(NOW + 3 * 3600_000).toISOString();
    expect(panicVerdict(10, { unlockAt }, NOW)).toMatchObject({ blocked: true, started: true, hoursLeft: 3 });
    expect(panicVerdict(10, { unlockAt: new Date(NOW - 1000).toISOString() }, NOW)).toMatchObject({ blocked: false, started: true });
  });
});
