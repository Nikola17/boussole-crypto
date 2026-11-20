// Règles d'exécution du Labo, identiques au banc d'essai, dans le papier manuel et dans l'autopilote.
// Achat : le montant inclut les frais ; prix obtenu = marché × (1 + écart). Vente : prix obtenu = marché × (1 − écart),
// frais sur le produit. Ordres limites (maker) : écart nul et frais maker.
// Ordres en attente lus bougie par bougie : trou de cotation à l'ouverture, stop prioritaire, puis paliers TP partiels
// (avec passage optionnel du stop à l'équilibre), puis mise à jour du trailing stop en fin de bougie (anti-lookahead).

import type { Candle } from '../indicators';
import type { Book, CostModel, Fill, Intent, Position, TakeProfitLeg } from './types';

const q8 = (x: number) => Math.round(x * 1e8) / 1e8;

export interface ApplyOptions { at: string; day: string; minOrderUsd: number; /** Exécution en ordre limite maker (0 spread, frais maker). */ asLimit?: boolean }

/** Slippage/écart dynamique optionnel en fonction de la volatilité (ATR %) et de la liquidité 30 j (USD). */
export function effectiveSpreadPct(baseSpreadPct: number, atrPct?: number | null, volume30dUsd?: number | null): number {
  let s = Math.max(0, baseSpreadPct);
  if (atrPct != null && Number.isFinite(atrPct) && atrPct > 4) s += 0.05 * (atrPct - 4);
  if (volume30dUsd != null && Number.isFinite(volume30dUsd) && volume30dUsd > 0 && volume30dUsd < 10_000_000) {
    s += 0.15 * Math.log10(10_000_000 / volume30dUsd);
  }
  return Math.min(2.5, Math.max(baseSpreadPct, Math.round(s * 10000) / 10000));
}

