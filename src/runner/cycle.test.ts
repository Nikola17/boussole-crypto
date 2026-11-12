// Le cycle complet du runner, déroulé avec de faux services (GitHub, Telegram, prix, Fear & Greed) :
// on vérifie la chaîne — lecture déchiffrement, évaluation, envoi, consommation du faisceau, brief.

import { describe, expect, it } from 'vitest';
import type { PriceAlert, Transaction } from '../types';
import { seal, unseal } from '../lib/sync/crypto';
import { CONFLICT } from '../lib/sync/github';
import { runCycle, type CycleDeps, type CycleOptions } from './cycle';
import { emptyState, RUNG_REPEAT_MS } from './state';
import type { RunnerConfig } from './config';

const PASS = 'phrase de passe du runner';
const CFG: RunnerConfig = {
  syncRepo: 'Nikola17/boussole-sync', syncPath: 'boussole-sync.enc', syncToken: 'tok', passphrase: PASS,
  telegramToken: 'tg', telegramChatId: '42', coingeckoKey: null, currency: 'EUR',
  intervalMinutes: 5, briefHour: 8, briefEnabled: true, timeZone: 'Europe/Paris', stateDir: '', device: 'vps-test',
};

const txSol: Transaction = { id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-01-10', type: 'buy', quantity: 100, price: 2, currency: 'USD', fee: 0, fxEurPerUsd: 0.87, updatedAt: '2026-01-10T00:00:00Z' };
const alert: PriceAlert = { id: 'a1', coinId: 'solana', symbol: 'sol', name: 'Solana', condition: 'above', priceUsd: 3, createdAt: '2026-11-01T00:00:00Z', active: true, updatedAt: '2026-11-01T00:00:00Z' };

/** Le palier ×2 de SOL (coût moyen 2 $) est atteint à 4 $, pas à 2 $. */
const UP = { solana: { usd: 4, eur: 3.44, change: 6.2 }, bitcoin: { usd: 200_000, eur: 172_000, change: -1 } };
const FLAT = { solana: { usd: 2, eur: 1.72, change: 0.1 }, bitcoin: { usd: 200_000, eur: 172_000, change: -1 } };

// Mercredi 11 novembre 2026. Toutes les heures sont explicites : un runner ne doit rien à l'heure réelle.
const H = (h: number, m = 0): Date => new Date(2026, 10, 11, h, m);

/** Faux services autour du cycle : tout est enregistré, rien ne sort. */
function makeDeps(bundle: Record<string, unknown>, opts: { pushError?: string; telegramError?: string; noFile?: boolean; prices?: Record<string, { usd?: number; eur?: number; change?: number }> } = {}) {
  const sent: string[] = [];
  const pushes: { text: string; sha: string | null }[] = [];
  let sha: string | null = 'sha-initial';
  let content: string | null = null;
  const deps: CycleDeps = {
    fetchRemote: async () => {
      if (opts.noFile) return null;
      content = content ?? (await seal({ data: bundle, deletions: [], stamps: {}, device: 'pc-nico', savedAt: '2026-11-10T18:02:00Z' }, PASS));
      return { sha, content };
    },
    pushRemote: async (text, knownSha) => {
      if (opts.pushError) throw new Error(opts.pushError);
      if (knownSha !== sha) throw new Error(CONFLICT); // GitHub refuse l'écrasement d'une modification inconnue
      pushes.push({ text, sha: knownSha });
      sha = `sha-${pushes.length + 1}`;
      content = text;
    },
    telegram: async (text) => {
      if (opts.telegramError) throw new Error(opts.telegramError);
      sent.push(text);
    },
    // Palier ×2 de SOL (coût moyen 2 $) atteint seulement quand le prix est « haut ».
    prices: async () => opts.prices ?? UP,
    fearGreed: async () => ({ value: 40, label: 'Peur' }),
  };
  return { deps, sent, pushes };
}

const dry = (over: Partial<CycleOptions> = {}): CycleOptions => ({ dry: false, forceBrief: false, ...over });

describe('cycle du runner — alertes et paliers', () => {
  it('une alerte atteinte est envoyée puis consommée du faisceau distant (relu : active=false)', async () => {
    const { deps, sent, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const { state, result } = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30)); // avant l'heure du brief
    expect(result).toMatchObject({ sent: 2, consumed: 1, error: null, watching: 1 }); // l'alerte + le palier ×2
    expect(sent[0]).toContain('Alerte SOL');
    expect(sent[1]).toContain('Palier ×2 atteint sur SOL');
    expect(pushes).toHaveLength(1);
    expect(pushes[0].sha).toBe('sha-initial');
    const reread = (await unseal(pushes[0].text, PASS)) as { data: { alerts: PriceAlert[] }; device: string };
    expect(reread.device).toBe('vps-test');
    expect(reread.data.alerts[0]).toMatchObject({ id: 'a1', active: false });
    expect(reread.data.alerts[0].triggeredAt).toBeTruthy();
    expect(state.sent['alert:a1']).toBeTruthy();
  });

  it('une erreur Telegram n’envoie rien du tout, ne consomme rien, et se voit dans le statut', async () => {
    const { deps, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] }, { telegramError: 'Telegram a refusé sendMessage' });
    const { state, result } = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(result.sent).toBe(0);
    expect(pushes).toHaveLength(0);
    expect(state.sent).toEqual({});
    expect(state.error).toContain('Telegram');
    expect(state.okAt).toBeNull();
  });

  it('un conflit d’écriture GitHub ne consomme pas : le cycle suivant retentera, sans répéter l’envoi', async () => {
    const { deps, sent, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] }, { pushError: CONFLICT });
    const first = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(first.result.sent).toBe(2);
    expect(first.result.consumed).toBe(0);
    expect(first.result.error).toContain('prochain cycle');
    expect(pushes).toHaveLength(0);
    // Le cycle d'après : l'alerte ne repart pas (envoi déjà réussi), le palier non plus (rappel à 7 jours).
    const second = await runCycle(CFG, first.state, dry(), deps, H(6, 35));
    expect(second.result.sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('le palier est rappelé une fois par semaine, l’alerte n’est jamais répétée', async () => {
    const at = Date.now();
    const wantRepeat = await runCycle(CFG, {
      ...emptyState(),
      sent: { 'alert:a1': at - 2 * RUNG_REPEAT_MS, 'exit:solana:2': at - 2 * RUNG_REPEAT_MS },
    }, dry(), makeDeps({ alerts: [alert], transactions: [txSol] }).deps, H(6, 30));
    expect(wantRepeat.result.sent).toBe(1); // seulement le palier
    const recentlySent = await runCycle(CFG, {
      ...emptyState(),
      sent: { 'alert:a1': at, 'exit:solana:2': at - RUNG_REPEAT_MS / 3 },
    }, dry(), makeDeps({ alerts: [alert], transactions: [txSol] }).deps, H(6, 30));
    expect(recentlySent.result.sent).toBe(0);
  });

  it('l’alerte déjà consommée par l’application n’est plus surveillée', async () => {
    const consumed: PriceAlert = { ...alert, active: false, triggeredAt: '2026-11-09T10:00:00Z' };
    const { deps, sent, pushes } = makeDeps({ alerts: [consumed], transactions: [txSol] });
    const { result } = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(result.watching).toBe(0);
    expect(result.sent).toBe(1); // juste le palier
    expect(sent[0]).toContain('Palier');
    expect(pushes).toHaveLength(0); // rien à consommer : le fichier distant n'est pas réécrit
  });

  it('fichier distant absent : erreur claire (activer la sync dans l’app), rien d’autre', async () => {
    const { deps } = makeDeps({}, { noFile: true });
    const { state, result } = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(result.error).toContain('n’existe pas encore');
    expect(state.okAt).toBeNull();
    expect(state.error).toContain('n’existe pas encore');
  });

  it('à blanc (--check) : rien n’est envoyé ni écrit, mais tout est évalué et montré', async () => {
    const shown: string[] = [];
    const { deps, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const { state, result } = await runCycle(CFG, emptyState(), { dry: true, forceBrief: true, onDry: (t) => shown.push(t) }, deps, H(6, 30));
    expect(result.sent).toBe(0);
    expect(result.consumed).toBe(0);
    expect(pushes).toHaveLength(0);
    expect(state.sent).toEqual({});
    expect(shown).toHaveLength(3); // alerte + palier + brief du jour
    expect(shown[2]).toContain('Boussole — brief');
  });
});

