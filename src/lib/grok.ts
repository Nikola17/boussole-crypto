// Pont avec Grok : prépare le prompt (tes positions, l'état du marché, tes règles), lit la réponse (bloc JSON final)
// et contrôle chaque ordre proposé avec les mêmes règles que celles de Boussole.

import type { BasketPlan, CoinRef } from '../types';
import type { BasketContext } from './basket';

export interface GrokPromptInput {
  date: string;
  temperature: number | null;
  zone: string;
  fng: number | null;
  btcPriceUsd: number | null;
  btcBelowAthPct: number | null;
  budgetUsd: number;
  discoveryMaxPct: number;
  reserveUsd: number;
  positions: { symbol: string; valueUsd: number; pct: number }[];
  core: { symbol: string; weight: number }[];
  discovery: string[];
  minLinePct: number;
  maxPerGemPct: number;
  minOrderUsd: number;
}

const n0 = (x: number) => Math.round(x).toLocaleString('fr-FR');
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('fr-FR');

export function buildGrokPrompt(i: GrokPromptInput): string {
  const positions = i.positions.length ? i.positions.map((p) => `  - ${p.symbol} : ${n0(p.valueUsd)} $ · ${n1(p.pct)} %`).join('\n') : '  - (aucune position enregistrée)';
  const core = i.core.length ? i.core.map((c) => `${c.symbol} ${n0(c.weight)} %`).join(', ') : 'aucun';
  return `Tu es mon analyste de marché pour un DCA moyen et long terme (pas de trading court terme).
Réponds en français.

CONTEXTE (fourni par Boussole le ${i.date})
- Marché : température ${i.temperature != null ? Math.round(i.temperature) : 'inconnue'}/100 (${i.zone}), Fear & Greed ${i.fng != null ? Math.round(i.fng) : 'inconnu'}/100, Bitcoin à ${i.btcPriceUsd != null ? n0(i.btcPriceUsd) : '?'} $ (${i.btcBelowAthPct != null ? n1(Math.abs(i.btcBelowAthPct)) : '?'} % sous son record).
- Budget de cette échéance : ${n1(i.budgetUsd)} USDC. Part « découverte » maximale : ${n0(i.discoveryMaxPct)} % (réduite quand mes altcoins approchent de ma cible).
- Réserve USDC disponible : ${n1(i.reserveUsd)} USDC.
- Mes positions (valeur en USD · part du portefeuille) :
${positions}
- Panier « classique » (poids cibles) : ${core}.
- Liste « découverte » actuelle (${i.discovery.length} sur 5 maximum) : ${i.discovery.length ? i.discovery.join(', ') : 'vide'}.

MES RÈGLES (non négociables)
1. Au plus 2 ordres par échéance : 1 « classique » et 1 « découverte ».
2. Un seul achat « découverte » par échéance. On finit une ligne avant d'en ouvrir une autre : une ligne doit peser au moins ${n1(i.minLinePct)} % du portefeuille.
3. Aucune ligne « découverte » ne dépasse ${n1(i.maxPerGemPct)} % du portefeuille.
4. Pas d'achat d'un token qui a pris plus de 50 % en 7 jours.
5. Aucun ordre inférieur à ${n1(i.minOrderUsd)} USDC.
6. Le token doit être disponible dans l'application Crypto.com. Si tu n'en es pas sûr, écris « disponibilité non vérifiée ».
7. J'exclus les tokens opaques, manipulables ou illiquides.
8. Si rien ne passe les critères, ne force pas l'achat : propose de mettre le montant en réserve.

RECHERCHE OBLIGATOIRE pour chaque token envisagé
1. Variation du prix sur 24 h, 7 j, 30 j, 200 j et 1 an.
2. Capitalisation, rang et volume sur 24 h.
3. Rapport volume / capitalisation.
4. Liquidité réelle et profondeur du carnet d'ordres.
5. Rapport FDV / capitalisation.
6. Calendrier des déblocages de tokens (dates et montants).
7. Concentration des principaux portefeuilles.
8. Activité des développeurs et évolution du protocole.
9. Revenus, frais, TVL ou utilisateurs, quand c'est pertinent.
10. Cotations sur les grandes plateformes centralisées et décentralisées.
11. Tendance de recherche et activité sur X.
12. Risques : piratage, inflation, déblocages, faible liquidité, valorisation excessive, centralisation, dépendance au battage médiatique.

FIABILITÉ
- N'invente aucune donnée. Si tu n'as pas la source, écris « non vérifié ».
- Distingue clairement les FAITS (avec la source), les ESTIMATIONS et les OPINIONS.
- Signale les désaccords entre sources.

FORMAT DE LA RÉPONSE
1. Analyse du marché en 5 lignes maximum.
2. Les ordres proposés, chacun avec la raison et les risques principaux.
3. Ma liste « découverte » mise à jour (5 tokens au plus).
4. Pour finir, un bloc JSON valide, et rien après lui :

\`\`\`json
{
  "date": "AAAA-MM-JJ",
  "marche": "une phrase",
  "ordres": [
    { "jeton": "BTC", "type": "classique", "montant_usdc": 12.5, "raison": "…" },
    { "jeton": "SUI", "type": "decouverte", "montant_usdc": 12.5, "raison": "…" }
  ],
  "reserve_usdc": 0,
  "liste_decouverte": ["SUI", "…"],
  "alertes": ["…"],
  "non_verifie": ["…"]
}
\`\`\``;
}