/** Exécute un ordre au prix du marché `marketUsd` (ou au prix limite si `opts.asLimit`) ; renvoie le nouveau portefeuille. */
export function applyIntent(book: Book, intent: Intent, marketUsd: number, costs: CostModel, opts: ApplyOptions): { book: Book; fill: Fill | null; skip: string | null } {
  const none = (skip: string) => ({ book, fill: null, skip });
  if (!(marketUsd > 0) || !Number.isFinite(marketUsd)) return none('prix inconnu');
  if (!opts.asLimit) {
    if (intent.skipAbove != null && marketUsd > intent.skipAbove) return none('le prix a trop bougé depuis la clôture');
    if (intent.skipBelow != null && marketUsd < intent.skipBelow) return none('le prix a trop bougé depuis la clôture');
  }
  const isLimit = !!opts.asLimit;
  const s = isLimit ? 0 : costs.spreadPct / 100;
  const f = (isLimit ? (costs.makerFeePct ?? costs.feePct) : costs.feePct) / 100;
  const base = { coinId: intent.coinId, symbol: intent.symbol, name: intent.name, marketUsd, at: opts.at, reason: intent.reason, ...(intent.tag ? { tag: intent.tag } : {}) };

  if (intent.side === 'buy') {
    const price = marketUsd * (1 + s);
    let amount: number;
    const sz = intent.sizing ?? { usd: 0 };
    if ('usd' in sz) amount = sz.usd;
    else if ('targetVolPct' in sz) {
      const vol = Math.max(10, sz.assetVolAnnPct);
      const raw = sz.equityUsd * (sz.targetVolPct / vol);
      amount = Math.min(raw, sz.maxUsd);
    } else {
      if (intent.stop == null || price <= intent.stop) return none('stop au-dessus du prix d’achat');
      // Quantité reçue = risque ÷ (prix obtenu − stop) ; le montant inclut les frais prélevés dessus.
      amount = Math.min(((sz.riskUsd / (price - intent.stop)) * price) / (1 - f), sz.maxUsd);
    }
    amount = Math.min(amount, book.cashUsd);
    if (!(amount >= opts.minOrderUsd)) return none('montant trop petit');
    const fee = amount * f;
    const quantity = q8((amount - fee) / price);
    if (!(quantity > 0)) return none('montant trop petit');
    const prev = book.positions[intent.coinId];
    const riskPerUnit = intent.stop != null && price > intent.stop ? price - intent.stop : prev?.initialRiskPerUnit;
    const target = !intent.tpLegs?.length && intent.stop != null && intent.targetR != null ? price + intent.targetR * (price - intent.stop) : undefined;
    const tpLegs: TakeProfitLeg[] | undefined = intent.tpLegs?.length ? intent.tpLegs.map((l) => ({ ...l, done: false })) : prev?.tpLegs;
    const trailing = intent.trailing ? { ...intent.trailing } : prev?.trailing;
    const totalQty = q8((prev?.quantity ?? 0) + quantity);
    const totalCost = (prev?.costUsd ?? 0) + amount;
    const entryPriceUsd = prev?.entryPriceUsd != null ? totalCost / totalQty : price;
    const pos: Position = {
      coinId: intent.coinId, symbol: intent.symbol, name: intent.name,
      quantity: totalQty,
      initialQuantity: prev ? (prev.initialQuantity ?? prev.quantity) + quantity : quantity,
      costUsd: totalCost,
      openedOn: prev?.openedOn ?? opts.day,
      entryPriceUsd,
      ...(riskPerUnit != null && riskPerUnit > 0 ? { initialRiskPerUnit: riskPerUnit } : {}),
      ...(intent.stop != null ? { stop: intent.stop } : prev?.stop != null ? { stop: prev.stop } : {}),
      ...(target != null ? { target } : prev?.target != null ? { target: prev.target } : {}),
      ...(intent.stopOnClose ? { stopOnClose: true } : prev?.stopOnClose ? { stopOnClose: true } : {}),
      ...(tpLegs?.length ? { tpLegs } : {}),
      ...(trailing ? { trailing } : {}),
      highWaterMark: Math.max(prev?.highWaterMark ?? 0, price),
    };
    const fill: Fill = {
      ...base, side: 'buy', kind: isLimit ? 'limit' : 'market', quantity, priceUsd: price, feeUsd: fee,
      ...(intent.stop != null ? { stop: intent.stop } : {}),
      ...(target != null ? { target } : {}),
      ...(intent.stopOnClose ? { stopOnClose: true } : {}),
      ...(tpLegs?.length ? { tpLegs } : {}),
      ...(trailing ? { trailing } : {}),
      ...(tpLegs?.length || trailing ? { entryPriceUsd, ...(riskPerUnit != null ? { initialRiskPerUnit: riskPerUnit } : {}) } : {}),
    };
    return { book: { cashUsd: book.cashUsd - amount, positions: { ...book.positions, [intent.coinId]: pos } }, fill, skip: null };
  }

  const pos = book.positions[intent.coinId];
  if (!pos || !(pos.quantity > 0)) return none('aucune position à vendre');
  const fraction = Math.min(1, Math.max(0, intent.fraction ?? 1));
  if (!(fraction > 0)) return none('aucune quantité à vendre');
  return sellOut(book, pos, fraction, marketUsd, costs, { ...base, kind: isLimit ? 'limit' : 'market' }, isLimit);
}

function sellOut(
  book: Book, pos: Position, fraction: number, marketUsd: number, costs: CostModel,
  base: Omit<Fill, 'side' | 'quantity' | 'priceUsd' | 'feeUsd'>, asMaker = false,
): { book: Book; fill: Fill; skip: null } {
  const quantity = fraction >= 1 ? pos.quantity : Math.min(pos.quantity, q8(pos.quantity * fraction));
  const price = marketUsd * (1 - (asMaker ? 0 : costs.spreadPct / 100));
  const proceeds = quantity * price;
  const fee = proceeds * ((asMaker ? (costs.makerFeePct ?? costs.feePct) : costs.feePct) / 100);
  const positions = { ...book.positions };
  const left = q8(pos.quantity - quantity);
  if (left > 0) positions[pos.coinId] = { ...pos, quantity: left, costUsd: pos.costUsd * (left / pos.quantity) };
  else delete positions[pos.coinId];
  const fill: Fill = { ...base, side: 'sell', quantity, priceUsd: price, feeUsd: fee };
  return { book: { cashUsd: book.cashUsd + proceeds - fee, positions }, fill, skip: null };
}

