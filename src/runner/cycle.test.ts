// Le cycle complet du runner, déroulé avec de faux services (GitHub, Telegram, prix, Fear & Greed) :
// on vérifie la chaîne — lecture déchiffrement, évaluation, envoi, consommation du faisceau, brief.

import { describe, expect, it } from 'vitest';
import type { PriceAlert, Transaction } from '../types';
import type { Candle } from '../lib/indicators';
import type { NewsItem } from './news';
import { isoDay } from '../lib/format';
import { seal, unseal } from '../lib/sync/crypto';
import { CONFLICT } from '../lib/sync/github';
import { runCycle, type CycleDeps, type CycleOptions } from './cycle';
import { nyEpoch } from './brief';
import { emptyState } from './state';
import type { SmartEvent } from '../lib/smartmoney';
import type { RunnerConfig } from './config';

const PASS = 'phrase de passe du runner';
const CFG: RunnerConfig = {
  syncRepo: 'Nikola17/boussole-sync', syncPath: 'boussole-sync.enc', syncToken: 'tok', passphrase: PASS,
  telegramToken: 'tg', telegramChatId: '42', coingeckoKey: null, currency: 'EUR',
  intervalMinutes: 5, briefHour: 8, briefEnabled: true, briefUsOpen: false, briefUsClose: false, newsEnabled: false, smartMoneyEnabled: false, emergingEnabled: false, autopilotEnabled: false, autopilotTelegram: false, signalAlertsEnabled: false, mistralApiKey: null, mistralModel: 'mistral-small-latest', timeZone: 'Europe/Paris', quietStart: 0, quietEnd: 0, stateDir: '', device: 'vps-test',
};

const txSol: Transaction = { id: 't1', coinId: 'solana', symbol: 'sol', name: 'Solana', date: '2026-01-10', type: 'buy', quantity: 100, price: 2, currency: 'USD', fee: 0, fxEurPerUsd: 0.87, updatedAt: '2026-01-10T00:00:00Z' };
const alert: PriceAlert = { id: 'a1', coinId: 'solana', symbol: 'sol', name: 'Solana', condition: 'above', priceUsd: 3, createdAt: '2026-11-01T00:00:00Z', active: true, updatedAt: '2026-11-01T00:00:00Z' };

/** Le palier ×2 de SOL (coût moyen 2 $) est atteint à 4 $, pas à 2 $. */
const UP = { solana: { usd: 4, eur: 3.44, change: 6.2 }, bitcoin: { usd: 200_000, eur: 172_000, change: -1 } };
const FLAT = { solana: { usd: 2, eur: 1.72, change: 0.1 }, bitcoin: { usd: 200_000, eur: 172_000, change: -1 } };

// Mercredi 11 novembre 2026. Toutes les heures sont explicites : un runner ne doit rien à l'heure réelle.
// 20 novembre 2026 : aucun événement macro à moins de 2 jours (la file d'alerte des autres tests reste vierge).
const H = (h: number, m = 0): Date => new Date(2026, 10, 20, h, m);

