// État local du runner : dédoublonnage des envois (une fois seulement), zone de marché, statut du dernier contrôle.

import { describe, expect, it } from 'vitest';
import { dropQuiet, emptyState, holdQuiet, markSent, parseState, quietMessage, shouldSend, pruneSent, recordStatus, SENT_RETENTION_MS } from './state';

const NOW = 1_800_000_000_000;

describe('état du runner', () => {
  it('un état corrompu ou absent repart de zéro sans rien casser', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('Pas du tout du JSON')).toEqual(emptyState());
    const st = parseState(JSON.stringify({ sent: { 'exit:solana:2': 123 }, lastBriefDay: '2026-11-10', zoneLabel: 'Neutre', okAt: 7, attemptAt: 8, error: null }));
    expect(st.sent).toEqual({ 'exit:solana:2': 123 });
    expect(st.zoneLabel).toBe('Neutre');
    // L'ancien champ « dernier brief du jour » devient le créneau du matin (le brief ne repart pas ce jour-là).
    expect(st.lastBriefSlot).toEqual({ matin: '2026-11-10' });
    expect(parseState(JSON.stringify({ lastBriefSlot: { 'us-open': '2026-11-10' } })).lastBriefSlot).toEqual({ 'us-open': '2026-11-10' });
    // Champs aberrants ignorés silencieusement (le runner ne doit jamais planter sur son propre état).
    const odd = parseState(JSON.stringify({ sent: { a: 'x', b: 5 }, lastBriefDay: 42, zoneLabel: 17 }));
    expect(odd.sent).toEqual({ b: 5 });
    expect(odd.lastBriefSlot).toEqual({});
    expect(odd.zoneLabel).toBeNull();
    expect(odd.zoneLabel).toBeNull();
  });

  it('une clé déjà envoyée ne repart jamais — ni l’alerte, ni le palier (plus de rappel hebdomadaire)', () => {
    const st = emptyState();
    expect(shouldSend(st, 'alert:a1')).toBe(true);
    const sent = markSent(st, ['alert:a1', 'exit:solana:2'], NOW);
    expect(shouldSend(sent, 'alert:a1')).toBe(false);
    expect(shouldSend(sent, 'exit:solana:2')).toBe(false);
    // Même des semaines plus tard : le palier reste rappelé chaque jour par le brief, pas par une notification.
    expect(shouldSend(sent, 'exit:solana:2')).toBe(false);
  });

  it('les clés plus vieilles que 30 jours sont nettoyées, mais jamais les paliers ; sans changement l’objet reste le même', () => {
    const st = markSent(emptyState(), ['a', 'b', 'exit:solana:2'], NOW - SENT_RETENTION_MS - 5);
    const pruned = pruneSent({ ...st, sent: { ...st.sent, c: NOW } }, NOW);
    expect(Object.keys(pruned.sent)).toEqual(['exit:solana:2', 'c']);
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

describe('silence nocturne — la file d\'attente de la nuit', () => {
  it('tient, regroupe par clé, puis se vide proprement', () => {
    let st = emptyState();
    st = holdQuiet(st, [{ key: 'alert:a1', text: 'Alerte SOL', alertId: 'a1' }], 1000);
    st = holdQuiet(st, [{ key: 'alert:a1', text: 'Alerte SOL (relue à 3 h)' }], 2000); // même clé : remplacée, pas dupliquée
    expect(st.quietQueue['alert:a1']).toMatchObject({ text: 'Alerte SOL (relue à 3 h)', at: 2000 });
    st = dropQuiet(st, ['alert:a1']);
    expect(st.quietQueue).toEqual({});
  });
  it('la file survit à une relecture du fichier d\'état (aucune alerte perdue par un redémarrage)', () => {
    let st = holdQuiet(emptyState(), [{ key: 'exit:solana:2', text: 'Palier ×2' }], 1000);
    const restored = parseState(JSON.stringify(st));
    expect(restored.quietQueue['exit:solana:2']).toEqual({ text: 'Palier ×2', at: 1000 });
  });
  it('le message du matin cite l\'heure d\'origine du mouvement et regroupe au-delà de huit lignes', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ text: `Alerte ${i}\ndétail`, at: Date.parse('2026-11-20T02:30:00Z') + i * 60000 }));
    const msg = quietMessage(items, 'Europe/Paris');
    expect(msg).toContain('Pendant la nuit');
    expect(msg).toContain('+ 2 autres pendant la nuit');
    expect(msg.split('Heure d\'Europe')).toHaveLength(1); // pas de fuite de fuseau brut
  });
});
