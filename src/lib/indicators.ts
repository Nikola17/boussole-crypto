// Indicateurs techniques classiques. Toutes les séries renvoyées ont la même longueur
// que l'entrée ; les premières valeurs non calculables valent NaN.

export interface Candle {
  time: number; // timestamp en secondes (UTC, ouverture de la bougie)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Volume (en dollars) des achats « au marché » : la pression acheteuse (Binance, champ 10 d'une bougie). */
  takerBuyQuote?: number;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** RSI de Wilder. */
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  hist: number[];
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => (Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN));
  const firstValid = line.findIndex((v) => Number.isFinite(v));
  const signal = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const sub = ema(line.slice(firstValid), signalPeriod);
    for (let i = 0; i < sub.length; i++) signal[firstValid + i] = sub[i];
  }
  const hist = line.map((v, i) => (Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN));
  return { macd: line, signal, hist };
}

export interface BollingerResult {
  mid: number[];
  upper: number[];
  lower: number[];
  /** Largeur relative (upper-lower)/mid */
  width: number[];
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const mid = sma(values, period);
  const upper = new Array<number>(values.length).fill(NaN);
  const lower = new Array<number>(values.length).fill(NaN);
  const width = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
    width[i] = mid[i] !== 0 ? (upper[i] - lower[i]) / mid[i] : NaN;
  }
  return { mid, upper, lower, width };
}

/** ATR de Wilder. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function highest(values: number[], period: number, endIndex = values.length - 1): number {
  let m = -Infinity;
  for (let i = Math.max(0, endIndex - period + 1); i <= endIndex; i++) m = Math.max(m, values[i]);
  return m;
}

export function lowest(values: number[], period: number, endIndex = values.length - 1): number {
  let m = Infinity;
  for (let i = Math.max(0, endIndex - period + 1); i <= endIndex; i++) m = Math.min(m, values[i]);
  return m;
}

export function last<T>(arr: T[], offset = 0): T | undefined {
  return arr[arr.length - 1 - offset];
}

/** Variation en % entre la valeur il y a n périodes et la dernière. */
export function changePct(values: number[], n: number): number {
  if (values.length <= n) return NaN;
  const a = values[values.length - 1 - n];
  const b = values[values.length - 1];
  return a ? ((b - a) / a) * 100 : NaN;
}

/** Pente relative (en %) d'une série sur n périodes. */
export function slopePct(values: number[], n: number): number {
  const lastV = values[values.length - 1];
  const prevV = values[values.length - 1 - n];
  if (!Number.isFinite(lastV) || !Number.isFinite(prevV) || prevV === 0) return NaN;
  return ((lastV - prevV) / prevV) * 100;
}

/** Index (depuis la fin) du dernier croisement de a au-dessus (1) ou en dessous (-1) de b. */
export function lastCross(a: number[], b: number[], lookback = 30): { dir: 1 | -1; barsAgo: number } | null {
  const n = a.length;
  for (let k = 0; k < Math.min(lookback, n - 1); k++) {
    const i = n - 1 - k;
    const prev = a[i - 1] - b[i - 1];
    const cur = a[i] - b[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    if (prev <= 0 && cur > 0) return { dir: 1, barsAgo: k };
    if (prev >= 0 && cur < 0) return { dir: -1, barsAgo: k };
  }
  return null;
}

export interface Level {
  price: number;
  touches: number;
  kind: 'support' | 'resistance';
}

/**
 * Supports / résistances : points pivots (plus haut/bas local sur ±w bougies),
 * regroupés quand ils sont à moins de `tolerancePct` les uns des autres.
 */
export function supportResistance(candles: Candle[], w = 5, tolerancePct = 2.5, maxBars = 365): Level[] {
  const cs = candles.slice(-maxBars);
  const pivots: { price: number; type: 'high' | 'low' }[] = [];
  for (let i = w; i < cs.length - w; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (cs[j].high > cs[i].high) isHigh = false;
      if (cs[j].low < cs[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ price: cs[i].high, type: 'high' });
    if (isLow) pivots.push({ price: cs[i].low, type: 'low' });
  }
  const clusters: { sum: number; n: number }[] = [];
  for (const p of pivots.sort((a, b) => a.price - b.price)) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p.price - c.sum / c.n) / (c.sum / c.n) * 100 <= tolerancePct) {
      c.sum += p.price;
      c.n += 1;
    } else clusters.push({ sum: p.price, n: 1 });
  }
  const lastClose = cs[cs.length - 1]?.close ?? 0;
  return clusters
    .map((c) => {
      const price = c.sum / c.n;
      return { price, touches: c.n, kind: price <= lastClose ? 'support' : 'resistance' } as Level;
    })
    .sort((a, b) => a.price - b.price);
}

/**
 * Volume de la dernière bougie CLOSE rapporté à la moyenne des `period` précédentes.
 * La bougie du jour est encore incomplète : la comparer à des journées entières donnerait presque toujours un ratio faible,
 * et « cassure avec volume » ne se déclencherait qu'en fin de journée.
 */