/** Faux services autour du cycle : tout est enregistré, rien ne sort. */
function makeDeps(bundle: Record<string, unknown>, opts: { pushError?: string; telegramError?: string; noFile?: boolean; prices?: Record<string, { usd?: number; eur?: number; change?: number }>; fng?: { value: number; label: string } | null; btcDaily?: Candle[] | null; news?: NewsItem[]; newsRatings?: { importance: number; resume: string }[]; countAi?: { n: number }; smartEvents?: SmartEvent[]; emerging?: string[] } = {}) {
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
    fearGreed: async () => opts.fng ?? { value: 40, label: 'Peur' },
    // Historique BTC absent par défaut : pas de température (les tests de zone le fournissent).
    btcDaily: async () => opts.btcDaily === undefined ? null : opts.btcDaily,
    funding: async () => 0.0001,
    // Métriques de cycle lentes : muettes par défaut (température sans MVRV ni stablecoins).
    mvrv: async () => null,
    stableShare: async () => null,
    // Veille presse : muette par défaut (les tests dédiés la fournissent).
    news: async () => opts.news ?? [],
    aiRates: async (items) => {
      if (opts.countAi) opts.countAi.n++;
      return items.map((_, i) => opts.newsRatings?.[i] ?? { importance: 0, resume: '' });
    },
    // Smart money : silence par défaut (les tests dédiés fournissent les mouvements).
    smartEvents: opts.smartEvents ? async () => opts.smartEvents! : undefined,
    // Digest émergent : silence par défaut (le test dédié fournit les lignes).
    emerging: opts.emerging ? async () => opts.emerging! : undefined,
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
    // Le cycle d'après : l'alerte ne repart pas (envoi déjà réussi), le palier non plus (le brief le rappelle).
    const second = await runCycle(CFG, first.state, dry(), deps, H(6, 35));
    expect(second.result.sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('ni le palier ni l’alerte ne sont jamais répétés une fois envoyés (plus de rappel hebdomadaire)', async () => {
    const at = H(6, 30).getTime(); // ancré au « maintenant » du test : l'élagage des clés se juge en temps fictif
    const done = await runCycle(CFG, {
      ...emptyState(),
      sent: { 'alert:a1': at, 'exit:solana:2': at },
    }, dry(), makeDeps({ alerts: [alert], transactions: [txSol] }).deps, H(6, 30));
    expect(done.result.sent).toBe(0);
    // … même des semaines plus tard : le palier reste rappelé chaque jour par le brief, pas par une notification.
    const weeksLater = await runCycle(CFG, {
      ...emptyState(),
      sent: { 'alert:a1': at - 30 * 86400_000, 'exit:solana:2': at - 30 * 86400_000 },
    }, dry(), makeDeps({ alerts: [alert], transactions: [txSol] }).deps, H(6, 30));
    expect(weeksLater.result.sent).toBe(0);
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

// 400 bougies BTC construites pour situer la température sans ambiguïté (fonctions pures, pas de dépendance à la chance).
const btcCandles = (slope: number, last: number): Candle[] => {
  const t0 = Date.UTC(2025, 6, 1) / 1000;
  return Array.from({ length: 400 }, (_, i) => {
    const c = 100 + i * slope + (i === 399 ? last : 0); // pente régulière, dernier cours ajusté
    return { time: t0 + i * 86400, open: c, high: c, low: c, close: c, volume: 1000 };
  });
};

describe('cycle du runner — zone de marché (.Température)', () => {
  it('au premier passage, la zone est mémorisée sans rien envoyer', async () => {
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT, fng: { value: 10, label: 'Peur extrême' }, btcDaily: btcCandles(-0.05, 0) });
    const { state, result } = await runCycle(CFG, emptyState(), dry(), deps, H(10, 0));
    expect(sent).toHaveLength(1); // le brief du matin seulement
    expect(state.zoneLabel).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it('un changement de zone prévient sur Telegram, puis ne se répète pas', async () => {
    // Premier passage : marché froid.
    const cold = makeDeps({ transactions: [txSol] }, { prices: FLAT, fng: { value: 10, label: 'Peur extrême' }, btcDaily: btcCandles(-0.05, 0) });
    const first = await runCycle(CFG, emptyState(), dry(), cold.deps, H(10, 0));
    expect(first.state.zoneLabel).toBeTruthy();
    // Deuxième passage : le marché a chauffé, le message part, la référence change.
    const hot = makeDeps({ transactions: [txSol] }, { prices: FLAT, fng: { value: 95, label: 'Avidité extrême' }, btcDaily: btcCandles(0.05, 120) });
    const second = await runCycle(CFG, first.state, dry(), hot.deps, H(11, 0));
    expect(second.result.sent).toBe(1);
    expect(hot.sent.some((t) => t.startsWith('Le marché change de zone'))).toBe(true);
    expect(second.state.zoneLabel).not.toBe(first.state.zoneLabel);
    // Troisième passage : rien de neuf, silence.
    const third = await runCycle(CFG, second.state, dry(), hot.deps, H(12, 0));
    expect(third.result.sent).toBe(0);
  });

  it('un échec Telegram laisse l’ancienne zone : le message repartira au cycle suivant', async () => {
    const cold = makeDeps({ transactions: [txSol] }, { prices: FLAT, fng: { value: 10, label: 'Peur extrême' }, btcDaily: btcCandles(-0.05, 0) });
    const first = await runCycle(CFG, emptyState(), dry(), cold.deps, H(10, 0));
    const failing = makeDeps({ transactions: [txSol] }, { prices: FLAT, fng: { value: 95, label: 'Avidité extrême' }, btcDaily: btcCandles(0.05, 120), telegramError: 'Telegram a refusé sendMessage' });
    const second = await runCycle(CFG, first.state, dry(), failing.deps, H(11, 0));
    expect(second.state.zoneLabel).toBe(first.state.zoneLabel); // inchangée
    expect(second.state.sent['zone:Euphorie']).toBeUndefined(); // rien n'a été marqué envoyé
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
    expect(first.state.lastBriefSlot.matin).toBeUndefined();
    const working = flatDeps();
    const second = await runCycle(CFG, first.state, dry(), working.deps, H(9, 5));
    expect(second.state.lastBriefSlot.matin).toBe('2026-11-20');
    expect(working.sent).toHaveLength(1);
  });

  it('brief désactivé : il ne part jamais', async () => {
    const { deps, sent } = flatDeps();
    await runCycle({ ...CFG, briefEnabled: false }, emptyState(), dry(), deps, H(23, 0));
    expect(sent).toHaveLength(0);
  });
});

describe('cycle du runner — veille presse (idées 13)', () => {
  // briefEnabled: false — sinon le brief du matin partirait aussi selon l'heure locale de la machine de test.
  const NEWS_CFG = { ...CFG, newsEnabled: true, mistralApiKey: 'cle-ia', briefEnabled: false };
  const newsItem = (title: string, hoursAgo = 1): NewsItem => ({
    coinId: 'solana', coinName: 'Solana', title, url: `https://news.google.com/r/${encodeURIComponent(title)}`,
    source: 'Journal Crypto', publishedAt: Date.UTC(2026, 10, 20, 10, 0) - hoursAgo * 3600_000, summaryText: '',
  });
  // 11 novembre 2026, 10 h UTC : « maintenant » pour ces tests (avant les briefs US de 15 h 30 UTC).
  const NOW = new Date(Date.UTC(2026, 10, 20, 10, 0));

  it('une actu notée importante par l’IA part en alerte, avec son résumé, puis ne repart jamais', async () => {
    const { deps, sent } = makeDeps({ transactions: [txSol] }, {
      prices: FLAT, news: [newsItem('Hack de 200 M$ sur un pont Solana')],
      newsRatings: [{ importance: 8, resume: 'Le pont a été exploité. Fonds à risque. Vérifie tes exposures.' }],
    });
    const first = await runCycle(NEWS_CFG, emptyState(), dry(), deps, NOW);
    expect(first.result.sent).toBe(1);
    expect(sent[0]).toContain('Presse — Solana');
    expect(sent[0]).toContain('Hack de 200 M$');
    expect(sent[0]).toContain('Le pont a été exploité');
    const second = await runCycle(NEWS_CFG, first.state, dry(), deps, new Date(NOW.getTime() + 300_000));
    expect(second.result.sent).toBe(0);
  });

  it('une actu jugée sans importance est marquée vue : l’IA n’est plus interrogée à son sujet', async () => {
    const counted = { n: 0 };
    const { deps, sent } = makeDeps({ transactions: [txSol] }, {
      prices: FLAT, news: [newsItem('Trois raisons d’aimer Solana')], countAi: counted,
      newsRatings: [{ importance: 2, resume: 'Opinion sans conséquence.' }],
    });
    const first = await runCycle(NEWS_CFG, emptyState(), dry(), deps, NOW);
    expect(first.result.sent).toBe(0);
    expect(counted.n).toBe(1);
    await runCycle(NEWS_CFG, first.state, dry(), deps, new Date(NOW.getTime() + 300_000));
    expect(counted.n).toBe(1); // déjà notée : plus aucun appel IA
    expect(sent).toHaveLength(0);
  });

  it('sans clé IA, l’heuristique décide : un hack part, une opinion est vue sans alerte', async () => {
    const noAi = { ...CFG, newsEnabled: true, mistralApiKey: null, briefEnabled: false };
    const hack = makeDeps({ transactions: [txSol] }, { prices: FLAT, news: [newsItem('Solana hackee : 200 M$ envolés')] });
    const h = await runCycle(noAi, emptyState(), dry(), hack.deps, NOW);
    expect(h.result.sent).toBe(1);
    expect(hack.sent[0]).toContain('Presse — Solana');
    const calm = makeDeps({ transactions: [txSol] }, { prices: FLAT, news: [newsItem('Trois raisons d’aimer Solana')] });
    const c = await runCycle(noAi, emptyState(), dry(), calm.deps, NOW);
    expect(c.result.sent).toBe(0);
  });

  it('un échec de l’IA ne consomme rien : l’actu sera réévaluée au cycle suivant', async () => {
    const st = { ...emptyState() };
    const counted = { n: 0 };
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT, news: [newsItem('Hack de 200 M$ sur un pont Solana')], countAi: counted });
    const first = await runCycle(NEWS_CFG, st, dry(), deps, NOW); // ratings à 0 : réponse IA manquante
    expect(first.result.sent).toBe(0);
    expect(Object.keys(first.state.sent).filter((k) => k.startsWith('news:'))).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('les briefs du matin citent les actus fraîches avec leur résumé', async () => {
    const { deps, sent } = makeDeps({ transactions: [txSol] }, {
      prices: FLAT, news: [newsItem('Hack de 200 M$ sur un pont Solana', 2)],
      newsRatings: [{ importance: 8, resume: 'Pont exploité, fonds à risque. Vérifie tes expositions. Envisage un retrait temporaire.' }],
    });
    const r = await runCycle({ ...NEWS_CFG, briefEnabled: true }, emptyState(), dry({ forceBrief: true }), deps, NOW);
    expect(r.result.sent).toBe(1); // l'alerte presse (le brief forcé part, mais ne compte pas dans « sent »)
    expect(sent).toHaveLength(2);
    expect(sent.some((t) => t.includes('Boussole — brief du') && t.includes('Actus :') && t.includes('Pont exploité'))).toBe(true);
  });
});

describe('cycle du runner — calendrier macro (idées 3/23)', () => {
  it('la veille d’un événement macro, un message part une fois, avec la conduite à tenir', async () => {
    // 11 novembre 2026 : le CPI est publié le lendemain.
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT });
    const first = await runCycle({ ...CFG, briefEnabled: false }, emptyState(), dry(), deps, new Date(2026, 10, 11, 9, 0));
    expect(first.result.sent).toBe(1);
    expect(sent[0]).toContain('Demain : Inflation US (CPI)');
    expect(sent[0]).toContain('14 h 30');
    expect(first.state.sent['macro:cpi:2026-11-12']).toBeTruthy();
    // Le cycle suivant ne le renvoie pas.
    const second = await runCycle({ ...CFG, briefEnabled: false }, first.state, dry(), deps, new Date(2026, 10, 11, 9, 5));
    expect(second.result.sent).toBe(0);
  });

  it('le brief du matin cite l’horizon macro et ses métriques de cycle', async () => {
    const { deps, sent } = makeDeps({ transactions: [txSol] }, {
      prices: FLAT,
      btcDaily: btcCandles(-0.05, 0),
      fng: { value: 30, label: 'Peur' },
    });
    // 20 novembre 2026, 10 h : le CPI de décembre et le FOMC de décembre sont à l'horizon des 21 jours.
    // (les métriques MVRV/stablecoins sont nulles ici : "Marché" ne les montre pas, jamais un chiffre inventé)
    const st = { ...emptyState(), lastBriefSlot: { 'us-open': isoDay(new Date(2026, 10, 20)), 'us-close': isoDay(new Date(2026, 10, 20)) } };
    await runCycle(CFG, st, dry({ forceBrief: true }), deps, H(10, 0));
    const brief = sent.find((t) => t.includes('Boussole — brief du'));
    expect(brief).toBeTruthy();
    expect(brief).toContain('À l’horizon :');
    expect(brief).toContain('Fed (FOMC) dans 19 j'); // à 19 jours du 20 novembre : le FOMC de décembre
    expect(brief).toContain('halving estimé'); // la position de cycle, même sans MVRV disponible
  });
});

describe('cycle du runner — briefs aux moments clés américains', () => {
  it('le brief d’ouverture US part après 9 h 30 New York, une seule fois par jour', async () => {
    const usCfg = { ...CFG, briefUsOpen: true, briefUsClose: false };
    const day = new Date(2026, 10, 20, 12, 0); // n’importe quelle heure locale du jour : l’instant exact vient de New York
    const openMs = nyEpoch(9, 30, day);
    expect(openMs).not.toBeNull();
    if (openMs == null) return;
    const justBefore = new Date(openMs - 60_000);
    const justAfter = new Date(openMs + 60_000);
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT });
    const before = await runCycle(usCfg, emptyState(), dry(), deps, justBefore);
    expect(sent.filter((t) => t.includes('ouverture américaine'))).toHaveLength(0);
    void before;
    const after = await runCycle(usCfg, before.state, dry(), deps, justAfter);
    expect(sent.filter((t) => t.includes('ouverture américaine'))).toHaveLength(1);
    await runCycle(usCfg, after.state, dry(), deps, new Date(openMs + 120_000));
    expect(sent.filter((t) => t.includes('ouverture américaine'))).toHaveLength(1); // pas deux fois
  });

  it('le brief de clôture US part après 16 h New York, et le matin ne redémarre pas les créneaux', async () => {
    const usCfg = { ...CFG, briefUsOpen: false, briefUsClose: true };
    const day = new Date(2026, 10, 20, 12, 0);
    const closeMs = nyEpoch(16, 0, day);
    expect(closeMs).not.toBeNull();
    if (closeMs == null) return;
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT });
    const st = { ...emptyState(), lastBriefSlot: { matin: isoDay(day) } }; // le matin est déjà parti
    const after = await runCycle(usCfg, st, dry(), deps, new Date(closeMs + 60_000));
    expect(sent.filter((t) => t.includes('clôture américaine'))).toHaveLength(1);
    expect(after.state.lastBriefSlot['us-close']).toBe(isoDay(day));
  });
});