/**
 * Prix du marché auquel un ordre en attente s'exécute dans cette bougie, ou null.
 * Stop de vente : ouverture si elle est déjà sous le niveau (trou de cotation), sinon le niveau si le plus bas le touche.
 * Objectif (vente limite) et achat limite : symétriques.
 */
export function pendingHit(kind: 'stop' | 'target' | 'limitBuy', level: number, bar: Candle, opts: { gapRule?: boolean } = {}): number | null {
  const gap = opts.gapRule !== false;
  if (kind === 'stop') return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
  if (kind === 'target') return gap && bar.open >= level ? bar.open : bar.high >= level ? level : null;
  return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
}

/** Calcule le niveau du stop suiveur depuis le plus haut connu AVANT la bougie courante (anti-lookahead). */
function trailingStopLevel(pos: Position): number | null {
  const tr = pos.trailing;
  if (!tr) return null;
  const entry = pos.entryPriceUsd ?? (pos.quantity > 0 ? pos.costUsd / pos.quantity : 0);
  const hwm = pos.highWaterMark ?? entry;
  if (!(hwm > 0)) return null;
  if (tr.activateAfterR != null && tr.activateAfterR > 0) {
    const risk = pos.initialRiskPerUnit ?? (pos.stop != null && entry > pos.stop ? entry - pos.stop : 0);
    if (!(risk > 0) || hwm < entry + tr.activateAfterR * risk) return null;
  }
  if (tr.mode === 'pct') return hwm * (1 - tr.value / 100);
  if (tr.atr != null && tr.atr > 0) return hwm - tr.value * tr.atr;
  return null;
}

/**
 * Stop, trailing stop et objectifs (uniques ou partiels multi-paliers) d'une position contre une bougie.
 * Priorité conservatrice : le stop gagne toujours sur l'objectif si les deux sont touchés dans la même bougie.
 * Le plus haut du trailing stop est mis à jour en FIN de bougie (jamais avant la vérification du stop).
 */
