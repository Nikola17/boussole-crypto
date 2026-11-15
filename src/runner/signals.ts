// Alertes de signal : une fois par jour, le serveur recalcule les signaux v2 (bougies closes) des cryptos suivies
// et prévient quand un état de risque commence ou finit (« Alléger », « Prendre des profits ») ou qu'un setup validé
// apparaît. Une seule alerte par épisode ; chaque message porte la fiabilité mesurée du signal.

import { reliabilityOf } from '../lib/lab/reliability';
import { analyze } from '../lib/signals';
import type { Candle } from '../lib/indicators';

/** États et setups suivis : seulement ce que le banc d'essai valide, et pas « Accumuler » (affiché 4 jours sur 10). */
export const TRACKED_LABEL: Record<string, string> = {
  'inv:Alléger': 'passe à « Alléger »',
  'inv:Prendre des profits': 'passe à « Prendre des profits »',
};

export function signalKeysOf(a: { investor: string; setups: string[] }): string[] {
  const keys: string[] = [];
  const inv = `inv:${a.investor}`;
  if (TRACKED_LABEL[inv]) keys.push(inv);
  for (const s of a.setups) if (reliabilityOf(`setup:${s}`)?.verdict === 'validé') keys.push(`setup:${s}`);
  return keys;
}

export interface SignalSources {
  daily: (coinId: string) => Promise<Candle[]>;
  temperatureAt: (day: string) => number | null;
  universe: () => Promise<{ coinId: string; symbol: string }[]>;
}

/** Clés de signal du jour : cryptos suivies + les `top` premières de l'univers, sur bougies closes (signaux v2). */
export async function computeSignals(coins: { coinId: string; symbol: string }[], src: SignalSources, top = 20): Promise<Record<string, { symbol: string; keys: string[] }>> {
  const all = new Map(coins.map((c) => [c.coinId, c.symbol]));
  const uni = await src.universe().catch(() => []);
  for (const u of uni.slice(0, top)) if (!all.has(u.coinId)) all.set(u.coinId, u.symbol);
  const out: Record<string, { symbol: string; keys: string[] }> = {};
  for (const [coinId, symbol] of all) {
    const candles = await src.daily(coinId).catch(() => [] as Candle[]);
    const last = candles[candles.length - 1];
    if (!last) continue;
    const day = new Date(last.time * 1000).toISOString().slice(0, 10);
    const a = analyze(candles, { temperature: src.temperatureAt(day) ?? undefined, isBitcoin: coinId === 'bitcoin' }, { closedOnly: true });
    if (!a) continue;
    out[coinId] = { symbol, keys: signalKeysOf({ investor: a.investor.label, setups: a.setups.map((s) => s.key) }) };
  }
  return out;
}

export interface SignalState { active: Record<string, string[]>; starts: Record<string, string> }
export interface SignalEvent { key: string; coinId: string; symbol: string; signal: string; kind: 'enter' | 'exit'; episodeStart: string }

/** Compare l'état du jour à celui de la veille : entrées (et sorties des états de risque) avec leur clé d'épisode. */
export function advanceSignals(prev: SignalState, today: Record<string, { symbol: string; keys: string[] }>, day: string): { state: SignalState; events: SignalEvent[] } {
  const events: SignalEvent[] = [];
  const active: Record<string, string[]> = {};
  const starts = { ...prev.starts };
  for (const [coinId, { symbol, keys }] of Object.entries(today)) {
    active[coinId] = keys;
    const before = new Set(prev.active[coinId] ?? []);
    for (const k of keys) {
      if (before.has(k)) continue;
      starts[`${coinId}|${k}`] = day;
      events.push({ key: `sig:${coinId}:${k}:${day}`, coinId, symbol, signal: k, kind: 'enter', episodeStart: day });
    }
    for (const k of before) {
      if (keys.includes(k)) continue;
      const start = starts[`${coinId}|${k}`] ?? day;
      delete starts[`${coinId}|${k}`];
      if (k.startsWith('inv:')) events.push({ key: `sig:${coinId}:${k}:${start}:fin`, coinId, symbol, signal: k, kind: 'exit', episodeStart: start });
    }
  }
  return { state: { active, starts }, events };
}

export function signalMessage(e: SignalEvent, phrase: string): string {
  const what = e.signal.startsWith('setup:') ? `setup « ${e.signal === 'setup:breakout' ? 'Cassure avec volume' : e.signal.slice(6)} »` : (TRACKED_LABEL[e.signal] ?? e.signal);
  const head = e.kind === 'enter'
    ? `Signal ${e.symbol.toUpperCase()} : ${what}`
    : `Signal ${e.symbol.toUpperCase()} : fin de « ${e.signal.slice(4)} » (depuis le ${e.episodeStart.slice(8, 10)}/${e.episodeStart.slice(5, 7)})`;
  return `${head}\nFiabilité : ${phrase}`;
}