describe('cycle du runner — smart money (wallets suivis)', () => {
  const CFG_SM = { ...CFG, smartMoneyEnabled: true };
  const W = { id: 'w1', label: 'Fonds Test', chain: 'solana' as const, address: 'WALT', kind: 'fund' as const, addedAt: '2026-11-01' };
  const watched = { id: 'solana:MintA', chainId: 'solana', address: 'MintA', symbol: 'ABC', name: 'Abc', addedAt: '2026-11-01', updatedAt: '2026-11-01T00:00:00Z' };
  const at = H(6, 0).getTime();
  const sell: SmartEvent = { walletId: 'w1', walletLabel: 'Fonds Test', chain: 'solana', side: 'sell', mint: 'MintA', symbol: 'ABC', name: 'Abc', uiAmount: 12.5, txHash: 'h1', atMs: at };

  it("la VENTE d'un token de la liste déclenche l'alerte Telegram, la marque envoyée et avance le curseur", async () => {
    const { deps, sent } = makeDeps({ smartWallets: [W], watchedTokens: [watched] }, { smartEvents: [sell] });
    const { state, result } = await runCycle(CFG_SM, emptyState(), dry(), deps, H(6, 30));
    expect(result.error).toBeNull();
    expect(sent.some((t) => t.includes('Fonds Test VEND ABC'))).toBe(true);
    expect(sent.some((t) => t.includes('plan de sortie'))).toBe(true);
    expect(state.sent['sm:w1:h1:MintA']).toBeTruthy();
    expect(state.smCursor['w1']).toBe(at); // lu jusqu'à ce mouvement : pas de relecture au prochain cycle
  });

  it('stop d’un trade ouvert du journal touché : un message, une seule fois', async () => {
    const trade = { id: 't1', coinId: 'solana', symbol: 'sol', side: 'long', status: 'open', entryDate: '2026-11-10', entryPrice: 100, quantity: 2, stopLoss: 90, takeProfit: 130, leverage: 1, fees: 0 };
    const { deps, sent } = makeDeps({ trades: [trade] }, { prices: FLAT });
    deps.tradeBars = async () => [{ time: 1, open: 95, high: 96, low: 89, close: 91, volume: 1 }];
    const r1 = await runCycle(CFG, emptyState(), dry(), deps, H(6, 30));
    expect(sent.filter((t) => t.startsWith('Trade SOL'))).toHaveLength(1);
    expect(sent.find((t) => t.startsWith('Trade SOL'))).toContain('stop');
    await runCycle(CFG, r1.state, dry(), deps, H(6, 35));
    expect(sent.filter((t) => t.startsWith('Trade SOL'))).toHaveLength(1);
  });

  it('chaque mouvement au prix connu entre dans smartMoves, puis reçoit son prix à 7 jours', async () => {
    const out: SmartEvent = { ...sell, mint: 'MintZ', symbol: 'ZZZ', txHash: 'h9' };
    const { deps, pushes } = makeDeps({ smartWallets: [W], watchedTokens: [watched] }, { smartEvents: [out] });
    const asked: string[] = [];
    deps.tokenPrices = async (chain, mints) => { asked.push(`${chain}:${mints.join(',')}`); return new Map([['mintz', 0.25]]); };
    await runCycle(CFG_SM, emptyState(), dry(), deps, H(6, 30));
    expect(asked).toEqual(['solana:MintZ']);
    const remote = (await unseal(pushes[pushes.length - 1].text, PASS)) as { data: { smartMoves: { id: string; priceUsd: number; p7?: number }[] } };
    expect(remote.data.smartMoves).toEqual([expect.objectContaining({ id: 'sm:w1:h9:MintZ', priceUsd: 0.25, side: 'sell' })]);
    // Huit jours plus tard : le prix du moment devient le prix à 7 jours
    const later = makeDeps({ smartWallets: [W], smartMoves: remote.data.smartMoves }, {});
    later.deps.tokenPrices = async () => new Map([['mintz', 0.2]]);
    await runCycle(CFG_SM, emptyState(), dry(), later.deps, new Date(at + 8 * 86400_000));
    const r2 = (await unseal(later.pushes[later.pushes.length - 1].text, PASS)) as { data: { smartMoves: { p7?: number }[] } };
    expect(r2.data.smartMoves[0].p7).toBe(0.2);
  });

  it("un mouvement hors de la liste n'alerte pas, mais fait avancer le curseur (sans relecture en boucle)", async () => {
    const out: SmartEvent = { ...sell, mint: 'MintZ', symbol: 'ZZZ', txHash: 'h2' };
    const { deps, sent } = makeDeps({ smartWallets: [W], watchedTokens: [watched] }, { smartEvents: [out] });
    const { state, result } = await runCycle(CFG_SM, emptyState(), dry(), deps, H(6, 30));
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(state.sent['sm:w1:h2:MintZ']).toBeUndefined();
    expect(state.smCursor['w1']).toBe(at);
  });


  it("mode vacances : ni alerte presse ni smart money — mais le prix et les paliers continuent", async () => {
    const CFG_SM = { ...CFG, smartMoneyEnabled: true, newsEnabled: true };
    const { deps, sent } = makeDeps(
      { smartWallets: [W], watchedTokens: [watched], profile: { vacationUntil: '2026-11-20' } },
      { smartEvents: [sell], prices: FLAT, fng: { value: 55, label: 'Neutral' }, news: [] },
    );
    const { state } = await runCycle(CFG_SM, emptyState(), dry(), deps, H(6, 30));
    expect(sent.some((t) => t.includes('VEND'))).toBe(false);      // veil critical only
    expect(sent.some((t) => t.includes('Wallets suivis'))).toBe(false);
    expect(state.sent['sm:w1:h1:MintA']).toBeUndefined();          // nothing marked consumed
    const morning = makeDeps(
      { smartWallets: [W], watchedTokens: [watched], profile: { vacationUntil: '2026-11-20' } },
      { smartEvents: [sell], prices: FLAT },
    );
    await runCycle(CFG_SM, state, dry(), morning.deps, H(8, 30));
    expect(morning.sent.some((t) => t.includes("Mode vacances jusqu'au 2026-11-20"))).toBe(true);
  });

  it("un échec Telegram n'envoie rien, ne marque rien, et n'avance pas le curseur : tout repart au cycle suivant", async () => {
    const fail = makeDeps({ smartWallets: [W], watchedTokens: [watched] }, { smartEvents: [sell], telegramError: 'Telegram a refusé sendMessage' });
    const first = await runCycle(CFG_SM, emptyState(), dry(), fail.deps, H(6, 30));
    expect(first.result.sent).toBe(0);
    expect(first.state.sent['sm:w1:h1:MintA']).toBeUndefined();
    expect(first.state.smCursor['w1']).toBeUndefined(); // le mouvement reste à lire
    const retry = makeDeps({ smartWallets: [W], watchedTokens: [watched] }, { smartEvents: [sell] });
    const second = await runCycle(CFG_SM, first.state, dry(), retry.deps, H(6, 35));
    expect(second.result.sent).toBe(1); // l'alerte a bien fini par partir
    expect(second.state.sent['sm:w1:h1:MintA']).toBeTruthy();
    expect(second.state.smCursor['w1']).toBe(at);
  });
});

