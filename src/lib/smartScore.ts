// Wallets suivis notés : chaque achat ou vente détecté par le serveur est rejugé à 7 et 30 jours.
// Achat gagnant si le prix a monté ; vente gagnante si le prix a baissé (baisse évitée). Prix inconnu : non jugé.

import type { SmartMove } from '../types';
import { eventKey, type SmartEvent } from './smartmoney';

export const SMART_MOVES_MAX = 300;
const UNFAVORABLE_MIN_JUDGED = 10;
const UNFAVORABLE_RATE = 0.4;

/** Ajoute les nouveaux mouvements (sans doublon d'identifiant) et garde les `max` plus récents. */
export function addMoves(existing: SmartMove[], incoming: SmartMove[], max = SMART_MOVES_MAX): SmartMove[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-max);
}

export interface WalletScore { followed: number; wins7: number; wins30: number; judged30: number; unfavorable: boolean }

export function scoreWallet(moves: SmartMove[], priceAt: (move: SmartMove, days: number) => number | null): WalletScore {
  let wins7 = 0, wins30 = 0, judged30 = 0;
  const won = (m: SmartMove, later: number) => (m.side === 'buy' ? later > m.priceUsd : later < m.priceUsd);
  for (const m of moves) {
    if (!(m.priceUsd > 0)) continue;
    const p7 = priceAt(m, 7);
    if (p7 != null && p7 > 0 && won(m, p7)) wins7++;
    const p30 = priceAt(m, 30);
    if (p30 != null && p30 > 0) {
      judged30++;
      if (won(m, p30)) wins30++;
    }
  }
  return { followed: moves.length, wins7, wins30, judged30, unfavorable: judged30 >= UNFAVORABLE_MIN_JUDGED && wins30 / judged30 < UNFAVORABLE_RATE };
}

export function scoreLine(s: WalletScore): string {
  const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
  return `${pl(s.followed, 'mouvement')} suivi${s.followed > 1 ? 's' : ''}, ${pl(s.wins30, 'gagnant')} à 30 jours${s.unfavorable ? ' · historique défavorable' : ''}`;
}

const DAY = 86400_000;
const GIVE_UP_DAYS = 2;

/** Mouvements détectés dont le prix du token est connu (clé = adresse en minuscules). */
export function movesFromEvents(events: SmartEvent[], priceByMint: Map<string, number>): SmartMove[] {
  const out: SmartMove[] = [];
  for (const e of events) {
    const px = priceByMint.get(e.mint.toLowerCase());
    if (px == null || !(px > 0)) continue;
    out.push({ id: eventKey(e), walletId: e.walletId, chain: e.chain, mint: e.mint, symbol: e.symbol, side: e.side, priceUsd: px, at: new Date(e.atMs).toISOString() });
  }
  return out;
}

/** Relève le prix à 7 et 30 jours des mouvements arrivés à échéance ; prix introuvable 2 jours après : 0 (non jugé). */
export function judgeMoves(moves: SmartMove[], nowMs: number, priceOf: (m: SmartMove) => number | null): { moves: SmartMove[]; changed: number } {
  let changed = 0;
  const next = moves.map((m) => {
    const age = (nowMs - Date.parse(m.at)) / DAY;
    let out = m;
    for (const [h, field] of [[7, 'p7'], [30, 'p30']] as const) {
      if (out[field] != null || age < h) continue;
      // Au-delà de 2 jours après l'échéance, un prix ne dit plus rien de cet horizon : non jugé.
      if (age >= h + GIVE_UP_DAYS) { out = { ...out, [field]: 0 }; continue; }
      const px = priceOf(m);
      if (px != null && px > 0) out = { ...out, [field]: px };
    }
    if (out !== m) changed++;
    return out;
  });
  return { moves: next, changed };
}

/** Moves arrivés à une échéance sans prix relevé : ceux dont le serveur doit demander le prix. */
export function movesDue(moves: SmartMove[], nowMs: number): SmartMove[] {
  return moves.filter((m) => {
    const age = (nowMs - Date.parse(m.at)) / DAY;
    return (m.p7 == null && age >= 7) || (m.p30 == null && age >= 30);
  });
}