describe('cycle du runner — brief quotidien', () => {
  // Prix « plat » : le palier ×2 de SOL n'est pas atteint, seul le brief peut partir.
  const flatDeps = () => {
    const d = makeDeps({ transactions: [txSol] }, { prices: FLAT });
    return d;
  };

  it('après l’heure du brief, il part une seule fois par jour, même sans alerte', async () => {
    const { deps, sent } = flatDeps();
    const first = await runCycle(CFG, emptyState(), dry(), deps, H(9, 5));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Boussole — brief');
    // Le cycle suivant, dix minutes plus tard : le brief ne repart pas.
    await runCycle(CFG, first.state, dry(), deps, H(9, 15));
    expect(sent).toHaveLength(1);
    // Ni à un autre moment de la journée.
    await runCycle(CFG, first.state, dry(), deps, H(20, 0));
    expect(sent).toHaveLength(1);
  });

  it('avant l’heure du brief, rien ne part ; --brief force l’envoi immédiat', async () => {
    const { deps, sent } = flatDeps();
    await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(sent).toHaveLength(0);
    await runCycle(CFG, emptyState(), dry({ forceBrief: true }), deps, H(6, 30));
    expect(sent).toHaveLength(1);
  });

  it('un échec de l’envoi du brief est retenté au cycle suivant, pas marqué parti', async () => {
    const failing = makeDeps({ transactions: [txSol] }, { telegramError: 'Telegram a refusé sendMessage' });
    const first = await runCycle(CFG, emptyState(), dry(), { ...failing.deps, prices: async () => FLAT }, H(9, 0));
    expect(first.result.error).toContain('Telegram');
    expect(first.state.lastBriefDay).toBeNull();
    const working = flatDeps();
    const second = await runCycle(CFG, first.state, dry(), working.deps, H(9, 5));
    expect(second.state.lastBriefDay).toBe('2026-11-11');
    expect(working.sent).toHaveLength(1);
  });

  it('brief désactivé : il ne part jamais', async () => {
    const { deps, sent } = flatDeps();
    await runCycle({ ...CFG, briefEnabled: false }, emptyState(), dry(), deps, H(23, 0));
    expect(sent).toHaveLength(0);
  });
});