describe('cycle du runner — digest des pépites émergentes', () => {
  it('le brief du matin égrène les candidates scannées, avec les wallets suivis entrés', async () => {
    const CFG_EM = { ...CFG, emergingEnabled: true };
    const { deps, sent } = makeDeps(
      { transactions: [txSol], smartWallets: [{ id: 'w1', label: 'Fonds Test', chain: 'solana' as const, address: 'WALT', kind: 'fund' as const, addedAt: '2026-11-01' }] },
      { prices: FLAT, emerging: ['BONK (Solana, 1 j d’âge, vol 2.0 M $, 75 % d’achats (24 h), scan : plutôt sain) — wallet suivi : Fonds Test'] },
    );
    const { state } = await runCycle(CFG_EM, emptyState(), dry(), deps, H(8, 30));
    const brief = sent.find((t) => t.includes('brief du'));
    expect(brief).toBeTruthy();
    expect(brief).toContain('Émergentes (Solana/Base, à scanner avant tout) : BONK');
    expect(brief).toContain('wallet suivi : Fonds Test');
    expect(brief!.split('Émergentes').length).toBe(2); // une seule section, pas de doublon
    expect(state.lastBriefSlot['matin']).toBeTruthy();
  });

  it('sans candidate, le brief ne parle pas d’émergentes ; désactivé, le digest n’est même pas appelé', async () => {
    const CFG_EM = { ...CFG, emergingEnabled: true };
    const silence = makeDeps({ transactions: [txSol] }, { prices: FLAT, emerging: [] });
    await runCycle(CFG_EM, emptyState(), dry(), silence.deps, H(8, 30));
    expect(silence.sent.some((t) => t.includes('Émergentes'))).toBe(false); // pas de section vide
    const off = makeDeps(
      { transactions: [txSol] },
      { prices: FLAT },
    );
    await runCycle(CFG, emptyState(), dry(), off.deps, H(8, 30));
    expect(off.sent.some((t) => t.includes('Émergentes'))).toBe(false);
  });
});

