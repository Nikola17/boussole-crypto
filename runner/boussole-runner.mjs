// src/runner/main.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// src/lib/sync/github.ts
var CONFLICT = "conflict";
function api(url, token, init) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.trim()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers ?? {}
    }
  });
}
function repoUrl(repo, path) {
  const clean2 = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean2)) throw new Error("D\xE9p\xF4t mal form\xE9 : attends \xAB utilisateur/d\xE9p\xF4t \xBB (ex : Nikola17/boussole-sync).");
  return `https://api.github.com/repos/${clean2}/contents/${path}`;
}
function bytesToB64(buf) {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
async function b64ToString(b64) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function fetchRemote(repo, path, token) {
  const res = await api(repoUrl(repo, path), token);
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Jeton GitHub refus\xE9 (v\xE9rifie sa validit\xE9 et son acc\xE8s au d\xE9p\xF4t).");
    if (res.status === 403) throw new Error(`Acc\xE8s refus\xE9 par GitHub${msg.message ? ` : ${msg.message}` : ""} (le jeton doit pouvoir lire le d\xE9p\xF4t de synchronisation).`);
    throw new Error(`Lecture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ""}).`);
  }
  const j = await res.json();
  if (typeof j.content !== "string") throw new Error("Le fichier de synchronisation distant est illisible (contenu vide ou trop gros pour l\u2019API).");
  return { sha: j.sha, content: await b64ToString(j.content) };
}
async function pushRemote(repo, path, token, content, knownSha) {
  const body = { message: "Boussole : synchronisation", content: bytesToB64(new TextEncoder().encode(content)) };
  if (knownSha) body.sha = knownSha;
  const res = await api(repoUrl(repo, path), token, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return;
  const msg = await res.json().catch(() => ({}));
  if (res.status === 409 || res.status === 422) throw new Error(CONFLICT);
  if (res.status === 401) throw new Error("Jeton GitHub refus\xE9 (v\xE9rifie sa validit\xE9 et son acc\xE8s au d\xE9p\xF4t).");
  if (res.status === 403) throw new Error(`\xC9criture refus\xE9e par GitHub${msg.message ? ` : ${msg.message}` : ""} (le jeton doit avoir \xAB Contents : Read and write \xBB sur ce d\xE9p\xF4t).`);
  throw new Error(`\xC9criture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ""}).`);
}

// src/runner/config.ts
var PATH_DEFAULT = "boussole-sync.enc";
var str = (v) => typeof v === "string" ? v.trim() : "";
function validateConfig(raw, opts = {}) {
  const problems = [];
  if (typeof raw !== "object" || raw === null) return { config: null, problems: ["Configuration illisible : attends un objet JSON."] };
  const r = raw;
  const syncRepo = str(r.syncRepo);
  if (!syncRepo) problems.push('syncRepo manquant (ex : "Nikola17/boussole-sync").');
  else if (!/^[\w.-]+\/[\w.-]+$/.test(syncRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""))) problems.push("syncRepo mal form\xE9 : attends \xAB utilisateur/d\xE9p\xF4t \xBB.");
  const timeZone = str(r.timeZone) || "Europe/Paris";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone });
  } catch {
    problems.push(`timeZone inconnu : \xAB ${timeZone} \xBB.`);
  }
  const currency = str(r.currency).toUpperCase() === "USD" ? "USD" : "EUR";
  const briefHourRaw = r.briefHour;
  let briefHour = 8;
  if (briefHourRaw !== void 0) {
    briefHour = typeof briefHourRaw === "number" && Number.isInteger(briefHourRaw) && briefHourRaw >= 0 && briefHourRaw <= 23 ? briefHourRaw : -1;
    if (briefHour < 0) problems.push("briefHour doit \xEAtre un entier entre 0 et 23.");
  }
  const intervalRaw = r.intervalMinutes;
  let intervalMinutes = 5;
  if (intervalRaw !== void 0) {
    intervalMinutes = typeof intervalRaw === "number" && Number.isFinite(intervalRaw) && intervalRaw >= 1 && intervalRaw <= 120 ? Math.round(intervalRaw) : 0;
    if (!intervalMinutes) problems.push("intervalMinutes doit \xEAtre un nombre entre 1 et 120.");
  }
  if (typeof r.briefEnabled !== "undefined" && typeof r.briefEnabled !== "boolean") problems.push("briefEnabled doit \xEAtre true ou false.");
  const bool = (v) => typeof v === "boolean";
  for (const k of ["briefUsOpen", "briefUsClose", "newsEnabled", "smartMoneyEnabled", "emergingEnabled"]) {
    if (typeof r[k] !== "undefined" && typeof r[k] !== "boolean") problems.push(`${k} doit \xEAtre true ou false.`);
  }
  const syncToken = str(r.syncToken);
  const passphrase = str(r.passphrase);
  const telegramToken = str(r.telegramToken);
  const telegramChatId = str(r.telegramChatId);
  if (!syncToken) problems.push("syncToken manquant (ou variable d\u2019environnement BOUSSOLE_SYNC_TOKEN).");
  if (!passphrase) problems.push("passphrase manquante (ou BOUSSOLE_PASSPHRASE) \u2014 la m\xEAme que dans l\u2019application, R\xE9glages \u2192 Synchronisation.");
  if (!telegramToken) problems.push("telegramToken manquant (ou TELEGRAM_BOT_TOKEN) \u2014 cr\xE9\xE9 avec @BotFather.");
  if (!telegramChatId && !opts.allowMissingChatId) problems.push("telegramChatId manquant (ou TELEGRAM_CHAT_ID) \u2014 obtenu par la commande --discover.");
  if (problems.length) return { config: null, problems };
  return {
    config: {
      syncRepo,
      syncPath: str(r.syncPath) || PATH_DEFAULT,
      syncToken,
      passphrase,
      telegramToken,
      telegramChatId,
      coingeckoKey: str(r.coingeckoKey) || null,
      currency,
      intervalMinutes,
      briefHour,
      briefEnabled: typeof r.briefEnabled === "boolean" ? r.briefEnabled : true,
      briefUsOpen: r.briefUsOpen === void 0 ? true : bool(r.briefUsOpen),
      briefUsClose: r.briefUsClose === void 0 ? true : bool(r.briefUsClose),
      newsEnabled: r.newsEnabled === void 0 ? true : bool(r.newsEnabled),
      smartMoneyEnabled: r.smartMoneyEnabled === void 0 ? true : bool(r.smartMoneyEnabled),
      emergingEnabled: r.emergingEnabled === void 0 ? true : bool(r.emergingEnabled),
      mistralApiKey: str(r.mistralApiKey) || null,
      mistralModel: str(r.mistralModel) || "mistral-small-latest",
      timeZone,
      stateDir: str(r.stateDir),
      device: str(r.device) || "vps-boussole"
    },
    problems: []
  };
}
function applyEnv(raw, env = process.env) {
  const out = { ...raw };
  const set = (key, envName) => {
    const v = env[envName];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  };
  set("syncToken", "BOUSSOLE_SYNC_TOKEN");
  set("passphrase", "BOUSSOLE_PASSPHRASE");
  set("telegramToken", "TELEGRAM_BOT_TOKEN");
  set("telegramChatId", "TELEGRAM_CHAT_ID");
  set("coingeckoKey", "COINGECKO_KEY");
  set("mistralApiKey", "MISTRAL_API_KEY");
  set("stateDir", "BOUSSOLE_STATE_DIR");
  return out;
}

// src/runner/state.ts
var DAY_MS = 24 * 36e5;
var SENT_RETENTION_MS = 30 * DAY_MS;
function emptyState() {
  return { sent: {}, lastBriefSlot: {}, zoneLabel: null, smCursor: {}, okAt: null, attemptAt: null, error: null };
}
function parseState(json) {
  if (!json) return emptyState();
  try {
    const r = JSON.parse(json);
    const sent = r.sent && typeof r.sent === "object" && !Array.isArray(r.sent) ? r.sent : {};
    const slots = r.lastBriefSlot && typeof r.lastBriefSlot === "object" && !Array.isArray(r.lastBriefSlot) ? r.lastBriefSlot : {};
    const out = { sent: {}, lastBriefSlot: {}, zoneLabel: typeof r.zoneLabel === "string" ? r.zoneLabel : null, smCursor: {}, okAt: typeof r.okAt === "number" ? r.okAt : null, attemptAt: typeof r.attemptAt === "number" ? r.attemptAt : null, error: typeof r.error === "string" ? r.error : null };
    if (typeof r.lastBriefDay === "string" && typeof slots.matin === "undefined") out.lastBriefSlot.matin = r.lastBriefDay;
    for (const [k, v] of Object.entries(slots)) if (typeof v === "string") out.lastBriefSlot[k] = v;
    for (const [k, v] of Object.entries(sent)) if (typeof v === "number" && Number.isFinite(v)) out.sent[k] = v;
    const cursorRaw = r.smCursor;
    if (cursorRaw && typeof cursorRaw === "object" && !Array.isArray(cursorRaw)) {
      for (const [k, v] of Object.entries(cursorRaw)) if (typeof v === "number" && Number.isFinite(v)) out.smCursor[k] = v;
    }
    return out;
  } catch {
    return emptyState();
  }
}
function pruneSent(state, now) {
  const kept = {};
  let changed = false;
  for (const [k, at] of Object.entries(state.sent)) {
    if (k.startsWith("exit:")) {
      kept[k] = at;
      continue;
    }
    if (now - at > SENT_RETENTION_MS) changed = true;
    else kept[k] = at;
  }
  return changed ? { ...state, sent: kept } : state;
}
function shouldSend(state, key) {
  return state.sent[key] == null;
}
function markSent(state, keys, now) {
  if (!keys.length) return state;
  const sent = { ...state.sent };
  for (const k of keys) sent[k] = now;
  return { ...state, sent };
}
function recordStatus(state, ok, error, now) {
  const out = { ...state, attemptAt: now };
  if (ok) {
    out.okAt = now;
    out.error = null;
  } else out.error = error ?? "erreur inconnue";
  return out;
}

// src/lib/sync/crypto.ts
var PREFIX = "BC1";
var ITERATIONS = 6e5;
var SALT_BYTES = 16;
var IV_BYTES = 12;
var te = new TextEncoder();
var td = new TextDecoder();
function bytesToB642(buf) {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(n2) {
  const out = new Uint8Array(n2);
  crypto.getRandomValues(out);
  return out;
}
async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function checkPassphrase(passphrase) {
  const p = passphrase.trim();
  if (p.length < 8) return "Choisis une phrase de passe d\u2019au moins 8 caract\xE8res (elle ne quitte jamais cet appareil).";
  return null;
}
async function seal(value, passphrase) {
  if (checkPassphrase(passphrase)) throw new Error(checkPassphrase(passphrase));
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase.trim(), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(value))));
  return `${PREFIX}|${bytesToB642(salt)}|${bytesToB642(iv)}|${bytesToB642(ct)}`;
}
async function unseal(sealed, passphrase) {
  const parts = sealed.split("|");
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("Le fichier de synchronisation n\u2019a pas le format attendu (Boussole chiffr\xE9 v1).");
  let value;
  try {
    const key = await deriveKey(passphrase.trim(), b64ToBytes(parts[1]));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(parts[2]) }, key, b64ToBytes(parts[3]));
    value = JSON.parse(td.decode(plain));
  } catch {
    throw new Error("Phrase de passe incorrecte, ou fichier endommag\xE9 pendant le transfert.");
  }
  return value;
}