// ------------------------------------------------------------------ Lecture de la réponse

export interface GrokOrder {
  symbol: string;
  kind: 'core' | 'discovery' | 'unknown';
  usd: number;
  reason: string;
}

export interface GrokReply {
  market: string;
  orders: GrokOrder[];
  discoveryList: string[];
  alerts: string[];
  unverified: string[];
  reserveUsd: number | null;
}

function lastJsonObject(text: string): string | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim()).filter((s) => s.startsWith('{'));
  if (fenced.length) return fenced[fenced.length - 1];
  // Sans balises : dernier objet équilibré qui contient « ordres » ou « orders ».
  for (let end = text.lastIndexOf('}'); end > 0; end = text.lastIndexOf('}', end - 1)) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      if (text[i] === '}') depth++;
      else if (text[i] === '{' && --depth === 0) {
        const s = text.slice(i, end + 1);
        if (/"(ordres|orders)"/.test(s)) return s;
        break;
      }
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const strList = (v: unknown): string[] => (Array.isArray(v)
  ? v.map((x) => (typeof x === 'object' && x ? str((x as Record<string, unknown>).jeton ?? (x as Record<string, unknown>).symbol) : str(x))).filter(Boolean)
  : []);

function kindOf(v: unknown): GrokOrder['kind'] {
  const s = str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/classique|core|c[oœ]e?ur|base/.test(s)) return 'core';
  if (/decouverte|discovery|explor/.test(s)) return 'discovery';
  return 'unknown';
}

/** Lit le bloc JSON de la réponse de Grok (clés françaises ou anglaises) ; null si rien d'exploitable. */
export function parseGrokReply(text: string): GrokReply | null {
  const raw = lastJsonObject(text);
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  const list = (obj.ordres ?? obj.orders) as unknown;
  if (!Array.isArray(list)) return null;
  const orders: GrokOrder[] = [];
  for (const o of list as Record<string, unknown>[]) {
    const symbol = str(o.jeton ?? o.token ?? o.symbole ?? o.symbol).toUpperCase();
    const usd = num(o.montant_usdc ?? o.montant ?? o.usdc ?? o.amount ?? o.usd);
    if (symbol && Number.isFinite(usd) && usd > 0) orders.push({ symbol, kind: kindOf(o.type ?? o.kind ?? o.panier), usd, reason: str(o.raison ?? o.reason) });
  }
  const res = num(obj.reserve_usdc ?? obj.reserve);
  return {
    market: str(obj.marche ?? obj.market),
    orders,
    discoveryList: strList(obj.liste_decouverte ?? obj.discovery).map((s) => s.toUpperCase()),
    alerts: strList(obj.alertes ?? obj.alerts),
    unverified: strList(obj.non_verifie ?? obj.unverified),
    reserveUsd: Number.isFinite(res) ? res : null,
  };
}

// ------------------------------------------------------------------ Contrôle des ordres proposés

export type CheckStatus = 'ok' | 'warn' | 'fix';

export interface OrderCheck {
  order: GrokOrder;
  coin: CoinRef | null;
  status: CheckStatus;
  messages: string[];
}

export interface GrokCheck {
  lines: OrderCheck[];
  messages: string[];
  status: CheckStatus;
  totalUsd: number;
}