describe('cycle du runner — silence nocturne', () => {
  const CFG_NIGHT = { ...CFG, quietStart: 23, quietEnd: 8 };

  it('la nuit (2 h) : les alertes n’envoient rien, elles attendent en file sans rien consommer', async () => {
    const { deps, sent, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const { state, result } = await runCycle(CFG_NIGHT, emptyState(), dry(), deps, H(2, 0));
    expect(sent).toHaveLength(0);
    expect(pushes).toHaveLength(0);
    expect(result.sent).toBe(0);
    expect(state.sent).toEqual({});
    expect(Object.keys(state.quietQueue)).toEqual(expect.arrayContaining(['alert:a1', 'exit:solana:2']));
    expect(state.quietQueue['alert:a1'].alertId).toBe('a1');
  });

  it('le matin (9 h) : un digest résume la nuit, puis les alertes sont consommées du faisceau', async () => {
    const { deps, sent, pushes } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const night = await runCycle(CFG_NIGHT, emptyState(), dry(), deps, H(2, 0));
    const morning = await runCycle(CFG_NIGHT, night.state, dry(), deps, H(9, 0));
    expect(night.result.sent).toBe(0);
    expect(sent).toHaveLength(2); // le digest de la nuit, puis le brief du matin (jamais 4 notifications)
    expect(sent[0]).toContain('Pendant la nuit');
    expect(sent[0]).toContain('Alerte SOL');
    expect(sent[0]).toContain('Palier ×2 atteint sur SOL');
    expect(morning.state.quietQueue).toEqual({});
    expect(morning.state.sent['alert:a1']).toBeTruthy();
    expect(pushes).toHaveLength(1); // la consommation repart dans la synchronisation
    const consumed = (await unseal(pushes[0].text, PASS)) as { data: { alerts: PriceAlert[] } };
    expect(consumed.data.alerts[0]).toMatchObject({ id: 'a1', active: false });
  });

  it('une même alerte qui persiste la nuit n’occupe qu’une ligne du message du matin', async () => {
    const { deps, sent } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const d23 = await runCycle(CFG_NIGHT, emptyState(), dry(), deps, new Date(2026, 10, 20, 23, 30)); // vendredi soir
    expect(d23.state.quietQueue['alert:a1']).toBeTruthy(); // mise en attente la nuit venue
    const d02 = await runCycle(CFG_NIGHT, d23.state, dry(), deps, new Date(2026, 10, 21, 2, 0)); // samedi, 2 h
    expect(Object.keys(d02.state.quietQueue).sort()).toEqual(['alert:a1', 'exit:solana:2']); // toujours pas de doublon
    await runCycle(CFG_NIGHT, d02.state, dry(), deps, new Date(2026, 10, 21, 9, 0)); // samedi matin
    const digests = sent.filter((t) => t.includes('Pendant la nuit'));
    expect(digests).toHaveLength(1);
    expect(digests[0].split('Alerte SOL').length).toBe(2); // l’alerte y est une fois, pas deux
    expect(digests[0].split('Palier ×2').length).toBe(2); // le palier aussi, une seule ligne
  });

  it('un échec Telegram au matin laisse la nuit entière en attente : rien n’est perdu', async () => {
    const { deps, sent } = makeDeps({ alerts: [alert], transactions: [txSol] });
    const night = await runCycle(CFG_NIGHT, emptyState(), dry(), deps, H(2, 0));
    expect(sent).toHaveLength(0);
    const bad = makeDeps({ alerts: [alert], transactions: [txSol] }, { telegramError: 'Telegram KO' });
    const morning = await runCycle(CFG_NIGHT, night.state, dry(), bad.deps, H(9, 0));
    expect(morning.result.sent).toBe(0);
    expect(morning.result.error).toContain('Telegram');
    expect(Object.keys(morning.state.quietQueue)).toHaveLength(2);
    expect(morning.state.sent).toEqual({}); // rien de marqué : le suivant retentera
  });
});

describe('autopilotes dans le cycle du serveur', () => {
  const CFG_AP = { ...CFG, autopilotEnabled: true, autopilotTelegram: true };
  const fakeAutopilot = (calls: { n: number }) => async (b: { data: Record<string, unknown>; deletions: unknown[]; stamps: Record<string, string> }) => {
    calls.n++;
    return { bundle: { ...b, data: { ...b.data, paperDays: [{ id: 'a1:2026-11-20', portfolioId: 'a1', day: '2026-11-20' }] } } as never, changed: 1, events: [{ key: 'auto:a1:2026-11-20', text: 'Autopilote « Test » — ordres du 20/11 (papier)' }], briefLines: ['Test : 100 USDC (+1,0 %) — en observation'] };
  };
  it('message envoyé une fois, journaux écrits dans la même écriture', async () => {
    const calls = { n: 0 };
    const { deps, sent, pushes } = makeDeps({ transactions: [] }, { prices: FLAT });
    deps.autopilot = fakeAutopilot(calls);
    const first = await runCycle(CFG_AP, emptyState(), { dry: false, forceBrief: false }, deps, H(10));
    expect(sent.filter((t) => t.startsWith('Autopilote'))).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    const remote = await unseal(pushes[0].text, PASS) as { data: { paperDays: unknown[] } };
    expect(remote.data.paperDays).toHaveLength(1);
    await runCycle(CFG_AP, first.state, { dry: false, forceBrief: false }, deps, H(10, 5));
    expect(sent.filter((t) => t.startsWith('Autopilote'))).toHaveLength(1);
  });
  it('conflit d’écriture : rien n’est perdu, aucun message en double au cycle suivant', async () => {
    const calls = { n: 0 };
    const { deps, sent } = makeDeps({ transactions: [] }, { prices: FLAT, pushError: CONFLICT });
    deps.autopilot = fakeAutopilot(calls);
    const first = await runCycle(CFG_AP, emptyState(), { dry: false, forceBrief: false }, deps, H(10));
    expect(first.result.error).toContain('l’autre appareil');
    await runCycle(CFG_AP, first.state, { dry: false, forceBrief: false }, deps, H(10, 5));
    expect(sent.filter((t) => t.startsWith('Autopilote'))).toHaveLength(1);
  });
  it('à blanc : ni écriture ni envoi ; désactivé : non appelé ; brief avec les autopilotes', async () => {
    const calls = { n: 0 };
    const { deps, sent, pushes } = makeDeps({ transactions: [] }, { prices: FLAT });
    deps.autopilot = fakeAutopilot(calls);
    const dry: string[] = [];
    await runCycle(CFG_AP, emptyState(), { dry: true, forceBrief: true, onDry: (t) => dry.push(t) }, deps, H(10));
    expect(pushes).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(dry.some((t) => t.includes('Test : 100 USDC'))).toBe(true);
    await runCycle({ ...CFG_AP, autopilotEnabled: false }, emptyState(), { dry: false, forceBrief: false }, deps, H(10));
    expect(calls.n).toBe(1);
  });
});

describe('alertes de signal dans le cycle', () => {
  const CFG_SIG = { ...CFG, signalAlertsEnabled: true };
  it('premier calcul mémorisé sans prévenir, puis une alerte par nouvel épisode, une fois par jour, rien en vacances', async () => {
    const day = (d: number, h: number) => new Date(Date.UTC(2026, 10, d, h, 30));
    let keys: string[] = [];
    const { deps, sent } = makeDeps({ transactions: [txSol] }, { prices: FLAT });
    deps.signals = async () => ({ solana: { symbol: 'sol', keys } });
    const r1 = await runCycle(CFG_SIG, emptyState(), { dry: false, forceBrief: false }, deps, day(20, 9));
    expect(sent.filter((t) => t.startsWith('Signal'))).toHaveLength(0);
    keys = ['inv:Alléger'];
    const r2 = await runCycle(CFG_SIG, r1.state, { dry: false, forceBrief: false }, deps, day(21, 9));
    expect(sent.filter((t) => t.startsWith('Signal SOL'))).toHaveLength(1);
    expect(sent.find((t) => t.startsWith('Signal SOL'))).toContain('Fiabilité :');
    await runCycle(CFG_SIG, r2.state, { dry: false, forceBrief: false }, deps, day(21, 15));
    expect(sent.filter((t) => t.startsWith('Signal SOL'))).toHaveLength(1);
    const vac = makeDeps({ transactions: [txSol], profile: { vacationUntil: '2026-12-31' } }, { prices: FLAT });
    vac.deps.signals = deps.signals;
    keys = [];
    const v1 = await runCycle(CFG_SIG, emptyState(), { dry: false, forceBrief: false }, vac.deps, day(20, 9));
    keys = ['inv:Alléger'];
    await runCycle(CFG_SIG, v1.state, { dry: false, forceBrief: false }, vac.deps, day(21, 9));
    expect(vac.sent.filter((t) => t.startsWith('Signal'))).toHaveLength(0);
  });
});