// src/lib/format.ts
var nf = (opts) => new Intl.NumberFormat("fr-FR", opts);
function priceDigits(v) {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(a)) return 2;
  if (a >= 1e3) return 0;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  if (a >= 1e-4) return 6;
  return 8;
}
function fmtPrice(v, currency = "EUR") {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  const d = priceDigits(v);
  return nf({ style: "currency", currency, minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).format(v);
}
function fmtPct(v, digits = 1, signed = true) {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  const s = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return `${signed && v > 0 ? "+" : ""}${s} %`;
}
function fmtDate(d, withTime = false) {
  if (d == null) return "\u2014";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...withTime ? { hour: "2-digit", minute: "2-digit" } : {}
  });
}
function isoDay(d = /* @__PURE__ */ new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// src/lib/fx.ts
var FALLBACK_EUR_PER_USD = 0.87;

// src/lib/portfolio.ts
function txAmounts(tx, amount) {
  const fx = tx.fxEurPerUsd > 0 ? tx.fxEurPerUsd : FALLBACK_EUR_PER_USD;
  if (tx.currency === "EUR") return { eur: amount, usd: amount / fx };
  return { eur: amount * fx, usd: amount };
}
function sortTx(txs) {
  const key = (t) => t.time ?? t.date;
  return [...txs].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka === kb ? 0 : ka < kb ? -1 : 1;
  });
}
function buildPositions(txs) {
  const map = /* @__PURE__ */ new Map();
  for (const tx of sortTx(txs)) {
    let p = map.get(tx.coinId);
    if (!p) {
      p = { coinId: tx.coinId, symbol: tx.symbol, name: tx.name, image: tx.image, quantity: 0, costEur: 0, costUsd: 0, realizedEur: 0, realizedUsd: 0, txCount: 0 };
      map.set(tx.coinId, p);
    }
    p.txCount++;
    if (tx.image && !p.image) p.image = tx.image;
    const gross = txAmounts(tx, tx.quantity * tx.price);
    const fee = txAmounts(tx, tx.fee || 0);
    switch (tx.type) {
      case "buy":
      case "deposit": {
        p.quantity += tx.quantity;
        p.costEur += gross.eur + fee.eur;
        p.costUsd += gross.usd + fee.usd;
        break;
      }
      case "reward": {
        p.quantity += tx.quantity;
        p.costEur += fee.eur;
        p.costUsd += fee.usd;
        break;
      }
      case "transfer":
        break;
      case "sell":
      case "withdraw": {
        if (p.quantity <= 0) break;
        const q = Math.min(tx.quantity, p.quantity);
        const ratio = q / p.quantity;
        const removedEur = p.costEur * ratio;
        const removedUsd = p.costUsd * ratio;
        if (tx.type === "sell") {
          const proceeds = txAmounts(tx, q * tx.price);
          p.realizedEur += proceeds.eur - fee.eur - removedEur;
          p.realizedUsd += proceeds.usd - fee.usd - removedUsd;
        }
        p.quantity -= q;
        p.costEur -= removedEur;
        p.costUsd -= removedUsd;
        if (p.quantity < 1e-12) {
          p.quantity = 0;
          p.costEur = 0;
          p.costUsd = 0;
        }
        break;
      }
    }
  }
  return map;
}
var STABLES = /* @__PURE__ */ new Set([
  "usdt",
  "usdc",
  "dai",
  "fdusd",
  "tusd",
  "usde",
  "usds",
  "pyusd",
  "usdd",
  "frax",
  "lusd",
  "gusd",
  "usdp",
  "eurc",
  "eurs",
  "rlusd",
  "usd1",
  "busd",
  "usdb",
  "usdy",
  "usdtb",
  "gho",
  "crvusd",
  "dola",
  "eure",
  "susde",
  "usdg",
  "usdf"
]);
var STABLE_IDS = /* @__PURE__ */ new Set(["tether", "usd-coin", "dai", "first-digital-usd", "ethena-usde", "usds", "paypal-usd", "euro-coin", "ripple-usd", "true-usd", "frax", "usd1-wlfi"]);
function isStable(symbol, coinId) {
  return STABLES.has(symbol.toLowerCase()) || (coinId ? STABLE_IDS.has(coinId) : false);
}
var WRAPPED = /* @__PURE__ */ new Set([
  "wbtc",
  "weth",
  "steth",
  "wsteth",
  "reth",
  "cbeth",
  "cbbtc",
  "tbtc",
  "weeth",
  "ezeth",
  "rseth",
  "meth",
  "wbeth",
  "bnsol",
  "jitosol",
  "msol",
  "jupsol",
  "bsol",
  "lbtc",
  "solvbtc",
  "wbnb",
  "wsol",
  "wavax",
  "wmatic",
  "btcb",
  "sweth",
  "oseth",
  "stkaave",
  "wtrx",
  "wht",
  "wftm",
  "lseth",
  "pufeth",
  "rsweth",
  "ethx",
  "sfrxeth",
  "frxeth",
  "clbtc",
  "enzobtc",
  "unibtc",
  "xsolvbtc"
]);
function isWrappedOrStaked(symbol, name = "", coinId = "") {
  if (WRAPPED.has(symbol.toLowerCase())) return true;
  const s = `${name} ${coinId}`.toLowerCase();
  return /\bwrapped\b|\bbridged\b|\bstaked\b|restaked|liquid staking|\bwormhole\b|binance-peg|\bpeg\b/.test(s);
}

// src/lib/indicators.ts
function sma(values, period) {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function rsi(values, period = 14) {
  const out = new Array(values.length).fill(NaN);
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
function toWeekly(daily) {
  const out = [];
  let cur = null;
  let curWeek = -1;
  for (const c of daily) {
    const d = new Date(c.time * 1e3);
    const day = (d.getUTCDay() + 6) % 7;
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1e3;
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

// src/lib/thresholds.ts
var TEMPERATURE = { extremeFear: 20, fear: 40, warm: 60, euphoria: 80 };
var MIN_RUNG_VALUE_USD = 20;

// src/lib/cycle.ts
var HALVINGS = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20", "2028-04-15"];
function halvingContext(now = /* @__PURE__ */ new Date()) {
  const t = now.getTime();
  let last = HALVINGS[0];
  let next = HALVINGS[1] ?? HALVINGS[0];
  for (let i = 0; i < HALVINGS.length - 1; i++) {
    if (Date.parse(HALVINGS[i]) <= t) {
      last = HALVINGS[i];
      next = HALVINGS[i + 1];
    }
  }
  return {
    last,
    next,
    daysSince: Math.max(0, Math.floor((t - Date.parse(last)) / 864e5)),
    daysToNext: Math.max(0, Math.ceil((Date.parse(next) - t) / 864e5))
  };
}
function piecewise(x, points) {
  if (!Number.isFinite(x)) return NaN;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + (x - x0) / (x1 - x0) * (y1 - y0);
  }
  return points[points.length - 1][1];
}
function zoneFor(t) {
  if (t < TEMPERATURE.extremeFear) return { key: "capitulation", label: "Peur extr\xEAme", action: "Zone d'achat historique : renforce ton DCA (\xD72) sur BTC/ETH, par paliers, sans tout miser d'un coup.", dcaMultiplier: 2, tone: "up" };
  if (t < TEMPERATURE.fear) return { key: "accumulation", label: "Accumulation", action: "Bon moment pour accumuler : DCA renforc\xE9 (\xD71,5), privil\xE9gie la qualit\xE9.", dcaMultiplier: 1.5, tone: "up" };
  if (t < TEMPERATURE.warm) return { key: "neutre", label: "Neutre", action: "DCA normal, aucun exc\xE8s : respecte ton plan et ta r\xE9partition cible.", dcaMultiplier: 1, tone: "neutral" };
  if (t < TEMPERATURE.euphoria) return { key: "chaleur", label: "March\xE9 chaud", action: "DCA r\xE9duit (\xD70,5) et pr\xE9pare tes prises de profits par paliers sur les positions en gain.", dcaMultiplier: 0.5, tone: "down" };
  return { key: "euphorie", label: "Euphorie", action: "Prends des profits progressivement, stoppe les achats d\u2019altcoins, remonte ta part de stablecoins.", dcaMultiplier: 0.25, tone: "down" };
}
function computeCycle({ btcDaily, fng, fundingRate, mvrv, stableShare }) {
  if (btcDaily.length < 200) return null;
  const closes = btcDaily.map((c) => c.close);
  const price = closes[closes.length - 1];
  const comps = [];
  if (fng != null && Number.isFinite(fng)) {
    comps.push({
      key: "fng",
      label: "Fear & Greed",
      value: `${Math.round(fng)}/100`,
      heat: fng,
      weight: 25,
      explain: "Sentiment agr\xE9g\xE9 (volatilit\xE9, volumes, r\xE9seaux sociaux, dominance). Sous 25 : peur extr\xEAme, au-dessus de 75 : avidit\xE9."
    });
  }
  const s200 = sma(closes, 200);
  const mayer = price / s200[s200.length - 1];
  comps.push({
    key: "mayer",
    label: "Multiple de Mayer (BTC)",
    value: mayer.toFixed(2).replace(".", ","),
    weight: 25,
    heat: piecewise(mayer, [[0.6, 0], [1, 35], [1.5, 65], [2.4, 100]]),
    explain: "Prix du BTC divis\xE9 par sa moyenne 200 jours. Sous 0,8 : zone d\u2019achat historique ; au-dessus de 2,4 : bulle."
  });
  const weekly = toWeekly(btcDaily);
  const wCloses = weekly.map((w) => w.close);
  let ratio200w = NaN;
  if (wCloses.length >= 200) {
    const s200w = sma(wCloses, 200);
    ratio200w = price / s200w[s200w.length - 1];
    comps.push({
      key: "ma200w",
      label: "Prix / moyenne 200 semaines",
      value: `${ratio200w.toFixed(2).replace(".", ",")}\xD7`,
      weight: 20,
      heat: piecewise(ratio200w, [[0.8, 0], [1, 15], [1.5, 40], [2.5, 75], [3.5, 100]]),
      explain: "La moyenne 200 semaines a marqu\xE9 tous les creux majeurs du Bitcoin. Pr\xE8s de 1\xD7 : opportunit\xE9 rare."
    });
  }
  const rw = rsi(wCloses, 14);
  const rsiW = rw[rw.length - 1];
  if (Number.isFinite(rsiW)) {
    comps.push({
      key: "rsiw",
      label: "RSI hebdomadaire (BTC)",
      value: `${Math.round(rsiW)}`,
      weight: 15,
      heat: piecewise(rsiW, [[30, 0], [50, 45], [70, 75], [85, 100]]),
      explain: "Au-dessus de 80 en hebdo, le march\xE9 est historiquement euphorique ; sous 35, il est \xE9puis\xE9."
    });
  }
  let piCycle = NaN;
  if (closes.length >= 350) {
    const s111 = sma(closes, 111);
    const s350 = sma(closes, 350);
    piCycle = s111[s111.length - 1] / (2 * s350[s350.length - 1]);
    comps.push({
      key: "pi",
      label: "Indicateur Pi Cycle",
      value: `${Math.round(piCycle * 100)} %`,
      weight: 10,
      heat: piecewise(piCycle, [[0.4, 0], [0.7, 50], [1, 100]]),
      explain: "Rapport MM111 / (2 \xD7 MM350). \xC0 100 %, il a signal\xE9 les sommets de cycle de 2013, 2017 et 2021."
    });
  }
  if (mvrv != null && Number.isFinite(mvrv)) {
    comps.push({
      key: "mvrv",
      label: "MVRV (BTC)",
      value: `${mvrv.toFixed(2).replace(".", ",")}\xD7`,
      weight: 10,
      heat: piecewise(mvrv, [[0.8, 0], [1, 25], [1.5, 50], [2, 72], [2.5, 85], [3, 95], [4, 100]]),
      explain: "Capitalisation divis\xE9e par capital r\xE9alis\xE9 (ce que valent les pi\xE8ces au prix o\xF9 elles ont boug\xE9 pour la derni\xE8re fois). Sous 1 : le march\xE9 d\xE9tient globalement en perte \u2014 zone d\u2019accumulation. Au-dessus de 3 : chaque cycle s\u2019y est arr\xEAt\xE9 (2013, 2017, 2021). Source gratuite retard\xE9e de ~7 jours."
    });
  }
  if (stableShare != null && Number.isFinite(stableShare)) {
    comps.push({
      key: "stables",
      label: "Puissance stablecoins",
      value: `${stableShare.toFixed(1).replace(".", ",")} % de la crypto`,
      weight: 5,
      heat: piecewise(stableShare, [[3, 100], [5, 70], [7, 40], [9, 20], [12, 10]]),
      explain: "Part des stablecoins dans la capitalisation totale : la poudre s\xE8che install\xE9e en attendant d\u2019acheter. Une part \xE9lev\xE9e = du carburant disponible ; une part faible = le capital est d\xE9j\xE0 investi (et r\xE9cup\xE9rer du cash co\xFBte cher)."
    });
  }
  if (fundingRate != null && Number.isFinite(fundingRate)) {
    const f = fundingRate * 100;
    comps.push({
      key: "funding",
      label: "Taux de financement (perp BTC)",
      value: `${f.toFixed(3).replace(".", ",")} %`,
      weight: 5,
      heat: piecewise(f, [[-0.01, 10], [0, 30], [0.01, 50], [0.03, 75], [0.05, 100]]),
      explain: "Co\xFBt pay\xE9 par les positions longues \xE0 effet de levier. Tr\xE8s \xE9lev\xE9 = exc\xE8s de sp\xE9culation."
    });
  }
  const wsum = comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.weight : 0), 0);
  const temperature = wsum > 0 ? comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.heat * c.weight : 0), 0) / wsum : 50;
  return { temperature, zone: zoneFor(temperature), components: comps, mayer, ratio200w, piCycle, halving: halvingContext() };
}

