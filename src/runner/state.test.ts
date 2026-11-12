// État local du runner : dédoublonnage des envois, rappels hebdomadaires des paliers, statut du dernier contrôle.

import { describe, expect, it } from 'vitest';
import { emptyState, markSent, parseState, shouldSend, pruneSent, recordStatus, RUNG_REPEAT_MS, SENT_RETENTION_MS } from './state';

const NOW = 1_800_000_000_000;

describe('état du runner', () => {
  it('un état corrompu ou absent repart de zéro sans rien casser', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('Pas du tout du JSON')).toEqual(emptyState());
    const st = parseState(JSON.stringify({ sent: { 'exit:solana:2': 123 }, lastBriefDay: '2026-11-10', okAt: 7, attemptAt: 8, error: null }));
    expect(st.sent).toEqual({ 'exit:solana:2': 123 });
    // Champs aberrants ignorés silencieusement (le runner ne doit jamais planter sur son propre état).
    const odd = parseState(JSON.stringify({ sent: { a: 'x', b: 5 }, lastBriefDay: 42 }));
    expect(odd.sent).toEqual({ b: 5 });
    expect(odd.lastBriefDay).toBeNull();
  });

  it('une clé jamais envoyée part ; une clé envoyée ne repart pas ; un palier repart après 7 jours', () => {
    const st = emptyState();
    expect(shouldSend(st, 'alert:a1', NOW)).toBe(true);
    const sent = markSent(st, ['alert:a1'], NOW);
    expect(shouldSend(sent, 'alert:a1', NOW + 60_000)).toBe(false);
    expect(shouldSend(sent, 'alert:a1', NOW + RUNG_REPEAT_MS - 1, RUNG_REPEAT_MS)).toBe(false);
    expect(shouldSend(sent, 'alert:a1', NOW + RUNG_REPEAT_MS, RUNG_REPEAT_MS)).toBe(true);
    // Sans répétition prévue : jamais réenvoyée, quel que soit l'âge (l'alerte est consommée entre-temps).
    expect(shouldSend(sent, 'alert:a1', NOW + SENT_RETENTION_MS * 3, null)).toBe(false);
  });

  it('les clés plus vieilles que 30 jours sont nettoyées, et sans changement l’objet reste le même', () => {
    const st = markSent(emptyState(), ['a', 'b'], NOW - SENT_RETENTION_MS - 5);
    const pruned = pruneSent({ ...st, sent: { ...st.sent, c: NOW } }, NOW);
    expect(Object.keys(pruned.sent)).toEqual(['c']);
    const same = pruneSent(markSent(emptyState(), ['a'], NOW), NOW);
    expect(pruneSent(same, NOW)).toBe(same); // rien à nettoyer : pas de nouvelle écriture
  });

  it('le statut garde la date de chaque tentative, et l’erreur disparaît au premier succès', () => {
    let st = emptyState();
    st = recordStatus(st, false, 'CoinGecko a répondu 429', NOW);
    expect(st).toMatchObject({ attemptAt: NOW, okAt: null, error: 'CoinGecko a répondu 429' });
    st = recordStatus(st, true, null, NOW + 60_000);
    expect(st).toMatchObject({ attemptAt: NOW + 60_000, okAt: NOW + 60_000, error: null });
  });
});
