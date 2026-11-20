// Risk Overlay (garde-fous portefeuille) : appliqué avant l'exécution des achats d'une stratégie active.
// Trois verrous complémentaires et déterministes :
//   1. Drawdown Scaling : divise la mise par 2 sous −8 % de baisse, par 4 sous −15 %.
//   2. Portfolio Heat Cap : plafonne la somme des risques (entrée → stop) de toutes les positions ouvertes.
//   3. Plafond de corrélation : réduit / bloque l'empilement d'altcoins très corrélés (> 0,85) au Bitcoin.

import type { Intent, RiskOverlayConfig, StrategyContext } from './types';

export interface RiskOverlayResult {
  intents: Intent[];
  skipped: { symbol: string; why: string }[];
}

function scaleBuyIntent(intent: Intent, factor: number): Intent {
  if (factor >= 0.999 || !intent.sizing) return intent;
  const sz = intent.sizing;
  if ('usd' in sz) return { ...intent, sizing: { usd: Math.round(sz.usd * factor * 100) / 100 } };
  if ('targetVolPct' in sz) return { ...intent, sizing: { ...sz, targetVolPct: sz.targetVolPct * factor, maxUsd: sz.maxUsd * factor } };
  return { ...intent, sizing: { riskUsd: sz.riskUsd * factor, maxUsd: sz.maxUsd * factor } };
}

/** Calcule le facteur de réduction lié au drawdown courant (1, 0.5 ou 0.25). */
export function drawdownScale(equityUsd: number, peakEquityUsd: number): number {
  if (!(peakEquityUsd > 0) || !(equityUsd > 0)) return 1;
  const ddPct = (equityUsd / peakEquityUsd - 1) * 100;
  if (ddPct <= -15) return 0.25;
  if (ddPct <= -8) return 0.5;
  return 1;
}

/** Risque cumulé actuel du portefeuille (% de l'équité), estimé via distance prix → stop des positions ouvertes. */
export function portfolioHeatPct(ctx: StrategyContext): number {
  const eq = ctx.portfolio.equityUsd;
  if (!(eq > 0)) return 0;
  let riskUsd = 0;
  for (const p of ctx.portfolio.positions) {
    const cs = ctx.candles(p.coinId);
    const price = cs.length ? cs[cs.length - 1].close : (p.entryPriceUsd ?? (p.quantity > 0 ? p.costUsd / p.quantity : 0));
    if (!(price > 0)) continue;
    const stop = p.stop != null && p.stop < price ? p.stop : price * 0.9; // 10 % par défaut si sans stop explicite
    riskUsd += p.quantity * Math.max(0, price - stop);
  }
  return (riskUsd / eq) * 100;
}

function estimatedRiskUsd(intent: Intent, ctx: StrategyContext): number {
  const sz = intent.sizing;
  if (!sz) return 0;
  if ('riskUsd' in sz) return Math.min(sz.riskUsd, sz.maxUsd);
  const cs = ctx.candles(intent.coinId);
  const price = intent.limitPrice ?? (cs.length ? cs[cs.length - 1].close : 0);
  const usd = 'usd' in sz ? sz.usd : Math.min(sz.maxUsd, sz.equityUsd * (sz.targetVolPct / Math.max(10, sz.assetVolAnnPct)));
  if (!(price > 0) || intent.stop == null || intent.stop >= price) return usd * 0.08;
  return usd * ((price - intent.stop) / price);
}

/** Filtre et redimensionne les ordres d'achat selon les règles de risque portefeuille ; les ventes passent toujours. */
export function applyRiskOverlay(intents: Intent[], ctx: StrategyContext, cfg?: RiskOverlayConfig): RiskOverlayResult {
  if (!cfg) return { intents, skipped: [] };
  const maxHeatPct = cfg.maxHeatPct ?? 5;
  const maxHighCorr = cfg.maxHighCorrPositions ?? 2;
  const ddFactor = cfg.drawdownScaling !== false ? drawdownScale(ctx.portfolio.equityUsd, ctx.portfolio.peakEquityUsd) : 1;
  const eq = ctx.portfolio.equityUsd;

  let curHeatPct = portfolioHeatPct(ctx);
  let highCorrCount = ctx.portfolio.positions.filter((p) => {
    const corr = ctx.metrics?.(p.coinId)?.corrBtc30d;
    return corr != null && corr > 0.85;
  }).length;

  const out: Intent[] = [];
  const skipped: { symbol: string; why: string }[] = [];

  for (const raw of intents) {
    if (raw.side === 'sell') { out.push(raw); continue; }
    let intent = scaleBuyIntent(raw, ddFactor);

    // 1. Plafond de corrélation au BTC
    const corr = ctx.metrics?.(intent.coinId)?.corrBtc30d;
    const isHighCorr = corr != null && corr > 0.85;
    if (isHighCorr) {
      if (highCorrCount >= maxHighCorr + 1) {
        skipped.push({ symbol: intent.symbol.toUpperCase(), why: `plafond de corrélation atteint (${highCorrCount} positions > 0,85 BTC)` });
        continue;
      }
      if (highCorrCount >= maxHighCorr) intent = scaleBuyIntent(intent, 0.5);
    }

    // 2. Plafond de risque cumulé (Portfolio Heat Cap)
    if (eq > 0 && maxHeatPct > 0) {
      const remainingPct = maxHeatPct - curHeatPct;
      if (remainingPct <= 0.1) {
        skipped.push({ symbol: intent.symbol.toUpperCase(), why: `risque portefeuille saturé (${curHeatPct.toFixed(1)} % / ${maxHeatPct} %)` });
        continue;
      }
      const reqPct = (estimatedRiskUsd(intent, ctx) / eq) * 100;
      if (reqPct > remainingPct && reqPct > 0) {
        intent = scaleBuyIntent(intent, remainingPct / reqPct);
      }
      curHeatPct += Math.min(reqPct, remainingPct);
    }

    if (isHighCorr) highCorrCount++;
    out.push(intent);
  }
  return { intents: out, skipped };
}