const worse = (a: CheckStatus, b: CheckStatus): CheckStatus => (a === 'fix' || b === 'fix' ? 'fix' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');
const eur = (x: number) => `${String(Math.round(x * 100) / 100).replace('.', ',')} USDC`;

/** Vérifie chaque ordre de Grok avec les règles de ton panier : « ok », « avertissement » ou « à corriger ». */
export function checkGrokOrders(reply: GrokReply, b: BasketPlan, ctx: BasketContext, known: Record<string, CoinRef>): GrokCheck {
  const messages: string[] = [];
  const total = reply.orders.reduce((s, o) => s + o.usd, 0);
  let overall: CheckStatus = 'ok';
  const flag = (s: CheckStatus, msg: string) => { overall = worse(overall, s); messages.push(msg); };

  if (reply.orders.length > 2) flag('fix', `${reply.orders.length} ordres proposés : ta règle est de 2 au plus.`);
  if (reply.orders.filter((o) => o.kind === 'discovery').length > 1) flag('fix', 'Plusieurs achats « découverte » : un seul par échéance.');
  if (total > b.amountUsd + Math.max(0, b.reserveUsd) + 0.01) flag('fix', `Total ${eur(total)} : au-dessus du budget (${eur(b.amountUsd)}) et de ta réserve (${eur(b.reserveUsd)}).`);
  else if (total > b.amountUsd + 0.01) flag('warn', `Total ${eur(total)} : ${eur(total - b.amountUsd)} seraient puisés dans ta réserve.`);
  if (!reply.orders.length) flag('warn', 'Aucun ordre proposé : le montant reste en réserve.');

  const total$ = ctx.totalValueUsd;
  const capApplies = total$ >= 20 * b.amountUsd;
  const lines = reply.orders.map((order): OrderCheck => {
    const coin = known[order.symbol] ?? null;
    const msgs: string[] = [];
    let st: CheckStatus = 'ok';
    const add = (s: CheckStatus, m: string) => { st = worse(st, s); msgs.push(m); };
    if (order.usd < b.minOrderUsd) add('fix', `Ordre sous le minimum de ${eur(b.minOrderUsd)}.`);
    if (!coin) add('warn', 'Crypto inconnue de Boussole : vérifie le symbole avant d’acheter.');
    else {
      const id = coin.coinId;
      const value = ctx.values[id] ?? 0;
      const ch = ctx.change7d[id];
      if (ch != null && ch > 50) add('fix', `+${Math.round(ch)} % en 7 jours : règle anti-FOMO.`);
      if (ctx.cdc && ctx.cdc[id] === 'unknown') add('warn', 'Absente de la liste Crypto.com : vérifie dans l’application.');
      if (order.kind === 'discovery') {
        if (capApplies && ((value + order.usd) / (total$ + order.usd)) * 100 > ctx.rules.maxPerGemPct) add('fix', `Dépasserait le plafond de ${ctx.rules.maxPerGemPct} % du portefeuille.`);
        if (value <= 0 && ctx.discoveryLinesOpen >= ctx.rules.maxDiscoveryLines) add('fix', `Ouvrirait une ligne de plus (déjà ${ctx.discoveryLinesOpen}, maximum ${ctx.rules.maxDiscoveryLines}).`);
        const unfinished = b.discovery.filter((c) => c.coinId !== id && (ctx.values[c.coinId] ?? 0) > 0 && total$ > 0 && ((ctx.values[c.coinId] ?? 0) / total$) * 100 < ctx.rules.minLinePct);
        if (value <= 0 && unfinished.length) add('warn', `Ouvre une nouvelle ligne alors que ${unfinished.map((c) => c.symbol.toUpperCase()).join(', ')} pèse moins de ${ctx.rules.minLinePct} % : finis d’abord celle-là.`);
        if (!b.discovery.some((c) => c.coinId === id)) add('warn', 'Absente de ta liste découverte.');
      } else if (order.kind === 'core') {
        if (!b.core.some((c) => c.coinId === id)) add('warn', 'N’est pas dans ton cœur de panier.');
      }
    }
    if (order.kind === 'unknown') add('warn', 'Type d’ordre non précisé (classique ou découverte).');
    overall = worse(overall, st);
    return { order, coin, status: st, messages: msgs };
  });
  return { lines, messages, status: overall, totalUsd: total };
}
