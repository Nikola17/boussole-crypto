// État d'un autopilote : fonction pure de ses journaux quotidiens, rejoués dans l'ordre des jours.
// Écriture idempotente : un journal n'est réécrit que si son contenu change (hors date de modification et appareil),
// pour que deux appareils qui calculent le même jour ne se renvoient pas la synchronisation sans fin.

import type { PaperDayLog, PaperPortfolio } from '../../types';
import type { Position } from './types';

export interface AutoState {
  cashUsd: number;
  positions: Record<string, Position>;
  peakEquityUsd: number;
  minSincePeakUsd: number;
  /** `tag` et `tag|coinId` → dernier jour d'exécution. */
  lastFill: Record<string, string>;
}

export function autoState(portfolio: PaperPortfolio, logs: PaperDayLog[], closeOf?: (coinId: string, day: string) => number | null): AutoState {
  let cash = portfolio.startingUsd;
  const positions: Record<string, Position> = {};
  const lastFill: Record<string, string> = {};
  const lastPrice: Record<string, number> = {};
  let peak = portfolio.startingUsd;
  let trough = portfolio.startingUsd;
  for (const l of [...logs].filter((x) => x.portfolioId === portfolio.id).sort((a, b) => a.day.localeCompare(b.day))) {
    cash += l.depositUsd;
    for (const f of l.fills) {
      lastPrice[f.coinId] = f.marketUsd;
      if (f.tag) { lastFill[f.tag] = l.day; lastFill[`${f.tag}|${f.coinId}`] = l.day; }
      const p = positions[f.coinId];
      if (f.side === 'buy') {
        const amount = f.quantity * f.priceUsd + f.feeUsd;
        cash -= amount;
        positions[f.coinId] = {
          coinId: f.coinId, symbol: f.symbol, name: f.name,
          quantity: Math.round(((p?.quantity ?? 0) + f.quantity) * 1e8) / 1e8,
          costUsd: (p?.costUsd ?? 0) + amount,
          openedOn: p?.openedOn ?? l.day,
          ...(f.stop != null ? { stop: f.stop } : p?.stop != null ? { stop: p.stop } : {}),
          ...(f.target != null ? { target: f.target } : p?.target != null ? { target: p.target } : {}),
          ...(f.stopOnClose || p?.stopOnClose ? { stopOnClose: true } : {}),
        };
      } else {
        cash += f.quantity * f.priceUsd - f.feeUsd;
        if (!p) continue;
        const left = Math.round((p.quantity - f.quantity) * 1e8) / 1e8;
        if (left > 0) positions[f.coinId] = { ...p, quantity: left, costUsd: p.costUsd * (left / p.quantity) };
        else delete positions[f.coinId];
      }
    }
    if (closeOf) {
      let value = cash;
      for (const pos of Object.values(positions)) value += pos.quantity * (closeOf(pos.coinId, l.day) ?? lastPrice[pos.coinId] ?? 0);
      if (value >= peak) { peak = value; trough = value; } else trough = Math.min(trough, value);
    }
  }
  return { cashUsd: cash, positions, peakEquityUsd: peak, minSincePeakUsd: trough, lastFill };
}

const content = (l: PaperDayLog) => JSON.stringify({ ...l, updatedAt: undefined, by: undefined });

export function sameDayLog(a: PaperDayLog, b: PaperDayLog): boolean {
  return content(a) === content(b);
}

/** Journaux après fusion, et ceux qui ont réellement changé (à écrire et synchroniser). */
export function mergeDayLogs(existing: PaperDayLog[], incoming: PaperDayLog[]): { days: PaperDayLog[]; changed: PaperDayLog[] } {
  const byId = new Map(existing.map((l) => [l.id, l]));
  const changed: PaperDayLog[] = [];
  for (const l of incoming) {
    const old = byId.get(l.id);
    if (old && sameDayLog(old, l)) continue;
    byId.set(l.id, l);
    changed.push(l);
  }
  return { days: changed.length ? [...byId.values()] : existing, changed };
}

/** Dernier jour traité : le plus avancé du portefeuille et de ses journaux (une fusion ne fait jamais reculer). */
export function effectiveCursor(portfolio: PaperPortfolio, logs: PaperDayLog[]): string {
  let c = portfolio.cursorDay ?? '';
  for (const l of logs) if (l.portfolioId === portfolio.id && l.day > c) c = l.day;
  return c;
}
