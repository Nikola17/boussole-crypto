// Données on-chain Bitcoin : MVRV (capitalisation / capital réalisé) via bitcoin-data.com.
// Source gratuite : valeur courante avec ~7 jours de retard (l'historique temps réel est payant).
// Le retard n'affecte pas l'usage : le MVRV décrit la position dans le cycle, pas le jour même.

import { getJson } from './http';

export interface Mvrv {
  /** Ratio MVRV (capitalisation / capital réalisé). */
  mvrv: number;
  date: string;
  delayed: boolean;
}

export async function getMvrv(): Promise<Mvrv | null> {
  try {
    const r = await getJson<{ d?: string; mvrv?: string | number; delayed?: boolean }>('https://bitcoin-data.com/v1/mvrv/zscore', { timeoutMs: 15000, retries: 1 });
    const v = Number(r.mvrv);
    if (Number.isFinite(v) && v > 0) return { mvrv: v, date: r.d ?? '', delayed: r.delayed ?? true };
    return null;
  } catch {
    return null; // indisponible : la température s'en passe, aucune composante n'est inventée
  }
}