// src/lib/alerts.ts
var watchedAlerts = (alerts) => alerts.filter((a) => a.active && !a.triggeredAt);
function checkPriceAlerts(alerts, prices) {
  const out = [];
  for (const a of watchedAlerts(alerts)) {
    const price = prices.get(a.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (a.condition === "above" ? price >= a.priceUsd : price <= a.priceUsd) out.push({ alert: a, price });
  }
  return out;
}

// src/lib/exit.ts
var DEFAULT_LADDER = [{ multiple: 2, pct: 25 }, { multiple: 3, pct: 25 }, { multiple: 5, pct: 25 }];
function exitLadder(i) {
  if (!(i.avgCostUsd > 0) || !(i.priceUsd > 0) || !(i.quantity > 0)) return [];
  const doneShare = i.steps.filter((s) => i.doneMultiples.includes(s.multiple)).reduce((t, s) => t + s.pct, 0) / 100;
  const initial = doneShare < 0.999 ? i.quantity / (1 - doneShare) : i.quantity;
  return [...i.steps].sort((a, b) => a.multiple - b.multiple).map((s) => {
    const done = i.doneMultiples.includes(s.multiple);
    const target = i.avgCostUsd * s.multiple;
    const qty = Math.min(initial * s.pct / 100, i.quantity);
    return { multiple: s.multiple, pct: s.pct, done, targetPrice: target, reached: i.priceUsd >= target, progressPct: Math.min(100, i.priceUsd / target * 100), qty: done ? 0 : qty, valueUsd: done ? 0 : qty * i.priceUsd };
  });
}
function pendingRungs(rungs, minValueUsd = MIN_RUNG_VALUE_USD) {
  return rungs.filter((r) => r.reached && !r.done && r.valueUsd >= minValueUsd);
}

// src/runner/evaluate.ts
function watchOf(bundle) {
  const list2 = (k) => Array.isArray(bundle.data[k]) ? bundle.data[k] : [];
  const stamps = bundle.data;
  const exitDone = stamps.exitDone && typeof stamps.exitDone === "object" && !Array.isArray(stamps.exitDone) ? stamps.exitDone : {};
  const paperRaw = stamps.paper;
  const paper = paperRaw && typeof paperRaw === "object" && !Array.isArray(paperRaw) ? paperRaw : null;
  const profileRaw = stamps.profile;
  const vacationUntil = profileRaw && typeof profileRaw === "object" && typeof profileRaw.vacationUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(profileRaw.vacationUntil) ? profileRaw.vacationUntil : null;
  return { alerts: list2("alerts"), transactions: list2("transactions"), theses: list2("theses"), exitDone, paperTrades: list2("paperTrades"), paper, smartWallets: list2("smartWallets"), watchedTokens: list2("watchedTokens"), vacationUntil };
}
var alertKey = (id) => `alert:${id}`;
var rungKey = (coinId, multiple) => `exit:${coinId}:${multiple}`;
function priceLabel(usd, cur) {
  return fmtPrice(cur.currency === "EUR" ? usd * (cur.eurPerUsd > 0 ? cur.eurPerUsd : 1) : usd, cur.currency);
}
function hitAlerts(watch, prices) {
  return checkPriceAlerts(watch.alerts, prices);
}
function alertMessage(a, price, cur) {
  const side = a.condition === "above" ? "au-dessus" : "en dessous";
  return `Alerte ${a.symbol.toUpperCase()}
${a.name} est pass\xE9 ${side} de ${priceLabel(a.priceUsd, cur)} (cours : ${priceLabel(price, cur)}).`;
  ;
}
function hitRungs(watch, prices) {
  const out = [];
  for (const p of buildPositions(watch.transactions).values()) {
    if (p.coinId === "bitcoin" || p.coinId === "ethereum" || p.symbol.toLowerCase() === "usdc" || p.symbol.toLowerCase() === "usdt") continue;
    const price = prices.get(p.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (!(p.quantity > 0) || !(p.costUsd > 0)) continue;
    const thesis = watch.theses.find((t) => t.coinId === p.coinId);
    const steps = thesis?.sellPlan?.length ? thesis.sellPlan : DEFAULT_LADDER;
    const rungs = exitLadder({ avgCostUsd: p.costUsd / p.quantity, priceUsd: price, quantity: p.quantity, steps, doneMultiples: watch.exitDone[p.coinId] ?? [] });
    for (const r of pendingRungs(rungs)) {
      out.push({ coinId: p.coinId, symbol: p.symbol, name: p.name, multiple: r.multiple, pct: r.pct, targetUsd: r.targetPrice, valueUsd: r.valueUsd });
    }
  }
  return out;
}
function rungMessage(t, cur) {
  return `Palier \xD7${t.multiple} atteint sur ${t.symbol.toUpperCase()}
Vends ${t.pct} % de ta position de d\xE9part : ce palier a \xE9t\xE9 fix\xE9 \xE0 froid (\u2248 ${priceLabel(t.valueUsd, cur)} \xE0 vendre). Ouvre Boussole.`;
}
function zoneMessage(zone, temperature, previous) {
  return `Le march\xE9 change de zone : ${zone.label}
Temp\xE9rature ${Math.round(temperature)}/100 (elle \xE9tait \xAB ${previous} \xBB).
${zone.action}`;
}
function consumeAlerts(bundle, alertIds, nowIso) {
  if (!alertIds.length) return bundle;
  const alerts = watchOf(bundle).alerts;
  const wanted = new Set(alertIds);
  let changed = false;
  const next = alerts.map((a) => {
    if (!wanted.has(a.id) || a.triggeredAt || !a.active) return a;
    changed = true;
    return { ...a, triggeredAt: nowIso, active: false, updatedAt: nowIso };
  });
  if (!changed) return bundle;
  const data = { ...bundle.data, alerts: next };
  return { ...bundle, data };
}

// src/lib/dca.ts
function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween(from, to) {
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5);
}
function nextOccurrences(plan, from, count = 5) {
  const out = [];
  const start = startOfDay(parseDay(plan.startDate));
  let cursor = startOfDay(from < start ? start : from);
  let guard = 0;
  while (out.length < count && guard < 800) {
    guard++;
    if (isScheduledDay(plan, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}
function isScheduledDay(plan, day) {
  const start = startOfDay(parseDay(plan.startDate));
  const d = startOfDay(day);
  if (d < start) return false;
  const dow = (d.getDay() + 6) % 7 + 1;
  switch (plan.frequency) {
    case "daily":
      return true;
    case "weekly":
      return dow === (plan.dayOfWeek ?? (start.getDay() + 6) % 7 + 1);
    case "biweekly": {
      const target = plan.dayOfWeek ?? (start.getDay() + 6) % 7 + 1;
      if (dow !== target) return false;
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return weeks % 2 === 0;
    }
    case "monthly":
      return d.getDate() === Math.min(plan.dayOfMonth ?? start.getDate(), 28);
  }
}
function periodKey(plan, day) {
  const d = startOfDay(day);
  const start = startOfDay(parseDay(plan.startDate));
  switch (plan.frequency) {
    case "daily":
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    case "weekly": {
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
      return `w-${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
    }
    case "biweekly": {
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return `b-${Math.floor(weeks / 2)}`;
    }
    case "monthly":
      return `m-${d.getFullYear()}-${d.getMonth() + 1}`;
  }
}

// src/lib/basket.ts
function parseDay2(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
var startOfDay2 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
var dowOf = (d) => (d.getDay() + 6) % 7 + 1;
function isBasketDay(b, day) {
  const d = startOfDay2(day);
  if (d < startOfDay2(parseDay2(b.startDate))) return false;
  return b.daysOfWeek.includes(dowOf(d));
}
function nextBasketOccurrences(b, from, count = 4) {
  const out = [];
  let cursor = startOfDay2(from);
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (isBasketDay(b, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}

// src/lib/paper.ts
function paperPositions(trades, prices) {
  const agg = /* @__PURE__ */ new Map();
  for (const t of trades) {
    const a = agg.get(t.coinId) ?? { coinId: t.coinId, symbol: t.symbol, name: t.name, quantity: 0, costUsd: 0 };
    const fee = t.feeUsd ?? 0;
    if (t.type === "buy") {
      a.quantity += t.quantity;
      a.costUsd += t.quantity * t.priceUsd + fee;
    } else {
      const avgCost = a.quantity > 0 ? a.costUsd / a.quantity : 0;
      const qty = Math.min(t.quantity, a.quantity);
      a.quantity -= qty;
      a.costUsd = Math.max(0, a.costUsd - qty * avgCost);
    }
    if (a.quantity <= 1e-12) {
      a.quantity = 0;
      a.costUsd = Math.max(0, a.costUsd);
    }
    agg.set(t.coinId, a);
  }
  const positions = [...agg.values()].filter((a) => a.quantity > 0);
  const unpriced = positions.filter((p) => prices.get(p.coinId) == null).length;
  return {
    positions: positions.map(({ coinId, symbol, name, quantity, costUsd }) => ({ coinId, symbol, name, quantity, costUsd })),
    unpriced
  };
}
function paperStatus(startingUsd, trades, prices) {
  let cash = startingUsd;
  for (const t of trades) {
    const fee = t.feeUsd ?? 0;
    if (t.type === "buy") cash -= t.quantity * t.priceUsd + fee;
    else cash += t.quantity * t.priceUsd - fee;
  }
  const base = paperPositions(trades, prices);
  const positions = base.positions.map((p) => {
    const price = prices.get(p.coinId);
    const value = price != null ? p.quantity * price : null;
    return { ...p, priceUsd: price ?? null, valueUsd: value, pnlUsd: value != null ? value - p.costUsd : null, pnlPct: value != null && p.costUsd > 0 ? (value / p.costUsd - 1) * 100 : null };
  });
  positions.sort((a, b) => (b.valueUsd ?? b.costUsd) - (a.valueUsd ?? a.costUsd));
  const investedCostUsd = positions.reduce((s, p) => s + p.costUsd, 0);
  const valueUsd = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const totalUsd = cash + valueUsd;
  const totalInvestedUsd = trades.filter((t) => t.type === "buy").reduce((s, t) => s + t.quantity * t.priceUsd + (t.feeUsd ?? 0), 0);
  return {
    cashUsd: cash,
    investedCostUsd,
    valueUsd,
    totalUsd,
    pnlUsd: totalUsd - startingUsd,
    pnlPct: startingUsd > 0 ? (totalUsd / startingUsd - 1) * 100 : 0,
    totalInvestedUsd,
    positions,
    unpriced: base.unpriced
  };
}

// src/lib/macro.ts
var MACRO_LABEL = {
  fomc: "Fed (FOMC)",
  cpi: "Inflation US (CPI)",
  expiry: "\xC9ch\xE9ance d\xE9riv\xE9s BTC",
  halving: "Halving Bitcoin"
};
var MACRO_ADVICE = {
  fomc: "D\xE9cision de taux \xE0 19 h, puis conf\xE9rence de Powell \xE0 19 h 30 (Paris). Volatilit\xE9 garantie : \xE9vite de passer un ordre dans la demi-heure autour de l\u2019annonce, et garde ta r\xE9serve disponible 24 h.",
  cpi: "Publication \xE0 14 h 30 (Paris). Si tu dois acheter ou vendre, fais-le plut\xF4t \xE0 distance de 14 h 25-14 h 45 : la surprise est souvent violente puis dig\xE9r\xE9e.",
  expiry: "\xC9ch\xE9ance trimestrielle des futures et options Bitcoin (Deribit, 8 h UTC) : le cours peut bouger au matin sans raison visible, puis s\u2019apaiser. Pas de panique, pas d\u2019achat impulsif sur ce mouvement.",
  halving: "La r\xE9compense de bloc est divis\xE9e par deux : l\u2019offre neuve passe de ~450 \xE0 ~225 BTC/jour. Historiquement, les 12-18 mois qui suivent sont la partie la plus chaude du cycle \u2014 c\u2019est le moment o\xF9 tes paliers de vente servent."
};
var FOMC_DAYS = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09"
];
var CPI_DAYS = [
  "2026-01-13",
  "2026-02-11",
  "2026-03-11",
  "2026-04-10",
  "2026-05-12",
  "2026-06-10",
  "2026-07-14",
  "2026-08-12",
  "2026-09-11",
  "2026-10-15",
  "2026-11-12",
  "2026-12-15"
];
function lastFridayOf(year, month) {
  const last = new Date(year, month + 1, 0);
  const d = new Date(last);
  d.setDate(d.getDate() - (d.getDay() + 2) % 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysToIso(isoDate, now) {
  const at = /* @__PURE__ */ new Date(isoDate + "T12:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((at.getTime() - today.getTime()) / 864e5);
}
var mk = (kind, date, now, label) => ({
  id: `${kind}:${date}`,
  date,
  kind,
  label: label ?? MACRO_LABEL[kind],
  daysTo: daysToIso(date, now),
  advice: MACRO_ADVICE[kind]
});
function macroEvents(now) {
  const year = now.getFullYear();
  const ft = ["fomc", "cpi"];
  const out = [];
  for (const k of ft) for (const d of k === "fomc" ? FOMC_DAYS : CPI_DAYS) {
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk(k, d, now));
  }
  for (let y = year - 2; y <= year + 2; y++) {
    const d = lastFridayOf(y, 11);
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk("expiry", d, now));
    for (const m of [2, 5, 8]) {
      const q = lastFridayOf(y, m);
      if (daysToIso(q, now) >= -2 && daysToIso(q, now) < 400) out.push(mk("expiry", q, now));
    }
  }
  out.sort((a, b) => a.daysTo - b.daysTo);
  return out;
}
function nextMacroEvents(now, max = 4, withinDays = 60) {
  return macroEvents(now).filter((e) => e.daysTo >= 0 && e.daysTo <= withinDays).slice(0, max);
}

// src/runner/brief.ts
function nyEpoch(hour, minute, now) {
  let day;
  try {
    day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return null;
  }
  for (const off of ["-04:00", "-05:00"]) {
    const t = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${off}`);
    if (!Number.isFinite(t)) continue;
    try {
      const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(new Date(t));
      if (shown === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`) return t;
    } catch {
      return null;
    }
  }
  return null;
}
function slotsOfDay(cfg, now) {
  const out = [{ id: "matin", label: "brief du matin", atMs: new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.briefHour, 0, 0, 0).getTime() }];
  const usOpen = cfg.briefUsOpen ? nyEpoch(9, 30, now) : null;
  const usClose = cfg.briefUsClose ? nyEpoch(16, 0, now) : null;
  if (usOpen != null) out.push({ id: "us-open", label: "ouverture des march\xE9s am\xE9ricains", atMs: usOpen });
  if (usClose != null) out.push({ id: "us-close", label: "cl\xF4ture des march\xE9s am\xE9ricains", atMs: usClose });
  return out;
}
var HEAD_TOP = 3;
var list = (v) => Array.isArray(v) ? v : [];
function buildBrief(i) {
  const lines = [];
  const watch = watchOf(i.bundle);
  const today = isoDay(i.now);
  const cur = i.currency;
  const short = i.slot === "us-open" || i.slot === "us-close";
  lines.push(i.slot === "us-open" ? `Boussole \u2014 ouverture am\xE9ricaine \xB7 ${fmtDate(i.now)}` : i.slot === "us-close" ? `Boussole \u2014 cl\xF4ture am\xE9ricaine \xB7 ${fmtDate(i.now)}` : `Boussole \u2014 brief du ${fmtDate(i.now)}`);
  const btc = i.prices.bitcoin;
  const market = [];
  if (i.fng) market.push(`Fear & Greed ${i.fng.value} (${i.fng.label})`);
  if (i.temperature) market.push(`zone : ${i.temperature.zoneLabel} (${Math.round(i.temperature.value)}/100)`);
  if (i.cycleMetrics?.mvrv != null) market.push(`MVRV ${i.cycleMetrics.mvrv.toFixed(2).replace(".", ",")}\xD7`);
  if (i.cycleMetrics?.stableShare != null) market.push(`stablecoins ${i.cycleMetrics.stableShare.toFixed(1).replace(".", ",")} %`);
  if (btc?.usd != null) market.push(`BTC ${fmtPrice(btc.usd, "USD")}${btc.change != null ? ` (${fmtPct(btc.change, 1, true)} / 24 h)` : ""}`);
  lines.push(market.length ? `March\xE9 : ${market.join(" \xB7 ")}` : "March\xE9 : donn\xE9es indisponibles pour l\u2019instant.");
  const horizon = nextMacroEvents(i.now, 3, 21);
  if (horizon.length) {
    lines.push(`\xC0 l\u2019horizon : ${horizon.map((e) => `${e.label} ${e.daysTo === 0 ? "aujourd\u2019hui" : e.daysTo === 1 ? "demain" : `dans ${e.daysTo} j`}`).join(" \xB7 ")}`);
    const first = horizon[0];
    if (first.daysTo <= 3) lines.push(`${first.label} \u2014 ${first.advice}`);
  }
  if (i.cycleMetrics?.halvingDaysToNext != null && i.cycleMetrics.halvingDaysToNext > 0) {
    lines.push(`Cycle : prochain halving estim\xE9 dans ${Math.round(i.cycleMetrics.halvingDaysToNext / 30)} mois.`);
  }
  const priceOf = (coinId) => {
    const p = i.prices[coinId];
    if (!p || typeof p !== "object") return null;
    const v = cur === "EUR" ? p.eur : p.usd;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  let total = 0;
  let withoutPrice = 0;
  const rows = [];
  for (const p of buildPositions(watch.transactions).values()) {
    if (!(p.quantity > 0)) continue;
    const price = priceOf(p.coinId);
    if (price == null) {
      withoutPrice++;
      continue;
    }
    total += price * p.quantity;
    rows.push({ symbol: p.symbol, value: price * p.quantity, share: 0, change: i.prices[p.coinId]?.change ?? null });
  }
  rows.sort((a, b) => b.value - a.value);
  for (const r of rows) r.share = total > 0 ? r.value / total * 100 : 0;
  if (rows.length) {
    lines.push(`Portefeuille (journal) : ${fmtPrice(total, cur)}${withoutPrice ? ` \u2014 ${withoutPrice} ligne${withoutPrice > 1 ? "s" : ""} sans prix connu` : ""}`);
    lines.push(rows.slice(0, HEAD_TOP).map((r) => `${r.symbol.toUpperCase()} ${Math.round(r.share)} %${r.change != null ? ` (${fmtPct(r.change, 1, true)})` : ""}`).join(" \xB7 "));
  }
  const usd = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(i.prices)) if (typeof p?.usd === "number" && p.usd > 0) usd.set(id, p.usd);
  const paper = watch.paper;
  if (paper?.enabled && watch.paperTrades.length) {
    const st = paperStatus(paper.startingUsd, watch.paperTrades, usd);
    if (st.positions.length) {
      const badge = st.pnlUsd >= 0 ? "+" : "";
      lines.push(`Papier (exp\xE9rimentations) : ${fmtPrice(st.totalUsd, "USD")} (${badge}${st.pnlPct.toFixed(1).replace(".", ",")} %)${st.unpriced ? `${st.unpriced} ligne${st.unpriced > 1 ? "s" : ""} sans prix` : ""}`);
    }
  }
  const plans = list(i.bundle.data.dcaPlans).filter((p) => p.active);
  const dcaExecs = list(i.bundle.data.dcaExecutions);
  const baskets = list(i.bundle.data.basket).filter((b) => b.active);
  const basketExecs = list(i.bundle.data.basketExecutions);
  const due = [];
  const upcoming = [];
  for (const b of baskets) {
    if (isBasketDay(b, i.now)) {
      const done = basketExecs.some((e) => e.basketId === b.id && e.periodKey === today);
      due.push(`panier \xAB ${b.name} \xBB ${done ? "(d\xE9j\xE0 pass\xE9 aujourd\u2019hui)" : `(${b.amountUsd} USDC)`}`);
    } else {
      const next = nextBasketOccurrences(b, i.now, 1)[0];
      if (next) upcoming.push(`panier \xAB ${b.name} \xBB ${fmtDate(next)}`);
    }
  }
  for (const p of plans) {
    if (isScheduledDay(p, i.now)) {
      const done = dcaExecs.some((e) => e.planId === p.id && e.periodKey === periodKey(p, i.now));
      due.push(`DCA ${p.name}${done ? " (d\xE9j\xE0 pass\xE9 aujourd\u2019hui)" : ""}`);
    } else {
      const next = nextOccurrences(p, i.now, 1)[0];
      if (next) upcoming.push(`DCA ${p.name} ${fmtDate(next)}`);
    }
  }
  if (due.length) lines.push(`Aujourd\u2019hui : ${due.join(" \xB7 ")}`);
  if (!short && upcoming.length) lines.push(`Prochaine \xE9ch\xE9ance : ${upcoming.join(" \xB7 ")}`);
  if (!short && !due.length && !upcoming.length) lines.push("Aucune \xE9ch\xE9ance DCA programm\xE9e.");
  const rungs = hitRungs(watch, usd);
  if (rungs.length) lines.push(`Paliers atteints non vendus : ${rungs.map((r) => `${r.symbol.toUpperCase()} \xD7${r.multiple} (vends ${r.pct} %)`).join(" \xB7 ")}`);
  if (!short) {
    const armed = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
    lines.push(`Alertes arm\xE9es : ${armed}`);
  }
  const news = i.news ?? [];
  const topNews = news.filter((n2) => n2.publishedAt > i.now.getTime() - 18 * 36e5).slice(0, 3);
  if (topNews.length) {
    lines.push(`Actus : ${topNews.map((n2) => `\xAB ${n2.title} \xBB${n2.source ? ` (${n2.source})` : ""}`).join(" \xB7 ")}`);
    for (const n2 of topNews) if (n2.resume) lines.push(`${n2.coinName} : ${n2.resume.replace(/\s+/g, " ").slice(0, 320)}`);
  }
  if (!short && i.vacationUntil) {
    lines.push(`Mode vacances jusqu'au ${i.vacationUntil} : veille critique uniquement \u2014 alertes de prix et paliers. \xC9ch\xE9ances et actus reprendront apr\xE8s.`);
  }
  const smart = i.smart ?? [];
  if (smart.length && !short) {
    lines.push(`Wallets suivis : ${smart[0]}`);
    for (const l of smart.slice(1)) lines.push(`  ${l}`);
  }
  const emerging = i.emerging ?? [];
  if (emerging.length && !short) {
    lines.push(`\xC9mergentes (Solana/Base, \xE0 scanner avant tout) : ${emerging[0]}`);
    for (const l of emerging.slice(1)) lines.push(`  ${l}`);
  }
  if (!short && i.syncSavedAt) {
    const when = new Date(i.syncSavedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`Donn\xE9es de synchronisation : ${fmtDate(when, true)}${i.syncDevice ? ` (${i.syncDevice})` : ""}`);
  }
  return lines.join("\n");
}

// src/runner/news.ts
var HOT_WORDS = /(hack|pirat|hijack|exploit|breach|vol[eé]|stolen|liquidat|rug|scam|arnaque|sec\b|poursuite|lawsuit|interdiction|suspension|faillite|bankrupt|partenariat|partnership|listing|etf|approv|upgrade|mainnet|halving|acquisition|rach[ae]t|adoption|institutionnel|reserve|strategic)/i;
function isHotNews(item) {
  return HOT_WORDS.test(`${item.title} ${item.summaryText}`);
}
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026" };
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&#(\d+);/g, (_, n2) => String.fromCodePoint(Number(n2))).replace(/&#x([0-9a-f]+);/gi, (_, n2) => String.fromCodePoint(parseInt(n2, 16))).replace(/&([a-z]+);/gi, (m, n2) => ENTITIES[n2.toLowerCase()] ?? m);
}
var clean = (s) => decode(decode(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function parseRss(xml, coin) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const raw = clean(tag(block, "title"));
    const dash = raw.lastIndexOf(" - ");
    const title = (dash > 0 ? raw.slice(0, dash) : raw).trim();
    const fallbackSource = dash > 0 ? raw.slice(dash + 3).trim() : "";
    const url = decode(tag(block, "link")).trim() || decode(tag(block, "guid")).trim();
    const sourceTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceTag ? clean(sourceTag[1]) : fallbackSource;
    const time = Date.parse(decode(tag(block, "pubDate")).trim());
    if (!title || !/^https?:\/\//i.test(url) || !Number.isFinite(time)) continue;
    out.push({ coinId: coin.coinId, coinName: coin.name, title, url, source, publishedAt: time, summaryText: clean(tag(block, "description")).slice(0, 280) });
  }
  return out;
}
function newsKey(item) {
  let h = 2166136261;
  for (let i = 0; i < item.url.length; i++) {
    h ^= item.url.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `news:${h.toString(16)}`;
}
var TIMEOUT_MS = 15e3;
async function fetchCoinNews(coin, maxAgeMs, limit = 8) {
  try {
    const q = encodeURIComponent(`${coin.name} crypto`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
    const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const items = parseRss(await res.text(), coin).filter((i) => i.publishedAt > 0 && i.publishedAt <= Date.now() + 36e5).filter((i) => Date.now() - i.publishedAt < maxAgeMs).sort((a, b) => b.publishedAt - a.publishedAt);
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

// src/lib/smartmoney.ts
var eventKey = (e) => `sm:${e.walletId}:${e.txHash}:${e.mint}`;
function balancesByMint(rows, wallet, other) {
  const out = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const mint = r.mint;
    if (!mint) continue;
    const owner = r.owner ?? other.find((o) => o.accountIndex === r.accountIndex)?.owner ?? null;
    if (owner !== wallet) continue;
    out.set(mint, (out.get(mint) ?? 0) + (r.uiTokenAmount?.uiAmount ?? 0));
  }
  return out;
}
function solanaDeltas(tx, wallet) {
  const pre = balancesByMint(tx.meta?.preTokenBalances ?? [], wallet, tx.meta?.postTokenBalances ?? []);
  const post2 = balancesByMint(tx.meta?.postTokenBalances ?? [], wallet, tx.meta?.preTokenBalances ?? []);
  const atMs = (tx.blockTime ?? 0) * 1e3;
  const hash = tx.signature ?? "";
  const out = [];
  for (const [mint, after] of post2) {
    const before = pre.get(mint) ?? 0;
    const delta = after - before;
    if (Math.abs(delta) < 1e-9) continue;
    out.push({ mint, delta, atMs, hash });
  }
  return out;
}
var evmQty = (raw, decimals) => {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const scale = decimals != null && decimals >= 0 && decimals <= 36 ? Math.pow(10, decimals) : null;
  const v = scale != null ? Number(raw) / scale : null;
  return v != null && Number.isFinite(v) ? v : null;
};
function evmDeltas(items, wallet) {
  const me = wallet.address.toLowerCase();
  const acc = /* @__PURE__ */ new Map();
  for (const it of items) {
    const tok = it.token;
    if (!tok?.address || tok.type && tok.type !== "ERC-20") continue;
    const qty = evmQty(it.total?.value, tok.decimals ?? null);
    if (qty == null || qty <= 0) continue;
    const addr = tok.address.toLowerCase();
    const from = (it.from?.hash ?? "").toLowerCase();
    const to = (it.to?.hash ?? "").toLowerCase();
    if (from !== me && to !== me) continue;
    const delta = to === me ? qty : -qty;
    const atMs = it.timestamp ? Date.parse(it.timestamp) : 0;
    const hash = it.tx_hash ?? "";
    const prev = acc.get(addr);
    if (prev) {
      if (prev.hash === hash) {
        prev.delta += delta;
        continue;
      }
    }
    acc.set(addr, { mint: addr, delta, symbol: tok.symbol ?? null, name: tok.name ?? null, atMs, hash });
  }
  return [...acc.values()].filter((d) => Math.abs(d.delta) > 1e-12);
}
var CHAIN_ALIASES = { eth: "ethereum", ethereum: "ethereum", solana: "solana", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
var normChain = (c) => c ? CHAIN_ALIASES[c.toLowerCase()] ?? c.toLowerCase() : null;
function tokenMatches(ev, refs) {
  const evChain = normChain(ev.chain);
  const mint = ev.mint.toLowerCase();
  const sym = (ev.symbol ?? "").toUpperCase();
  for (const r of refs) {
    if (r.address && normChain(r.chain) === evChain && r.address.toLowerCase() === mint) return true;
    if (sym && r.symbol.toUpperCase() === sym) return true;
  }
  return false;
}
function relevantEvents(events, refs) {
  return events.filter((e) => tokenMatches(e, refs));
}
function refsOf(w) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (r) => {
    const k = `${r.chain ?? ""}:${r.address ?? r.symbol}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };
  for (const t of w.watched) push({ chain: t.chainId, address: t.address, symbol: t.symbol });
  for (const p of w.positions) push({ symbol: p.symbol });
  for (const a of w.alerts) if (a.active && !a.triggeredAt) push({ symbol: a.symbol });
  return out;
}
var qtyLabel = (e) => {
  const q = e.uiAmount;
  const digits = q >= 1e3 ? 0 : q >= 1 ? 2 : 6;
  return `${q.toFixed(digits)} ${e.symbol ?? ""}`.trim();
};
function smartMessage(e, nowMs = Date.now()) {
  const ago = e.atMs > 0 ? Math.max(0, Math.round((nowMs - e.atMs) / 6e4)) : null;
  const when = ago != null ? ago < 60 ? `il y a ${ago} min` : ago < 2880 ? `il y a ${Math.round(ago / 60)} h` : `il y a ${Math.max(1, Math.round(ago / 1440))} j` : "";
  const tok = e.symbol ? `${e.symbol}${e.name ? ` (${e.name})` : ""}` : `${e.mint.slice(0, 4)}\u2026`;
  if (e.side === "sell") {
    return [
      `Smart money \u2014 ${e.walletLabel} VEND ${tok}`,
      `${qtyLabel(e)}${when ? `, ${when}` : ""}. Un wallet que tu suis pour ses r\xE9sultats se d\xE9charge de ce token.`,
      `C'est le signal pour relire ta th\xE8se de sortie : garde, all\xE8ge, ou sors \u2014 mais d\xE9cide \xE0 froid.`
    ].join("\n");
  }
  return [
    `Smart money \u2014 ${e.walletLabel} ach\xE8te ${tok}`,
    `${qtyLabel(e)}${when ? `, ${when}` : ""}. Ce wallet y entre : v\xE9rifie le projet avant toute id\xE9e d'imitation (achat fractionn\xE9, jamais tout d'un coup).`
  ].join("\n");
}
function smartBriefLines(events, nowMs = Date.now(), max = 4) {
  const recent = events.filter((e) => nowMs - e.atMs < 24 * 36e5);
  recent.sort((a, b) => b.atMs - a.atMs || (a.side === "sell" ? -1 : 1));
  const lines = [];
  for (const e of recent.slice(0, max)) {
    lines.push(`${e.side === "sell" ? "A vendu" : "A achet\xE9"} ${qtyLabel(e)} \u2014 ${e.walletLabel}`);
  }
  return lines;
}

// src/runner/cycle.ts
var DAY_MS2 = 24 * 36e5;
var ZONE_REPEAT_MS = 7 * DAY_MS2;
function coinsOf(bundle, watch) {
  const ids = /* @__PURE__ */ new Set(["bitcoin"]);
  for (const coinId of buildPositions(watch.transactions).keys()) if (coinId) ids.add(coinId);
  for (const t of watch.paperTrades) ids.add(t.coinId);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) ids.add(a.coinId);
  const ref = (v) => {
    if (v && typeof v === "object") {
      const c = v;
      if (c.coinId) ids.add(c.coinId);
    }
  };
  const arr = (k) => Array.isArray(bundle.data[k]) ? bundle.data[k] : [];
  for (const p of arr("dcaPlans")) ref(p);
  const basket = bundle.data.basket;
  if (basket && typeof basket === "object") {
    const b = basket;
    for (const c of [...b.core ?? [], ...b.discovery ?? []]) ref(c);
  }
  return [...ids];
}
function newsCoinsOf(watch) {
  const seen = /* @__PURE__ */ new Map();
  const add = (coinId, symbol, name) => {
    if (!coinId || seen.has(coinId)) return;
    if (coinId === "bitcoin" || coinId === "ethereum" || isStable(symbol, coinId)) return;
    seen.set(coinId, { coinId, name });
  };
  for (const p of buildPositions(watch.transactions).values()) add(p.coinId, p.symbol, p.name);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) add(a.coinId, a.symbol, a.name);
  return [...seen.values()].slice(0, 12);
}
function asBundle(v) {
  if (!v || typeof v !== "object" || !v.data || !Array.isArray(v.deletions)) {
    throw new Error("Le fichier de synchronisation ne contient pas des donn\xE9es Boussole.");
  }
  return v;
}
async function runCycle(cfg, st, opts, deps, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const dayKey = isoDay(now);
  let state = pruneSent(st, nowMs);
  const result = { sent: 0, consumed: 0, error: null, watching: 0 };
  const send = async (text) => {
    if (opts.dry) {
      opts.onDry?.(text);
      return;
    }
    await deps.telegram(text);
  };
  const remote = await deps.fetchRemote();
  if (!remote) {
    const err = `Le fichier ${cfg.syncPath} n\u2019existe pas encore dans ${cfg.syncRepo} : active la synchronisation dans l\u2019application (R\xE9glages) et laisse-la \xE9crire une premi\xE8re fois.`;
    return { state: recordStatus(state, false, err, nowMs), result: { ...result, error: err } };
  }
  const bundle = asBundle(await unseal(remote.content, cfg.passphrase));
  const watch = watchOf(bundle);
  const onVacation = !!watch.vacationUntil && watch.vacationUntil >= dayKey;
  const priceRows = await deps.prices(coinsOf(bundle, watch));
  const priceMap = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(priceRows)) if (typeof p.usd === "number" && p.usd > 0) priceMap.set(id, p.usd);
  result.watching = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
  const eurPerUsd = priceRows.bitcoin?.usd && priceRows.bitcoin.eur ? priceRows.bitcoin.eur / priceRows.bitcoin.usd : 0.92;
  const cur = { currency: cfg.currency, eurPerUsd };
  const queue = [];
  for (const { alert, price } of hitAlerts(watch, priceMap)) {
    const key = alertKey(alert.id);
    if (shouldSend(state, key)) queue.push({ key, text: alertMessage(alert, price, cur), alertId: alert.id });
  }
  for (const t of hitRungs(watch, priceMap)) {
    const key = rungKey(t.coinId, t.multiple);
    if (shouldSend(state, key)) queue.push({ key, text: rungMessage(t, cur) });
  }
  const fng = await deps.fearGreed().catch(() => null);
  const temperature = await marketTemperature(deps, fng);
  if (temperature) {
    if (!state.zoneLabel) {
      if (!opts.dry) state = { ...state, zoneLabel: temperature.zone.label };
    } else if (!onVacation && state.zoneLabel !== temperature.zone.label) {
      const key = `zone:${temperature.zone.label}`;
      const last = state.sent[key];
      if (last == null || nowMs - last >= ZONE_REPEAT_MS) queue.push({ key, text: zoneMessage(temperature.zone, temperature.temperature, state.zoneLabel) });
    }
  }
  for (const ev of onVacation ? [] : nextMacroEvents(now, 3, 2)) {
    const key = `macro:${ev.id}`;
    if (state.sent[key] == null) {
      queue.push({ key, text: `${ev.daysTo === 0 ? "Aujourd\u2019hui" : "Demain"} : ${ev.label}
${ev.advice}` });
    }
  }
  const ratedNews = [];
  const newsAlerts = [];
  const seenNews = [];
  if (cfg.newsEnabled && !onVacation) {
    const coins = newsCoinsOf(watch);
    const fresh = coins.length ? await deps.news(coins).catch(() => []) : [];
    const candidates = fresh.filter((n2) => nowMs - n2.publishedAt < 15 * 36e5).filter((n2) => state.sent[newsKey(n2)] == null).slice(0, 8);
    const ratings = candidates.length ? await deps.aiRates(candidates).catch(() => candidates.map(() => ({ importance: 0, resume: "" }))) : [];
    const hasAi = !!cfg.mistralApiKey;
    for (const [i, n2] of candidates.entries()) {
      const r = ratings[i] ?? { importance: 0, resume: "" };
      const key = newsKey(n2);
      const important = r.importance >= 6 || !hasAi && isHotNews(n2);
      if (important && newsAlerts.length < 3) {
        newsAlerts.push({ key, text: newsMessage({ ...n2, ...r }) });
      } else {
        if (hasAi ? r.importance > 0 && r.importance < 6 : !isHotNews(n2)) seenNews.push(key);
      }
    }
    const ratedOf = new Map(candidates.map((n2, i) => [n2.url, ratings[i] ?? { importance: 0, resume: "" }]));
    for (const n2 of fresh) {
      const r = ratedOf.get(n2.url) ?? { importance: 0, resume: "" };
      ratedNews.push({ ...n2, ...r });
    }
    ratedNews.sort((a, b) => b.publishedAt - a.publishedAt);
    if (seenNews.length && !opts.dry) state = markSent(state, seenNews, nowMs);
  }
  queue.push(...newsAlerts);
  const smartRecent = [];
  const smartAlerts = [];
  const alertedKeys = /* @__PURE__ */ new Map();
  const smartCursorNext = {};
  if (cfg.smartMoneyEnabled && !onVacation && watch.smartWallets.length && deps.smartEvents) {
    const sinceOf = (id) => state.smCursor[id] ?? nowMs - 2 * 36e5;
    const sinceMs = Math.min(...watch.smartWallets.slice(0, 12).map((w) => sinceOf(w.id)));
    const evts = await deps.smartEvents(watch.smartWallets.slice(0, 12), sinceMs, nowMs).catch(() => []);
    smartRecent.push(...evts);
    const refs = refsOf({
      watched: watch.watchedTokens,
      positions: [...buildPositions(watch.transactions).values()],
      alerts: watch.alerts
    });
    const relevant = new Set(relevantEvents(evts, refs));
    for (const e of evts) {
      const key = eventKey(e);
      const isAlert = relevant.has(e) && shouldSend(state, key);
      if (isAlert && smartAlerts.length < 3) {
        smartAlerts.push({ key, text: smartMessage(e, nowMs) });
        alertedKeys.set(key, { walletId: e.walletId, atMs: e.atMs });
      } else {
        smartCursorNext[e.walletId] = Math.max(smartCursorNext[e.walletId] ?? 0, e.atMs);
      }
    }
  }
  queue.push(...smartAlerts);
  const consumedIds = [];
  for (const m of queue) {
    if (opts.dry) {
      opts.onDry?.(m.text);
      continue;
    }
    try {
      await deps.telegram(m.text);
      state = markSent(state, [m.key], nowMs);
      result.sent++;
      if (m.alertId) consumedIds.push(m.alertId);
      if (alertedKeys.has(m.key)) {
        const a = alertedKeys.get(m.key);
        state = { ...state, smCursor: { ...state.smCursor, [a.walletId]: Math.max(state.smCursor[a.walletId] ?? 0, a.atMs) } };
      }
      if (m.key.startsWith("zone:") && temperature && temperature.zone.label !== state.zoneLabel) {
        state = { ...state, zoneLabel: temperature.zone.label };
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  if (Object.keys(smartCursorNext).length && !opts.dry) {
    const smCursor = { ...state.smCursor };
    let moved = false;
    for (const [id, at] of Object.entries(smartCursorNext)) {
      if (at > (smCursor[id] ?? 0)) {
        smCursor[id] = at;
        moved = true;
      }
    }
    if (moved) state = { ...state, smCursor };
  }
  if (consumedIds.length && !opts.dry) {
    try {
      const next = consumeAlerts(bundle, consumedIds, now.toISOString());
      const sealed = await seal({ ...next, device: cfg.device, savedAt: now.toISOString() }, cfg.passphrase);
      await deps.pushRemote(sealed, remote.sha);
      result.consumed = consumedIds.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.error = result.error ?? (msg === CONFLICT ? "l\u2019autre appareil vient d\u2019\xE9crire la synchronisation : la consommation passera au prochain cycle" : msg);
    }
  }
  for (const slot of slotsOfDay(cfg, now)) {
    if (slot.id === "matin" && !cfg.briefEnabled) continue;
    if (!(opts.forceBrief && slot.id === "matin") && slot.atMs != null && nowMs < slot.atMs) continue;
    if (!(opts.forceBrief && slot.id === "matin") && state.lastBriefSlot[slot.id] === dayKey) continue;
    let emergingLines;
    if (slot.id === "matin" && cfg.emergingEnabled && deps.emerging) {
      emergingLines = await deps.emerging(watch.smartWallets).catch(() => []);
    }
    const brief = buildBrief({
      now,
      bundle,
      prices: priceRows,
      fng,
      currency: cfg.currency,
      syncSavedAt: bundle.savedAt ?? null,
      syncDevice: bundle.device ?? null,
      temperature: temperature ? { value: temperature.temperature, zoneLabel: temperature.zone.label } : null,
      cycleMetrics: temperature ? { mvrv: temperature.mvrv, stableShare: temperature.stableShare, halvingDaysToNext: temperature.halvingDaysToNext } : null,
      slot: slot.id,
      news: ratedNews.slice(0, 6),
      smart: smartBriefLines(smartRecent, nowMs),
      emerging: emergingLines,
      vacationUntil: onVacation ? watch.vacationUntil : null
    });
    try {
      await send(brief);
      if (!opts.dry) state = { ...state, lastBriefSlot: { ...state.lastBriefSlot, [slot.id]: dayKey } };
    } catch (e) {
      result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  state = recordStatus(state, result.error == null, result.error, nowMs);
  return { state, result };
}
function newsMessage(n2, now = /* @__PURE__ */ new Date()) {
  const age = Math.max(0, now.getTime() - n2.publishedAt);
  const ago = age < 36e5 ? `il y a ${Math.max(1, Math.round(age / 6e4))} min` : age < 24 * 36e5 ? `il y a ${Math.round(age / 36e5)} h` : `il y a ${Math.round(age / 864e5)} jours`;
  const lines = [`Presse \u2014 ${n2.coinName}`, `\xAB ${n2.title} \xBB${n2.source ? ` (${n2.source}, ${ago})` : ` (${ago})`}`];
  if (n2.resume) lines.push(n2.resume.replace(/\s+/g, " ").trim().slice(0, 600));
  return lines.join("\n");
}
async function marketTemperature(deps, fng) {
  const btcDaily = await deps.btcDaily().catch(() => null);
  if (!btcDaily) return null;
  const funding = await deps.funding().catch(() => null);
  const [mvrv, stableShare] = await Promise.all([
    deps.mvrv().catch(() => null),
    deps.stableShare().catch(() => null)
  ]);
  const r = computeCycle({ btcDaily, fng: fng?.value, fundingRate: funding ?? void 0, mvrv: mvrv ?? void 0, stableShare: stableShare ?? void 0 });
  return r ? { temperature: r.temperature, zone: { key: r.zone.key, label: r.zone.label, action: r.zone.action }, mvrv, stableShare, halvingDaysToNext: r.halving.daysToNext } : null;
}

// src/runner/market.ts
var TIMEOUT_MS2 = 2e4;
async function getJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS2);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      if (res.status === 429) throw new Error("CoinGecko : limite de requ\xEAtes atteinte (ajoute une cl\xE9 \xAB Demo \xBB gratuite dans la configuration).");
      throw new Error(`CoinGecko a r\xE9pondu ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchBtcDaily() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) });
    if (!res.ok) return null;
    const raw = await res.json();
    return raw.map((k) => ({ time: Math.round(k[0] / 1e3), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) })).filter((c) => Number.isFinite(c.close));
  } catch {
    return null;
  }
}
async function fetchBtcFunding() {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(1e4) });
    if (!res.ok) return null;
    const r = await res.json();
    const v = Number(r.lastFundingRate);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function fetchPrices(ids, coingeckoKey) {
  const uniq = [...new Set(ids)].filter(Boolean).slice(0, 90);
  if (!uniq.length) return {};
  const headers = {};
  if (coingeckoKey) headers["x-cg-demo-api-key"] = coingeckoKey;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniq.join(","))}&vs_currencies=usd,eur&include_24h_change=true`;
  const raw = await getJson(url, headers);
  const out = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p || typeof p !== "object") continue;
    const change = typeof p.usd_24h_change === "number" ? p.usd_24h_change : p.eur_24h_change;
    out[id] = { usd: typeof p.usd === "number" ? p.usd : void 0, eur: typeof p.eur === "number" ? p.eur : void 0, change: typeof change === "number" ? change : void 0 };
  }
  return out;
}
async function fetchFearGreed() {
  try {
    const raw = await getJson("https://api.alternative.me/fng/?limit=1&format=json", {});
    const d = raw.data?.[0];
    if (!d || d.value == null) return null;
    const value = Number(d.value);
    if (!Number.isFinite(value)) return null;
    const LABELS = { "Extreme Fear": "Peur extr\xEAme", Fear: "Peur", Neutral: "Neutre", Greed: "Avidit\xE9", "Extreme Greed": "Avidit\xE9 extr\xEAme" };
    return { value, label: LABELS[d.value_classification ?? ""] ?? d.value_classification ?? "" };
  } catch {
    return null;
  }
}
async function fetchMvrv() {
  try {
    const res = await fetch("https://bitcoin-data.com/v1/mvrv/zscore", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) return null;
    const r = await res.json();
    const v = Number(r.mvrv);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
async function fetchStablecoinShare(coingeckoKey) {
  try {
    const headers = {};
    if (coingeckoKey) headers["x-cg-demo-api-key"] = coingeckoKey;
    const [stableRes, globalRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=100&page=1`, { headers: { ...headers, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) }),
      fetch(`https://api.coingecko.com/api/v3/global`, { headers: { ...headers, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) })
    ]);
    if (!stableRes.ok || !globalRes.ok) return null;
    const stables = await stableRes.json();
    const global = await globalRes.json();
    const cap = stables.reduce((sum, c) => sum + (Number(c.market_cap) || 0), 0);
    const total = global.data?.total_market_cap?.usd ?? 0;
    if (!(cap > 0) || !(total > 0) || cap > total) return null;
    return cap / total * 100;
  } catch {
    return null;
  }
}

// src/runner/telegram.ts
async function post(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    const why = j.description ? ` : ${j.description}` : "";
    if (/chat not found/i.test(why)) throw new Error("Telegram : conversation introuvable \u2014 envoie un message \xE0 ton bot, puis relance avec --discover.");
    throw new Error(`Telegram a refus\xE9 ${method}${why || ` (r\xE9ponse ${res.status})`}.`);
  }
  return j.result;
}
async function sendMessage(token, chatId, text) {
  if (text.length > 4096) text = `${text.slice(0, 4090)}
\u2026`;
  await post(token, "sendMessage", { chat_id: chatId, text });
}
async function recentChats(token) {
  const r = await post(token, "getUpdates", { timeout: 0, limit: 20 });
  const seen = /* @__PURE__ */ new Map();
  for (const u of r ?? []) {
    const c = u.message?.chat;
    if (!c || c.type !== "private") continue;
    const key = String(c.id);
    seen.set(key, { chatId: key, title: c.first_name ?? c.title ?? "", date: u.message?.date ?? 0 });
  }
  return [...seen.values()].sort((a, b) => b.date - a.date);
}

// src/api/http.ts
var HttpError = class extends Error {
  status;
  host;
  constructor(status, host, message) {
    super(message);
    this.status = status;
    this.host = host;
  }
};
var MIN_INTERVAL_MS = {
  "api.coingecko.com": 4500,
  "api.geckoterminal.com": 2100,
  "api.dexscreener.com": 250,
  "api.gopluslabs.io": 1200,
  "api.rugcheck.xyz": 700,
  "lite-api.jup.ag": 300,
  "mempool.space": 300,
  "yields.llama.fi": 150,
  "api.crypto.com": 300
};
var coingeckoHasKey = false;
var lastCall = /* @__PURE__ */ new Map();
var chains = /* @__PURE__ */ new Map();
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function intervalFor(host) {
  if (host === "api.coingecko.com" && coingeckoHasKey) return 2100;
  return MIN_INTERVAL_MS[host] ?? 0;
}
async function throttle(host) {
  const interval = intervalFor(host);
  if (!interval) return;
  const prev = chains.get(host) ?? Promise.resolve();
  const mine = prev.then(async () => {
    const wait = (lastCall.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
  });
  chains.set(host, mine.catch(() => void 0));
  await mine;
}
function friendly(status, host) {
  if (status === 429) {
    if (host.includes("coingecko")) return "CoinGecko limite le nombre de requ\xEAtes. Patiente une minute ou ajoute une cl\xE9 \xAB Demo \xBB gratuite dans R\xE9glages.";
    return `Trop de requ\xEAtes vers ${host}. R\xE9essaie dans un instant.`;
  }
  if (status === 401 || status === 403) return `Acc\xE8s refus\xE9 par ${host}.`;
  if (status === 404) return `Donn\xE9e introuvable sur ${host}.`;
  if (status >= 500) return `${host} est momentan\xE9ment indisponible.`;
  return `Erreur ${status} sur ${host}.`;
}
function retryPlan(status, retryAfter, attempt, maxRetries) {
  if (attempt >= maxRetries) return { retry: false, waitMs: 0 };
  if (status === 429) {
    if (attempt >= 1) return { retry: false, waitMs: 0 };
    const ra = Number(retryAfter);
    return { retry: true, waitMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1e3, 8e3) : 5e3 };
  }
  if (status === null) return { retry: true, waitMs: 800 * 2 ** attempt };
  if (status >= 500) return { retry: true, waitMs: 1200 * 2 ** attempt };
  return { retry: false, waitMs: 0 };
}
async function request(url, opts = {}) {
  const host = new URL(url).host;
  const retries = opts.retries ?? 2;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25e3);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { Accept: "application/json", ...opts.headers ?? {} },
        body: opts.body,
        signal: ctrl.signal
      });
      if (res.status === 429 || res.status >= 500) {
        const plan = retryPlan(res.status, res.headers.get("retry-after"), attempt, retries);
        if (plan.retry) {
          await sleep(plan.waitMs);
          continue;
        }
      }
      if (!res.ok) throw new HttpError(res.status, host, friendly(res.status, host));
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (opts.signal?.aborted) throw e;
      const plan = retryPlan(null, null, attempt, retries);
      if (plan.retry) {
        await sleep(plan.waitMs);
        continue;
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  if (lastErr instanceof Error && lastErr.name === "AbortError") throw new Error(`D\xE9lai d\xE9pass\xE9 en contactant ${host}.`);
  throw lastErr instanceof Error ? lastErr : new Error(`Impossible de joindre ${host}.`);
}
async function getJson2(url, opts = {}) {
  const res = await request(url, opts);
  return await res.json();
}
async function postJson(url, body, opts = {}) {
  const res = await request(url, {
    ...opts,
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts.headers ?? {} },
    body: JSON.stringify(body)
  });
  return await res.json();
}

// src/api/smartmoney.ts
var SOL_RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
var BS_HEADERS = { "User-Agent": "BoussoleCrypto/1.0 (+https://github.com/Nikola17/boussole-crypto)" };
var BLOCKSCOUT = { eth: "https://eth.blockscout.com", base: "https://base.blockscout.com" };
async function solRpc(method, params) {
  let lastErr;
  for (const rpc of SOL_RPCS) {
    try {
      const r = await postJson(rpc, { jsonrpc: "2.0", id: 1, method, params }, { timeoutMs: 2e4, retries: 1 });
      if (r.error) throw new Error(r.error.message);
      return r.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RPC Solana indisponible");
}
var MAX_TX = 6;
async function solanaMintInfos(mints) {
  const out = /* @__PURE__ */ new Map();
  if (!mints.length) return out;
  try {
    const r = await solRpc("getMultipleAccounts", [mints.slice(0, 100), { encoding: "jsonParsed" }]);
    for (const [i, acc] of (r?.value ?? []).entries()) {
      const info = acc?.data?.parsed?.info;
      if (info?.symbol) out.set(mints[i], { symbol: info.symbol, name: info.name ?? null });
    }
  } catch {
  }
  return out;
}
async function solanaEvents(wallet, sinceMs, nowMs) {
  const sigs = await solRpc("getSignaturesForAddress", [wallet.address, { limit: 20 }]);
  const fresh = sigs.filter((s) => !s.err && s.blockTime != null && s.blockTime * 1e3 > sinceMs && s.blockTime * 1e3 <= nowMs).slice(0, MAX_TX);
  if (!fresh.length) return [];
  const deltas = [];
  for (const s of fresh) {
    const tx = await solRpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null);
    if (!tx) continue;
    tx.signature = s.signature;
    tx.blockTime = s.blockTime ?? null;
    deltas.push(...solanaDeltas(tx, wallet.address));
  }
  if (!deltas.length) return [];
  const infos = await solanaMintInfos([...new Set(deltas.map((d) => d.mint))]);
  return deltas.map((d) => {
    const info = infos.get(d.mint) ?? { symbol: null, name: null };
    return {
      walletId: wallet.id,
      walletLabel: wallet.label,
      chain: "solana",
      side: d.delta > 0 ? "buy" : "sell",
      mint: d.mint,
      symbol: info.symbol,
      name: info.name,
      uiAmount: Math.abs(d.delta),
      txHash: d.hash,
      atMs: d.atMs
    };
  }).sort((a, b) => b.atMs - a.atMs);
}
async function blockscoutTransfers(chain, address, maxPages = 2) {
  const base = BLOCKSCOUT[chain];
  const rows = [];
  let params = {};
  for (let page = 0; page < maxPages && params; page++) {
    const url = new URL(`${base}/api/v2/addresses/${address}/token-transfers`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await getJson2(url.toString(), { headers: BS_HEADERS, timeoutMs: 2e4, retries: 1 });
    const items = r.items ?? [];
    if (!items.length) break;
    rows.push(...items);
    params = r.next_page_params ? Object.fromEntries(Object.entries(r.next_page_params).map(([k, v]) => [k, String(v)])) : null;
    const oldest = items[items.length - 1]?.timestamp ? Date.parse(items[items.length - 1].timestamp) : Number.NaN;
    if (!Number.isNaN(oldest)) params = oldest < Date.now() - 14 * 24 * 36e5 ? null : params;
  }
  return rows;
}
async function evmEvents(wallet, sinceMs) {
  if (wallet.chain !== "eth" && wallet.chain !== "base") return [];
  const rows = await blockscoutTransfers(wallet.chain, wallet.address);
  const recent = rows.filter((it) => it.timestamp && Date.parse(it.timestamp) >= sinceMs);
  if (!recent.length && !rows.length) return [];
  return evmDeltas(recent, wallet).map((d) => ({
    walletId: wallet.id,
    walletLabel: wallet.label,
    chain: wallet.chain,
    side: d.delta > 0 ? "buy" : "sell",
    mint: d.mint,
    symbol: d.symbol,
    name: d.name,
    uiAmount: Math.abs(d.delta),
    txHash: d.hash,
    atMs: d.atMs
  })).sort((a, b) => b.atMs - a.atMs);
}
async function fetchWalletEvents(wallet, sinceMs, nowMs = Date.now()) {
  try {
    if (wallet.chain === "solana") return await solanaEvents(wallet, sinceMs, nowMs);
    return await evmEvents(wallet, sinceMs);
  } catch {
    return [];
  }
}
async function fetchAllWalletEvents(wallets, sinceMs, nowMs = Date.now()) {
  const all = await Promise.all(wallets.slice(0, 12).map((w) => fetchWalletEvents(w, sinceMs, nowMs)));
  return all.flat().sort((a, b) => b.atMs - a.atMs);
}
var SOL_TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
async function walletHoldings(wallet, mints) {
  const wanted = new Set(mints.map((m) => m.toLowerCase()));
  const held = /* @__PURE__ */ new Set();
  if (!wanted.size) return held;
  if (wallet.chain === "solana") {
    for (const program of SOL_TOKEN_PROGRAMS) {
      try {
        const r = await solRpc("getTokenAccountsByOwner", [wallet.address, { programId: program }, { encoding: "jsonParsed" }]);
        for (const a of r?.value ?? []) {
          const mint = a.account.data.parsed.info.mint.toLowerCase();
          if (wanted.has(mint)) held.add(mint);
        }
      } catch {
      }
    }
    return held;
  }
  const base = BLOCKSCOUT[wallet.chain];
  if (!base) return held;
  try {
    const r = await getJson2(`${base}/api/v2/addresses/${wallet.address}/token-balances`, { headers: BS_HEADERS, timeoutMs: 2e4, retries: 1 });
    for (const it of r.items ?? []) {
      const a = it.token?.address?.toLowerCase();
      if (a && wanted.has(a) && it.value && BigInt(it.value) > 0n) held.add(a);
    }
  } catch {
  }
  return held;
}

// src/api/dex.ts
var NETWORKS = [
  { key: "solana", label: "Solana", dexscreener: "solana", goplusChainId: null },
  { key: "base", label: "Base", dexscreener: "base", goplusChainId: "8453" },
  { key: "eth", label: "Ethereum", dexscreener: "ethereum", goplusChainId: "1" },
  { key: "bsc", label: "BNB Chain", dexscreener: "bsc", goplusChainId: "56" },
  { key: "arbitrum", label: "Arbitrum", dexscreener: "arbitrum", goplusChainId: "42161" }
];
function networkByKey(key) {
  return NETWORKS.find((n2) => n2.key === key || n2.dexscreener === key);
}
var MAJORS = /* @__PURE__ */ new Set(["SOL", "WSOL", "WETH", "ETH", "USDC", "USDT", "WBNB", "BNB", "DAI", "CBBTC", "WBTC", "USDS", "USDE", "FDUSD", "USD1"]);
var n = (v) => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
function parsePools(json, source) {
  const tokens = /* @__PURE__ */ new Map();
  for (const t of json.included ?? []) tokens.set(t.id, t);
  const out = [];
  for (const p of json.data) {
    const a = p.attributes;
    const baseId = p.relationships?.base_token?.data?.id ?? "";
    const tok = tokens.get(baseId);
    const network = p.relationships?.network?.data?.id ?? baseId.split("_")[0];
    const symbol = tok?.attributes.symbol ?? a.name.split(" / ")[0];
    if (MAJORS.has(symbol.toUpperCase())) continue;
    const h24 = a.transactions?.h24 ?? {};
    const created = a.pool_created_at;
    out.push({
      id: p.id,
      network,
      poolAddress: a.address,
      dex: p.relationships?.dex?.data?.id ?? "",
      name: a.name,
      tokenAddress: tok?.attributes.address ?? baseId.slice(network.length + 1),
      tokenSymbol: symbol,
      tokenName: tok?.attributes.name ?? symbol,
      tokenImage: tok?.attributes.image_url && tok.attributes.image_url !== "missing.png" ? tok.attributes.image_url : void 0,
      coingeckoId: tok?.attributes.coingecko_coin_id ?? null,
      priceUsd: n(a.base_token_price_usd) ?? 0,
      fdvUsd: n(a.fdv_usd),
      mcapUsd: n(a.market_cap_usd),
      liquidityUsd: n(a.reserve_in_usd) ?? 0,
      volume24h: n(a.volume_usd?.h24) ?? 0,
      change1h: n(a.price_change_percentage?.h1),
      change6h: n(a.price_change_percentage?.h6),
      change24h: n(a.price_change_percentage?.h24),
      buys24h: h24.buys ?? 0,
      sells24h: h24.sells ?? 0,
      buyers24h: h24.buyers ?? null,
      sellers24h: h24.sellers ?? null,
      createdAt: created,
      ageHours: created ? (Date.now() - new Date(created).getTime()) / 36e5 : NaN,
      source
    });
  }
  return out;
}
var GT = "https://api.geckoterminal.com/api/v2";
async function getNewPools(network, page = 1) {
  const json = await getJson2(`${GT}/networks/${network}/new_pools?include=base_token&page=${page}`);
  return parsePools(json, "new");
}

// src/api/security.ts
var on = (v) => v === "1";
var LP_LOCKED_DANGER_PCT = 30;
var LP_LOCKED_OK_PCT = 80;
function finalize(flags, top10, holders, sources, opts = {}) {
  let score = 100;
  for (const f of flags) score -= f.severity === "danger" ? 35 : f.severity === "warn" ? 12 : 0;
  score = Math.max(0, score);
  const hasDanger = flags.some((f) => f.severity === "danger");
  const hasWarn = flags.some((f) => f.severity === "warn");
  let verdict;
  if (hasDanger || score < 40) verdict = "Danger";
  else if (opts.insufficient) verdict = "Donn\xE9es insuffisantes";
  else if (hasWarn || opts.partial || score < 75) verdict = "Prudence";
  else verdict = "Plut\xF4t sain";
  return { score, verdict, flags, top10HoldersPct: top10, holders, sources };
}
var EVM_KEY_FIELDS = ["is_honeypot", "is_open_source", "buy_tax", "sell_tax", "is_mintable", "owner_change_balance", "hidden_owner", "cannot_sell_all"];
var known = (v) => v !== void 0 && v !== null && v !== "";
function evmReportFrom(response, address) {
  const addr = address.toLowerCase();
  const d = response?.result?.[addr];
  if (!d) throw new Error("GoPlus ne conna\xEEt pas encore ce token (trop r\xE9cent ?).");
  const flags = [];
  const knownFields = EVM_KEY_FIELDS.filter((k) => known(d[k])).length;
  const insufficient = response?.code !== 1 || !known(d.is_honeypot) || !known(d.is_open_source) || knownFields < 6;
  if (insufficient) flags.push({ label: `Analyse incompl\xE8te : ${knownFields} contr\xF4les sur ${EVM_KEY_FIELDS.length} ont pu \xEAtre faits`, severity: "warn", detail: "GoPlus n\u2019a pas renvoy\xE9 assez d\u2019informations sur ce contrat. N\u2019en d\xE9duis rien de rassurant." });
  if (on(d.is_honeypot)) flags.push({ label: "Honeypot : impossible de revendre", severity: "danger" });
  if (on(d.cannot_sell_all)) flags.push({ label: "Impossible de tout revendre", severity: "danger" });
  const buyTax = Number(d.buy_tax ?? 0) * 100;
  const sellTax = Number(d.sell_tax ?? 0) * 100;
  if (sellTax > 10 || buyTax > 10) flags.push({ label: `Taxes \xE9lev\xE9es (achat ${buyTax.toFixed(0)} %, vente ${sellTax.toFixed(0)} %)`, severity: sellTax > 25 ? "danger" : "warn" });
  else if (sellTax > 0 || buyTax > 0) flags.push({ label: `Taxes : achat ${buyTax.toFixed(1)} %, vente ${sellTax.toFixed(1)} %`, severity: "warn" });
  if (on(d.is_mintable)) flags.push({ label: "Le cr\xE9ateur peut cr\xE9er de nouveaux tokens", severity: "warn" });
  if (on(d.owner_change_balance)) flags.push({ label: "Le propri\xE9taire peut modifier les soldes", severity: "danger" });
  if (on(d.hidden_owner)) flags.push({ label: "Propri\xE9taire cach\xE9", severity: "danger" });
  if (on(d.can_take_back_ownership)) flags.push({ label: "Le contr\xF4le du contrat peut \xEAtre repris", severity: "warn" });
  if (on(d.transfer_pausable)) flags.push({ label: "Les transferts peuvent \xEAtre suspendus", severity: "warn" });
  if (on(d.is_blacklisted)) flags.push({ label: "Liste noire d\u2019adresses possible", severity: "warn" });
  if (on(d.slippage_modifiable)) flags.push({ label: "Taxes modifiables par le propri\xE9taire", severity: "warn" });
  if (on(d.trading_cooldown)) flags.push({ label: "D\xE9lai impos\xE9 entre deux transactions", severity: "warn" });
  if (on(d.is_proxy)) flags.push({ label: "Contrat proxy (code modifiable)", severity: "warn" });
  if (on(d.honeypot_with_same_creator)) flags.push({ label: "Historique du cr\xE9ateur : il a d\xE9j\xE0 d\xE9ploy\xE9 un honeypot", severity: "danger", detail: "Le cr\xE9ateur de ce contrat a un ant\xE9c\xE9dent : un de ses tokens pr\xE9c\xE9dents emp\xEAchait de revendre." });
  const creatorPct = Number(d.creator_percent ?? Number.NaN);
  if (Number.isFinite(creatorPct)) {
    if (creatorPct >= 15) flags.push({ label: `Le cr\xE9ateur d\xE9tient ${creatorPct.toFixed(1)} % de l'offre`, severity: creatorPct >= 25 ? "danger" : "warn", detail: "Il peut casser le prix en vendant d\u2019un seul coup." });
  }
  const ownerPct = Number(d.owner_percent ?? Number.NaN);
  if (Number.isFinite(ownerPct)) {
    if (ownerPct >= 15) flags.push({ label: `Le propri\xE9taire du contrat d\xE9tient ${ownerPct.toFixed(1)} % de l'offre`, severity: ownerPct >= 25 ? "danger" : "warn" });
    else if (ownerPct > 0) flags.push({ label: `Le propri\xE9taire du contrat d\xE9tient ${ownerPct.toFixed(1)} % de l'offre`, severity: "ok" });
  }
  if (d.is_open_source === "0") flags.push({ label: "Code source non v\xE9rifi\xE9", severity: "danger" });
  const holders = d.holders ?? [];
  const top10 = holders.slice(0, 10).filter((h) => !h.is_locked && !(h.tag ?? "").toLowerCase().includes("burn")).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
  if (top10 > 50) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} % de l\u2019offre`, severity: "danger" });
  else if (top10 > 30) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} % de l\u2019offre`, severity: "warn" });
  const lp = d.lp_holders ?? [];
  if (lp.length) {
    const lockedPct = lp.filter((h) => h.is_locked || /burn|dead|null/i.test(h.tag ?? "")).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
    if (lockedPct < LP_LOCKED_DANGER_PCT) flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} % seulement`, severity: "danger", detail: "Le cr\xE9ateur peut retirer presque toute la liquidit\xE9 d\u2019un coup." });
    else if (lockedPct < 50) flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} % seulement`, severity: "warn" });
    else flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} %`, severity: "ok" });
  }
  if (!insufficient && !flags.some((f) => f.severity !== "ok")) flags.push({ label: "Aucun pi\xE8ge classique d\xE9tect\xE9", severity: "ok" });
  return finalize(flags, holders.length ? top10 : null, d.holder_count ? Number(d.holder_count) : null, ["GoPlus Security"], { insufficient });
}
async function scanEvm(chainId, address) {
  const addr = address.toLowerCase();
  const r = await getJson2(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr}`
  );
  return evmReportFrom(r, addr);
}
function solanaReportFrom(gp, rug) {
  const flags = [];
  const sources = [];
  let top10 = null;
  if (gp) {
    sources.push("GoPlus Security");
    if (on(gp.mintable?.status)) flags.push({ label: "Autorit\xE9 de mint active : offre illimit\xE9e possible", severity: "danger" });
    if (on(gp.freezable?.status)) flags.push({ label: "Autorit\xE9 de gel active : tes tokens peuvent \xEAtre bloqu\xE9s", severity: "danger" });
    if (on(gp.balance_mutable_authority?.status)) flags.push({ label: "Les soldes peuvent \xEAtre modifi\xE9s", severity: "danger" });
    if (on(gp.closable?.status)) flags.push({ label: "Le compte du token peut \xEAtre ferm\xE9", severity: "warn" });
    if (on(gp.metadata_mutable?.status)) flags.push({ label: "M\xE9tadonn\xE9es modifiables", severity: "warn" });
    if (on(gp.non_transferable)) flags.push({ label: "Token non transf\xE9rable", severity: "danger" });
    const holders = gp.holders ?? [];
    if (holders.length) {
      top10 = holders.slice(0, 10).filter((h) => !h.is_locked).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
      if (top10 > 50) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} %`, severity: "danger" });
      else if (top10 > 30) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} %`, severity: "warn" });
    }
  }
  if (rug) {
    sources.push("RugCheck");
    for (const risk of rug.risks ?? []) {
      const sev = risk.level === "danger" ? "danger" : "warn";
      if (!flags.some((f) => f.label.toLowerCase().includes(risk.name.toLowerCase().slice(0, 8)))) {
        flags.push({ label: risk.name, severity: sev, detail: risk.description });
      }
    }
    if (rug.lpLockedPct != null) {
      const p = rug.lpLockedPct;
      flags.push({
        label: `Liquidit\xE9 verrouill\xE9e : ${p.toFixed(0)} %`,
        severity: p >= LP_LOCKED_OK_PCT ? "ok" : p >= LP_LOCKED_DANGER_PCT ? "warn" : "danger",
        detail: p < LP_LOCKED_DANGER_PCT ? "Le cr\xE9ateur peut retirer presque toute la liquidit\xE9 d\u2019un coup." : void 0
      });
    }
  }
  if (!sources.length) throw new Error("Scan indisponible pour ce token pour le moment.");
  const partial = sources.length < 2;
  if (partial) flags.push({ label: `Une seule source a r\xE9pondu (${sources[0]}) : analyse incompl\xE8te`, severity: "warn" });
  if (!partial && !flags.some((f) => f.severity !== "ok")) flags.push({ label: "Aucun pi\xE8ge classique d\xE9tect\xE9", severity: "ok" });
  return finalize(flags, top10, null, sources, { partial });
}
async function scanSolana(mint) {
  let gp = null;
  let rug = null;
  try {
    const r = await getJson2(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { retries: 1 });
    gp = r.result?.[mint] ?? Object.values(r.result ?? {})[0] ?? null;
  } catch {
  }
  try {
    rug = await getJson2(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { retries: 1 });
  } catch {
  }
  return solanaReportFrom(gp, rug);
}

