// Actualités crypto : flux RSS de CoinDesk, Cointelegraph, Decrypt et The Block.
// Sert à donner de l'actualité réelle aux modèles d'IA qui n'ont pas de recherche web.

import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: number; // millisecondes
  summary: string;
}

const FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

const clean = (s: string) => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

/** Analyse un flux RSS 2.0 (suffisant pour ces quatre sources). */
export function parseRss(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const title = clean(tag(block, 'title'));
    const url = decode(tag(block, 'link')).trim();
    const time = Date.parse(decode(tag(block, 'pubDate')).trim());
    if (!title || !/^https?:\/\//i.test(url) || !Number.isFinite(time)) continue;
    out.push({ title, source, url, publishedAt: time, summary: clean(tag(block, 'description')).slice(0, 260) });
  }
  return out;
}

async function fetchFeed(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    // Couche réseau native d'Android : contourne les restrictions CORS de la page web.
    const r = await CapacitorHttp.get({ url, responseType: 'text', headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
    return String(r.data);
  }
  const res = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

let cache: { at: number; items: NewsItem[] } | null = null;
const TTL = 15 * 60_000;

/** Derniers articles de tous les flux, du plus récent au plus ancien (mis en cache 15 minutes). */
export async function getAllNews(maxAgeHours = 72): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;
  const results = await Promise.allSettled(FEEDS.map(async (f) => parseRss(await fetchFeed(f.url), f.name)));
  const seen = new Set<string>();
  const items = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((i) => Date.now() - i.publishedAt < maxAgeHours * 3600_000 && Date.now() - i.publishedAt > -3600_000)
    .filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)))
    .sort((a, b) => b.publishedAt - a.publishedAt);
  if (items.length) cache = { at: Date.now(), items };
  return items;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Choisit `max` articles : d'abord ceux qui parlent des sujets demandés (nom ou symbole d'une crypto),
 * puis les plus récents pour compléter.
 */
export function pickNews(items: NewsItem[], topics: string[] = [], max = 20): NewsItem[] {
  const terms = topics.map((t) => t.trim()).filter((t) => t.length >= 2);
  const re = terms.length ? new RegExp(`(^|[^a-z0-9])(${terms.map(escapeRe).join('|')})([^a-z0-9]|$)`, 'i') : null;
  const matching = re ? items.filter((i) => re.test(`${i.title} ${i.summary}`)) : [];
  const picked = matching.slice(0, Math.ceil(max / 2));
  const ids = new Set(picked.map((i) => i.url));
  for (const i of items) {
    if (picked.length >= max) break;
    if (!ids.has(i.url)) picked.push(i);
  }
  return picked.sort((a, b) => b.publishedAt - a.publishedAt);
}

export async function getNews(topics: string[] = [], max = 20): Promise<NewsItem[]> {
  try {
    return pickNews(await getAllNews(), topics, max);
  } catch {
    return [];
  }
}