export function settleBar(
  book: Book, coinId: string, bar: Candle, costs: CostModel, at: string, opts: { gapRule?: boolean } = {},
): { book: Book; fill: Fill | null; fills: Fill[] } {
  const initialPos = book.positions[coinId];
  if (!initialPos) return { book, fill: null, fills: [] };
  let curBook = book;
  let pos: Position = initialPos;
  const fills: Fill[] = [];
  const base = { coinId, symbol: pos.symbol, name: pos.name, at };

  // 1. Stop fixe ou trailing stop (prioritaire)
  const trail = trailingStopLevel(pos);
  const activeStop = trail != null
    ? (pos.stop != null && !pos.stopOnClose ? Math.max(pos.stop, trail) : trail)
    : (pos.stop != null && !pos.stopOnClose ? pos.stop : null);
  if (activeStop != null) {
    const stopAt = pendingHit('stop', activeStop, bar, opts);
    if (stopAt != null) {
      const isTrailing = trail != null && (pos.stop == null || trail >= pos.stop - 1e-9);
      const r = sellOut(curBook, pos, 1, stopAt, costs, { ...base, marketUsd: stopAt, kind: 'stop', reason: isTrailing ? 'stop suiveur touché' : 'stop touché', tag: isTrailing ? 'trailing-stop' : 'stop' });
      return { book: r.book, fill: r.fill, fills: [r.fill] };
    }
  }

  // 2. Paliers de prise de profit partiels (`tpLegs`)
  if (pos.tpLegs?.length) {
    const entry = pos.entryPriceUsd ?? (pos.quantity > 0 ? pos.costUsd / pos.quantity : 0);
    const risk = pos.initialRiskPerUnit ?? 0;
    if (entry > 0 && risk > 0) {
      const legs = pos.tpLegs.map((l) => ({ ...l }));
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (leg.done) continue;
        const level = entry + leg.rMultiple * risk;
        const hitAt = pendingHit('target', level, bar, opts);
        if (hitAt == null) continue;
        const livePos = curBook.positions[coinId];
        if (!livePos) break;
        const initQty = livePos.initialQuantity ?? livePos.quantity;
        const targetQty = Math.min(livePos.quantity, q8(initQty * leg.fraction));
        const frac = livePos.quantity > 0 ? Math.min(1, targetQty / livePos.quantity) : 0;
        if (!(frac > 0)) continue;
        const r = sellOut(curBook, livePos, frac, hitAt, costs, {
          ...base, marketUsd: hitAt, kind: 'target',
          reason: `palier TP${i + 1} (${String(leg.rMultiple).replace('.', ',')} R)${leg.moveStopToBe ? ' · stop à l’équilibre' : ''}`,
          tag: `tp:${i + 1}`,
        }, true);
        curBook = r.book;
        fills.push(r.fill);
        legs[i] = { ...leg, done: true };
        const rem = curBook.positions[coinId];
        if (rem) {
          const beStop = leg.moveStopToBe ? entry * (1 + (2 * costs.feePct) / 100) : undefined;
          const nextStop = beStop != null ? Math.max(rem.stop ?? 0, beStop) : rem.stop;
          curBook = {
            ...curBook,
            positions: {
              ...curBook.positions,
              [coinId]: { ...rem, tpLegs: legs, ...(nextStop != null ? { stop: nextStop } : {}), ...(leg.moveStopToBe ? { stopOnClose: false } : {}) },
            },
          };
          pos = curBook.positions[coinId];
        } else {
          return { book: curBook, fill: fills[0] ?? null, fills };
        }
      }
    }
  } else if (pos.target != null) {
    // 3. Objectif unique classique
    const targetAt = pendingHit('target', pos.target, bar, opts);
    if (targetAt != null) {
      const r = sellOut(curBook, pos, 1, targetAt, costs, { ...base, marketUsd: targetAt, kind: 'target', reason: 'objectif atteint', tag: 'target' });
      return { book: r.book, fill: r.fill, fills: [r.fill] };
    }
  }

  // 4. Mise à jour du plus haut pour le trailing stop (en fin de bougie pour éviter tout biais intra-bougie)
  const rem = curBook.positions[coinId];
  if (rem && rem.trailing && bar.high > (rem.highWaterMark ?? 0)) {
    const nextPos: Position = { ...rem, highWaterMark: bar.high };
    const nextTrail = trailingStopLevel(nextPos);
    const updatedStop = nextTrail != null ? Math.max(nextPos.stop ?? 0, nextTrail) : nextPos.stop;
    curBook = {
      ...curBook,
      positions: {
        ...curBook.positions,
        [coinId]: { ...nextPos, ...(updatedStop != null ? { stop: updatedStop } : {}), ...(nextTrail != null ? { stopOnClose: false } : {}) },
      },
    };
  }

  return { book: curBook, fill: fills[0] ?? null, fills };
}

/** Solde une position au prix donné (paire retirée de la cotation : dernière clôture connue). */
export function delist(book: Book, coinId: string, lastClose: number, costs: CostModel, at: string): { book: Book; fill: Fill | null } {
  const pos = book.positions[coinId];
  if (!pos) return { book, fill: null };
  const r = sellOut(book, pos, 1, lastClose, costs, { coinId, symbol: pos.symbol, name: pos.name, at, marketUsd: lastClose, kind: 'delist', reason: 'paire retirée de la cotation : soldée à la dernière clôture', tag: 'delist' });
  return { book: r.book, fill: r.fill };
}