// src/lib/emerging.ts
var EMERGING_RULES = {
  /** Plus de 7 jours : ce n'est plus une émergente, c'est une position du DEX ordinaire. */
  maxAgeHours: 7 * 24,
  /** Moins de 25 k $ de liquidité : impossible de sortir sans casser le prix. */
  minLiquidityUsd: 25e3,
  /** Moins de 75 k $ échangés en 24 h : personne n'y est, ou pas naturellement. */
  minVolumeUsd: 75e3,
  /** Les achats doivent dominer les ventes de 15 % au moins. */
  buyPressure: 1.15
};
var within = (v, min, max) => Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
function emergingCandidates(pools, max = 8) {
  const out = [];
  for (const p of pools) {
    if (p.network !== "solana" && p.network !== "base") continue;
    if (isStable(p.tokenSymbol) || isWrappedOrStaked(p.tokenSymbol, p.tokenName)) continue;
    if (p.ageHours > EMERGING_RULES.maxAgeHours) continue;
    if (p.liquidityUsd < EMERGING_RULES.minLiquidityUsd) continue;
    if (p.volume24h < EMERGING_RULES.minVolumeUsd) continue;
    const total = p.buys24h + p.sells24h;
    if (total < 40) continue;
    const buyShare = p.buys24h / total;
    if (p.buys24h < p.sells24h * EMERGING_RULES.buyPressure) continue;
    if ((p.change24h ?? 0) < 5) continue;
    const reasons = [];
    reasons.push(`${p.ageHours < 24 ? `${Math.round(p.ageHours)} h` : `${Math.round(p.ageHours / 24)} j`} d'\xE2ge`);
    reasons.push(`${Math.round(buyShare * 100)} % d'achats (24 h)`);
    if (p.change24h != null && p.change24h > 30 && p.change24h < 400) reasons.push(`+${Math.round(p.change24h)} % sur 24 h`);
    const activity = within(p.volume24h / Math.max(1, p.liquidityUsd), 0.5, 4);
    const pressure = (buyShare - 0.5) / 0.5 * 100;
    const freshness = within(EMERGING_RULES.maxAgeHours - p.ageHours, 0, EMERGING_RULES.maxAgeHours - 24);
    const traction = Math.round(0.45 * activity + 0.35 * Math.max(0, Math.min(100, pressure)) + 0.2 * freshness);
    out.push({ pool: p, traction, reasons });
  }
  return out.sort((a, b) => b.traction - a.traction || b.pool.volume24h - a.pool.volume24h).slice(0, max);
}
function emergingLine(c, extra) {
  const p = c.pool;
  const net = p.network === "solana" ? "Solana" : "Base";
  const vol = p.volume24h >= 1e6 ? `${(p.volume24h / 1e6).toFixed(1)} M $` : `${Math.round(p.volume24h / 1e3)} k $`;
  const parts = [`${p.tokenSymbol.toUpperCase()} (${net}, ${c.reasons[0]}, vol ${vol}, ${c.reasons[1]}`];
  if (extra?.security) parts[0] += `, ${extra.security}`;
  let out = parts[0] + ")";
  if (extra?.wallets?.length) out += ` \u2014 wallet suivi : ${extra.wallets.join(", ")}`;
  return out;
}

