// Radar dérivés & réseau Bitcoin : open interest, funding, ratio long/short (Binance, publics)
// et activité mempool (mempool.space). Toutes les lectures échouent doucement (null, jamais 0).

import { getJson } from './http';

const FAPI = 'https://fapi.binance.com';
const MEMPOOL = 'https://mempool.space';

export interface DerivsSnapshot {
  /** Open interest BTCUSDT, en BTC. */
  oiBtc: number | null;
  /** Dernier taux de funding (décimal, par 8 h). */
  fundingLast: number | null;
  /** Moyenne des 3 derniers taux 8 h. */
  fundingAvg8h: number | null;
  /** Funding annualisé en % (avg8h × 3 × 365 × 100). */
  fundingAprPct: number | null;
  /** Ratio long/short des comptes Binance (1d). */
  longShortRatio: number | null;
  longPct: number | null;
  mempoolTx: number | null;
  mempoolVsizeMb: number | null;
  fastestFeeSatVb: number | null;
}

export async function getBtcOpenInterest(): Promise<number | null> {
  try {
    const r = await getJson<{ openInterest: string }>(`${FAPI}/fapi/v1/openInterest?symbol=BTCUSDT`, { timeoutMs: 10000, retries: 0 });
    const v = Number(r.openInterest);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export async function getBtcFunding(): Promise<{ last: number | null; avg8h: number | null; aprPct: number | null }> {
  try {
    const r = await getJson<{ fundingRate: string }[]>(`${FAPI}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=3`, { timeoutMs: 10000, retries: 0 });
    if (!Array.isArray(r) || !r.length) return { last: null, avg8h: null, aprPct: null };
    const rates = r.map((x) => Number(x.fundingRate)).filter(Number.isFinite);
    const last = rates[0] ?? null;
    const avg = rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : null;
    return { last, avg8h: avg, aprPct: avg != null ? avg * 3 * 365 * 100 : null };
  } catch {
    return { last: null, avg8h: null, aprPct: null };
  }
}

export async function getBtcLongShort(): Promise<{ ratio: number | null; longPct: number | null }> {
  try {
    const r = await getJson<{ longShortRatio: string; longAccount: string }[]>(
      `${FAPI}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=1`,
      { timeoutMs: 10000, retries: 0 },
    );
    const first = Array.isArray(r) ? r[0] : null;
    if (!first) return { ratio: null, longPct: null };
    return { ratio: Number(first.longShortRatio) || null, longPct: (Number(first.longAccount) || 0) * 100 };
  } catch {
    return { ratio: null, longPct: null };
  }
}

export async function getMempoolActivity(): Promise<{ tx: number | null; vsizeMb: number | null; fastestFee: number | null }> {
  try {
    const [mp, fees] = await Promise.all([
      getJson<{ count: number; vsize: number }>(`${MEMPOOL}/api/mempool`, { timeoutMs: 10000, retries: 0 }),
      getJson<{ fastestFee: number }>(`${MEMPOOL}/api/v1/fees/recommended`, { timeoutMs: 10000, retries: 0 }),
    ]);
    return {
      tx: Number.isFinite(mp.count) ? mp.count : null,
      vsizeMb: Number.isFinite(mp.vsize) ? mp.vsize / 1e6 : null,
      fastestFee: Number.isFinite(fees.fastestFee) ? fees.fastestFee : null,
    };
  } catch {
    return { tx: null, vsizeMb: null, fastestFee: null };
  }
}

export async function getDerivsSnapshot(): Promise<DerivsSnapshot> {
  const [oi, funding, ls, mem] = await Promise.all([getBtcOpenInterest(), getBtcFunding(), getBtcLongShort(), getMempoolActivity()]);
  return {
    oiBtc: oi,
    fundingLast: funding.last,
    fundingAvg8h: funding.avg8h,
    fundingAprPct: funding.aprPct,
    longShortRatio: ls.ratio,
    longPct: ls.longPct,
    mempoolTx: mem.tx,
    mempoolVsizeMb: mem.vsizeMb,
    fastestFeeSatVb: mem.fastestFee,
  };
}
