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
  const clean = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) throw new Error("D\xE9p\xF4t mal form\xE9 : attends \xAB utilisateur/d\xE9p\xF4t \xBB (ex : Nikola17/boussole-sync).");
  return `https://api.github.com/repos/${clean}/contents/${path}`;
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
  set("stateDir", "BOUSSOLE_STATE_DIR");
  return out;
}

// src/runner/state.ts
var DAY_MS = 24 * 36e5;
var SENT_RETENTION_MS = 30 * DAY_MS;
var RUNG_REPEAT_MS = 7 * DAY_MS;
function emptyState() {
  return { sent: {}, lastBriefDay: null, okAt: null, attemptAt: null, error: null };
}
function parseState(json) {
  if (!json) return emptyState();
  try {
    const r = JSON.parse(json);
    const sent = r.sent && typeof r.sent === "object" && !Array.isArray(r.sent) ? r.sent : {};
    const out = { sent: {}, lastBriefDay: typeof r.lastBriefDay === "string" ? r.lastBriefDay : null, okAt: typeof r.okAt === "number" ? r.okAt : null, attemptAt: typeof r.attemptAt === "number" ? r.attemptAt : null, error: typeof r.error === "string" ? r.error : null };
    for (const [k, v] of Object.entries(sent)) if (typeof v === "number" && Number.isFinite(v)) out.sent[k] = v;
    return out;
  } catch {
    return emptyState();
  }
}
function pruneSent(state, now) {
  const kept = {};
  let changed = false;
  for (const [k, at] of Object.entries(state.sent)) {
    if (now - at > SENT_RETENTION_MS) changed = true;
    else kept[k] = at;
  }
  return changed ? { ...state, sent: kept } : state;
}
function shouldSend(state, key, now, repeatMs = null) {
  const at = state.sent[key];
  if (at == null) return true;
  if (repeatMs == null) return false;
  return now - at >= repeatMs;
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
function randomBytes(n) {
  const out = new Uint8Array(n);
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

// src/lib/thresholds.ts
var MIN_RUNG_VALUE_USD = 20;

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
  return { alerts: list2("alerts"), transactions: list2("transactions"), theses: list2("theses"), exitDone };
}
var alertKey = (id) => `alert:${id}`;
var rungKey = (coinId, multiple) => `exit:${coinId}:${multiple}`;
function hitAlerts(watch, prices) {
  return checkPriceAlerts(watch.alerts, prices);
}
function alertMessage(a, price) {
  const side = a.condition === "above" ? "au-dessus" : "en dessous";
  return `Alerte ${a.symbol.toUpperCase()}
${a.name} est pass\xE9 ${side} de ${fmtPrice(a.priceUsd, "USD")} (cours : ${fmtPrice(price, "USD")}).`;
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
function rungMessage(t) {
  return `Palier \xD7${t.multiple} atteint sur ${t.symbol.toUpperCase()}
Vends ${t.pct} % de ta position de d\xE9part : ce palier a \xE9t\xE9 fix\xE9 \xE0 froid (\u2248 ${fmtPrice(t.valueUsd, "USD")} \xE0 vendre). Ouvre Boussole.`;
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

// src/runner/brief.ts
var HEAD_TOP = 3;
var list = (v) => Array.isArray(v) ? v : [];
function buildBrief(i) {
  const lines = [];
  const watch = watchOf(i.bundle);
  const today = isoDay(i.now);
  const cur = i.currency;
  lines.push(`Boussole \u2014 brief du ${fmtDate(i.now)}`);
  const btc = i.prices.bitcoin;
  const market = [];
  if (i.fng) market.push(`Fear & Greed ${i.fng.value} (${i.fng.label})`);
  if (btc?.usd != null) market.push(`BTC ${fmtPrice(btc.usd, "USD")}${btc.change != null ? ` (${fmtPct(btc.change, 1, true)} / 24 h)` : ""}`);
  lines.push(market.length ? `March\xE9 : ${market.join(" \xB7 ")}` : "March\xE9 : donn\xE9es indisponibles pour l\u2019instant.");
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
  if (upcoming.length) lines.push(`Prochaine \xE9ch\xE9ance : ${upcoming.join(" \xB7 ")}`);
  if (!due.length && !upcoming.length) lines.push("Aucune \xE9ch\xE9ance DCA programm\xE9e.");
  const usd = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(i.prices)) if (typeof p?.usd === "number" && p.usd > 0) usd.set(id, p.usd);
  const rungs = hitRungs(watch, usd);
  if (rungs.length) lines.push(`Paliers atteints non vendus : ${rungs.map((r) => `${r.symbol.toUpperCase()} \xD7${r.multiple} (vends ${r.pct} %)`).join(" \xB7 ")}`);
  const armed = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
  lines.push(`Alertes arm\xE9es : ${armed}`);
  if (i.syncSavedAt) {
    const when = new Date(i.syncSavedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`Donn\xE9es de synchronisation : ${fmtDate(when, true)}${i.syncDevice ? ` (${i.syncDevice})` : ""}`);
  }
  return lines.join("\n");
}

// src/runner/cycle.ts
function coinsOf(bundle, watch) {
  const ids = /* @__PURE__ */ new Set(["bitcoin"]);
  for (const coinId of buildPositions(watch.transactions).keys()) if (coinId) ids.add(coinId);
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
  const priceRows = await deps.prices(coinsOf(bundle, watch));
  const priceMap = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(priceRows)) if (typeof p.usd === "number" && p.usd > 0) priceMap.set(id, p.usd);
  result.watching = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
  const queue = [];
  for (const { alert, price } of hitAlerts(watch, priceMap)) {
    const key = alertKey(alert.id);
    if (shouldSend(state, key, nowMs)) queue.push({ key, text: alertMessage(alert, price), alertId: alert.id });
  }
  for (const t of hitRungs(watch, priceMap)) {
    const key = rungKey(t.coinId, t.multiple);
    if (shouldSend(state, key, nowMs, RUNG_REPEAT_MS)) queue.push({ key, text: rungMessage(t) });
  }
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
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
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
  const dueBrief = opts.forceBrief || cfg.briefEnabled && now.getHours() >= cfg.briefHour && state.lastBriefDay !== dayKey;
  if (dueBrief) {
    const brief = buildBrief({ now, bundle, prices: priceRows, fng: await deps.fearGreed(), currency: cfg.currency, syncSavedAt: bundle.savedAt ?? null, syncDevice: bundle.device ?? null });
    try {
      await send(brief);
      if (!opts.dry) state = { ...state, lastBriefDay: dayKey };
    } catch (e) {
      result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  state = recordStatus(state, result.error == null, result.error, nowMs);
  return { state, result };
}

// src/runner/market.ts
var TIMEOUT_MS = 2e4;
async function getJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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

// src/runner/main.ts
var log = (msg) => {
  const when = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  process.stdout.write(`${when} ${msg}
`);
};
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
var depsOf = (cfg) => ({
  fetchRemote: () => fetchRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken),
  pushRemote: (text, sha) => pushRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken, text, sha),
  telegram: (text) => sendMessage(cfg.telegramToken, cfg.telegramChatId, text),
  prices: (ids) => fetchPrices(ids, cfg.coingeckoKey),
  fearGreed: () => fetchFearGreed()
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
  log(`Surveillance d\xE9marr\xE9e : contr\xF4le toutes les ${cfg.intervalMinutes} min, brief ${cfg.briefEnabled ? `\xE0 ${cfg.briefHour} h` : "d\xE9sactiv\xE9"} ${cfg.timeZone}. Source : ${cfg.syncRepo}/${cfg.syncPath} (chiffr\xE9 de bout en bout).`);
  for (; ; ) {
    try {
      await run();
    } catch (e) {
      log(`\xC9chec du cycle : ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(cfg.intervalMinutes * 6e4);
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