// src/runner/ai.ts
var TIMEOUT_MS3 = 25e3;
function newsPrompt(items) {
  const lines = items.map((i, n2) => `${n2 + 1}. [${i.coinName}] ${i.title} (${i.source}) \u2014 ${i.summaryText}`).join("\n");
  return [
    "Tu es analyste crypto pour un investisseur particulier fran\xE7ais. Chaque entr\xE9e ci-dessous est une actualit\xE9 r\xE9elle.",
    "Pour CHAQUE entr\xE9e, note son importance pour un d\xE9tenteur de cette crypto :",
    "- 1-3 : bruit, promo, opinion sans cons\xE9quence ;",
    "- 4-5 : information utile mais sans effets directs attendus ;",
    "- 6-7 : \xE0 conna\xEEtre (partenariat, Graham r\xE9glementaire, produit, adoption) ;",
    "- 8-10 : peut bouger le prix ou la s\xE9curit\xE9 (hack, proc\xE8s, interdiction, listing majeur, ETF\u2026).",
    "R\xE9ponds UNIQUEMENT un tableau JSON (bloc ```json), une entr\xE9e par actu dans l\u2019ordre :",
    '[{"n": 1, "importance": 6, "resume": "R\xE9sum\xE9 en 3 phrases courtes en fran\xE7ais : ce qui s\u2019est pass\xE9, pourquoi c\u2019est important, ce que le d\xE9tenteur peut faire."}]',
    "",
    lines
  ].join("\n");
}
function parseNewsRatings(text, n2) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i) ?? [null, text];
  const candidate = block[1] ?? "";
  const arr = candidate.slice(candidate.indexOf("["), candidate.lastIndexOf("]") + 1);
  try {
    const raw = JSON.parse(arr);
    const out = [];
    for (let i = 0; i < n2; i++) {
      const r = raw.find((x) => Number(x.n) === i + 1) ?? raw[i];
      const importance = Number(r?.importance);
      out.push({ importance: Number.isFinite(importance) ? Math.max(0, Math.min(10, importance)) : 0, resume: typeof r?.resume === "string" ? r.resume.trim() : "" });
    }
    return out;
  } catch {
    return Array.from({ length: n2 }, () => ({ importance: 0, resume: "" }));
  }
}
async function rateNews(apiKey, model, items) {
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: newsPrompt(items.slice(0, 8)) }], temperature: 0.2 }),
      signal: AbortSignal.timeout(TIMEOUT_MS3)
    });
    if (!res.ok) return Array.from({ length: items.length }, () => ({ importance: 0, resume: "" }));
    const j = await res.json();
    const text = j.choices?.[0]?.message?.content ?? "";
    return parseNewsRatings(text, items.length);
  } catch {
    return Array.from({ length: items.length }, () => ({ importance: 0, resume: "" }));
  }
}