export function volumeRatio(candles: Candle[], period = 20, opts: { closedOnly?: boolean } = {}): number {
  // En mode « clos », toutes les bougies reçues sont terminées : la dernière est la plus récente à comparer.
  const closed = opts.closedOnly ? candles : candles.slice(0, -1);
  if (closed.length < period + 1) return NaN;
  const vols = closed.map((c) => c.volume);
  const avg = sma(vols.slice(0, -1), period);
  const a = avg[avg.length - 1];
  return a > 0 ? vols[vols.length - 1] / a : NaN;
}

/**
 * Bougies journalières closes seulement : retire la dernière si sa journée (UTC) n'est pas finie à `nowMs`.
 * Les signaux calculés dessus ne changent qu'une fois par jour, et ce qui est affiché est ce qui est mesurable.
 */
export function closedCandles(candles: Candle[], nowMs: number): Candle[] {
  const last = candles[candles.length - 1];
  return last && last.time + 86400 > nowMs / 1000 ? candles.slice(0, -1) : candles;
}

/** Agrège des bougies journalières en bougies hebdomadaires (semaine ISO, lundi). */
export function toWeekly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curWeek = -1;
  for (const c of daily) {
    const d = new Date(c.time * 1000);
    const day = (d.getUTCDay() + 6) % 7; // 0 = lundi
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1000;
    if (monday !== curWeek) {
      if (cur) out.push(cur);
      cur = { time: monday, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      curWeek = monday;
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Drawdown maximal (en %, négatif) d'une série de valeurs. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.min(mdd, (v - peak) / peak);
  }
  return mdd * 100;
}

/** ADX de Wilder (force de la tendance, 0-100 : < 20 = range, >= 25 = tendance marquée). */
export function adx(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < period * 2 + 1 || period <= 0) return out;
  const tr = new Array<number>(n).fill(0);
  const plusDm = new Array<number>(n).fill(0);
  const minusDm = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc));
  }
  let sTr = 0, sPlus = 0, sMinus = 0;
  for (let i = 1; i <= period; i++) { sTr += tr[i]; sPlus += plusDm[i]; sMinus += minusDm[i]; }
  const dx = new Array<number>(n).fill(NaN);
  const calcDx = (t: number, p: number, m: number) => {
    if (t <= 0) return 0;
    const pdi = (p / t) * 100;
    const mdi = (m / t) * 100;
    const sum = pdi + mdi;
    return sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0;
  };
  dx[period] = calcDx(sTr, sPlus, sMinus);
  for (let i = period + 1; i < n; i++) {
    sTr = sTr - sTr / period + tr[i];
    sPlus = sPlus - sPlus / period + plusDm[i];
    sMinus = sMinus - sMinus / period + minusDm[i];
    dx[i] = calcDx(sTr, sPlus, sMinus);
  }
  let adxVal = 0;
  for (let i = period; i < period * 2; i++) adxVal += dx[i];
  adxVal /= period;
  out[period * 2 - 1] = adxVal;
  for (let i = period * 2; i < n; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
    out[i] = adxVal;
  }
  return out;
}

/** Volatilité annualisée EWMA (en %, 365 jours pour la crypto). */
export function ewmaVolatility(closes: number[], lambda = 0.94): number {
  if (closes.length < 10) return NaN;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 5) return NaN;
  const seedN = Math.min(20, rets.length);
  let variance = rets.slice(0, seedN).reduce((s, r) => s + r * r, 0) / seedN;
  for (let i = seedN; i < rets.length; i++) {
    variance = lambda * variance + (1 - lambda) * rets[i] * rets[i];
  }
  return Math.sqrt(variance * 365) * 100;
}

/** Corrélation de Pearson des rendements simples des `period` dernières périodes entre deux séries alignées à la fin. */
export function rollingCorrelation(a: number[], b: number[], period = 30): number {
  const n = Math.min(a.length, b.length);
  if (n < period + 1) return NaN;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let k = period; k >= 1; k--) {
    const ia = a.length - k;
    const ib = b.length - k;
    if (a[ia - 1] > 0 && b[ib - 1] > 0) {
      ra.push(a[ia] / a[ia - 1] - 1);
      rb.push(b[ib] / b[ib - 1] - 1);
    }
  }
  if (ra.length < Math.max(10, Math.floor(period * 0.7))) return NaN;
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) {
    const xa = ra[i] - ma;
    const xb = rb[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? Math.max(-1, Math.min(1, num / den)) : NaN;
}

/** Z-score de la dernière valeur par rapport aux `period` dernières valeurs (incluses). */
export function zScore(values: number[], period = 30): number {
  if (values.length < period || period < 2) return NaN;
  const slice = values.slice(-period);
  if (slice.some((v) => !Number.isFinite(v))) return NaN;
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return sd > 1e-12 ? (slice[slice.length - 1] - mean) / sd : 0;
}