// src/runner/main.ts
var log = (msg) => {
  const when = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  process.stdout.write(`${when} ${msg}
`);
};
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
function parseArgs(argv) {
  let configPath = "";
  let mode = "loop";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" || a === "-c") configPath = argv[++i] ?? "";
    else if (a === "--once") mode = "once";
    else if (a === "--check") mode = "check";
    else if (a === "--brief") mode = "brief";
    else if (a === "--discover") mode = "discover";
    else if (a === "--help" || a === "-h") mode = "check";
    else throw new Error(`Option inconnue : ${a}. Options : --config <chemin>, --once, --check, --brief, --discover.`);
  }
  if (!configPath) configPath = join(homedir(), ".config", "boussole", "runner.json");
  return { configPath, mode };
}
function loadConfig(path, allowMissingChatId) {
  const raw = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
  const { config, problems } = validateConfig(applyEnv(raw), { allowMissingChatId });
  if (!config) throw new Error(`Configuration incompl\xE8te (${path}) :
- ${problems.join("\n- ")}`);
  return config;
}
var defaultStateDir = () => join(homedir(), ".local", "state", "boussole");
var stateFileOf = (cfg) => join(cfg.stateDir || defaultStateDir(), "runner-state.json");
function loadState(cfg) {
  const p = stateFileOf(cfg);
  return existsSync(p) ? parseState(readFileSync(p, "utf-8")) : emptyState();
}
function saveState(cfg, st) {
  const dir = cfg.stateDir || defaultStateDir();
  mkdirSync(dir, { recursive: true });
  const p = stateFileOf(cfg);
  writeFileSync(p, JSON.stringify(st, null, 2));
  try {
    chmodSync(p, 384);
  } catch {
  }
}
var btcDailyCache = null;
async function cachedBtcDaily() {
  if (!btcDailyCache || Date.now() - btcDailyCache.at > 90 * 6e4) {
    const data = await fetchBtcDaily();
    if (data) btcDailyCache = { at: Date.now(), data };
  }
  return btcDailyCache?.data ?? null;
}
var slowMetricsCache = null;
async function cachedSlowMetrics(cfg) {
  if (!slowMetricsCache || Date.now() - slowMetricsCache.at > 6 * 60 * 6e4) {
    const [mvrv, stableShare] = await Promise.all([fetchMvrv().catch(() => null), fetchStablecoinShare(cfg.coingeckoKey).catch(() => null)]);
    if (mvrv != null || stableShare != null || !slowMetricsCache) slowMetricsCache = { at: Date.now(), mvrv, stableShare };
  }
  return { mvrv: slowMetricsCache?.mvrv ?? null, stableShare: slowMetricsCache?.stableShare ?? null };
}
var fngCache = null;
async function cachedFng() {
  if (!fngCache || Date.now() - fngCache.at > 30 * 6e4) {
    const data = await fetchFearGreed();
    if (data) fngCache = { at: Date.now(), data };
  }
  return fngCache?.data ?? null;
}
var newsCache = null;
async function cachedNews(coins) {
  const sig = coins.map((c) => c.coinId).join(",");
  if (!newsCache || Date.now() - newsCache.at > 45 * 6e4 || newsCache.coins !== sig) {
    const results = await Promise.allSettled(coins.map((c) => fetchCoinNews(c, 18 * 36e5)));
    const items = results.flatMap((r) => r.status === "fulfilled" ? r.value : []).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 24);
    if (items.length || !newsCache) newsCache = { at: Date.now(), coins: sig, items };
  }
  return newsCache?.items ?? [];
}
async function emergingDigest(wallets) {
  const settled = await Promise.allSettled([getNewPools("solana"), getNewPools("base")]);
  const pools = settled.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  if (!pools.length) return [];
  const lines = [];
  for (const c of emergingCandidates(pools, 3)) {
    let security;
    try {
      const net = networkByKey(c.pool.network);
      const r = net?.goplusChainId ? await scanEvm(net.goplusChainId, c.pool.tokenAddress) : await scanSolana(c.pool.tokenAddress);
      security = `scan : ${r.verdict.toLowerCase()}`;
    } catch {
      security = void 0;
    }
    const followed = [];
    for (const w of wallets.slice(0, 8)) {
      try {
        if ((await walletHoldings(w, [c.pool.tokenAddress])).size > 0) followed.push(w.label);
      } catch {
      }
    }
    lines.push(emergingLine(c, { security, wallets: followed }));
  }
  return lines;
}
var depsOf = (cfg) => ({
  fetchRemote: () => fetchRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken),
  pushRemote: (text, sha) => pushRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken, text, sha),
  telegram: (text) => sendMessage(cfg.telegramToken, cfg.telegramChatId, text),
  prices: (ids) => fetchPrices(ids, cfg.coingeckoKey),
  fearGreed: () => cachedFng(),
  btcDaily: () => cachedBtcDaily(),
  funding: () => fetchBtcFunding(),
  mvrv: async () => (await cachedSlowMetrics(cfg)).mvrv,
  stableShare: async () => (await cachedSlowMetrics(cfg)).stableShare,
  news: (coins) => cfg.newsEnabled ? cachedNews(coins) : Promise.resolve([]),
  aiRates: (items) => cfg.mistralApiKey ? rateNews(cfg.mistralApiKey, cfg.mistralModel, items) : Promise.resolve(items.map(() => ({ importance: 0, resume: "" }))),
  smartEvents: (wallets, sinceMs, nowMs) => cfg.smartMoneyEnabled ? fetchAllWalletEvents(wallets, sinceMs, nowMs) : Promise.resolve([]),
  emerging: (wallets) => cfg.emergingEnabled ? emergingDigest(wallets) : Promise.resolve([])
});
async function modeCheck(cfg) {
  const { result } = await runCycle(cfg, loadState(cfg), { dry: true, forceBrief: true, onDry: (text) => log(`[\xE0 blanc] ${text.split("\n").join(" \u2014 ")}`) }, depsOf(cfg));
  log(`Diagnostic : ${result.error == null ? `pr\xEAt (alertes arm\xE9es : ${result.watching})` : `un probl\xE8me subsiste (${result.error})`}.`);
}
async function modeMain(cfg, mode) {
  if (mode === "discover") {
    const chats = await recentChats(cfg.telegramToken);
    if (!chats.length) {
      log("Aucune conversation priv\xE9e vue par le bot. Ouvre Telegram, \xE9cris \xAB /start \xBB \xE0 ton bot, puis relance --discover.");
      return;
    }
    for (const c of chats) log(`Chat id : ${c.chatId}${c.title ? ` (${c.title})` : ""} \u2014 ajoute "telegramChatId": "${c.chatId}" dans la configuration.`);
    if (cfg.telegramChatId) {
      await sendMessage(cfg.telegramToken, cfg.telegramChatId, "Boussole parle depuis ton serveur : la surveillance est bien raccord\xE9e.");
      log("Message de test envoy\xE9.");
    }
    return;
  }
  const run = async () => {
    const { state, result } = await runCycle(cfg, loadState(cfg), { dry: false, forceBrief: mode === "brief" }, depsOf(cfg));
    saveState(cfg, state);
    if (result.sent) log(`${result.sent} message${result.sent > 1 ? "s" : ""} envoy\xE9${result.sent > 1 ? "s" : ""}${result.consumed ? `, ${result.consumed} alerte${result.consumed > 1 ? "s" : ""} consomm\xE9e${result.consumed > 1 ? "s" : ""} dans la synchronisation` : ""}.`);
    if (result.error) log(`\xC9chec : ${result.error}`);
  };
  if (mode === "once" || mode === "brief") {
    await run();
    return;
  }
  log(`Surveillance d\xE9marr\xE9e : contr\xF4le toutes les ${cfg.intervalMinutes} min ${cfg.timeZone}. Briefs : ${cfg.briefEnabled ? `matin ${cfg.briefHour} h` : "matin d\xE9sactiv\xE9"}${cfg.briefUsOpen ? ", ouverture US (9 h 30 New York)" : ""}${cfg.briefUsClose ? ", cl\xF4ture US (16 h New York)" : ""}. Veille presse : ${cfg.newsEnabled ? `activ\xE9e${cfg.mistralApiKey ? " (r\xE9sum\xE9s IA)" : " (heuristique, sans cl\xE9 IA)"}` : "d\xE9sactiv\xE9e"}. Smart money : ${cfg.smartMoneyEnabled ? "activ\xE9" : "d\xE9sactiv\xE9"}${cfg.emergingEnabled ? ", digest \xE9mergentes dans le brief du matin" : ""}. Source : ${cfg.syncRepo}/${cfg.syncPath} (chiffr\xE9 de bout en bout).`);
  for (; ; ) {
    try {
      await run();
    } catch (e) {
      log(`\xC9chec du cycle : ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep2(cfg.intervalMinutes * 6e4);
  }
}
async function main() {
  const { configPath, mode } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(configPath, mode === "discover");
  log(`Configuration : d\xE9p\xF4t ${cfg.syncRepo}, devise ${cfg.currency}, appareil \xAB ${cfg.device} \xBB, brief ${cfg.briefEnabled ? `${cfg.briefHour} h` : "d\xE9sactiv\xE9"} ${cfg.timeZone}.`);
  if (mode === "check") await modeCheck(cfg);
  else await modeMain(cfg, mode);
}
process.on("SIGINT", () => {
  log("Arr\xEAt demand\xE9 (SIGINT).");
  process.exit(0);
});
process.on("SIGTERM", () => {
  log("Arr\xEAt demand\xE9 (SIGTERM).");
  process.exit(0);
});
main().catch((e) => {
  log(`Erreur fatale : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
