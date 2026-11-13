// Veille presse du runner : pour chaque crypto suivie (positions + alertes), les dernières actualités.
// Source : flux RSS Google News filtré par nom de crypto (gratuit, sans clé, en français) — les titres sont
// ceux de la presse spécialisée et généraliste du moment. Les résumés et le tri de l'importance viennent,
// si une clé Mistral est configurée, de src/runner/ai.ts ; sinon une heuristique par mots-clés.

export interface WatchedCoin {
  coinId: string;
  name: string;
}
export interface NewsItem {
  coinId: string;
  coinName: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // millisecondes
  summaryText: string;
}
export interface RatedNews extends NewsItem {
  /** Importance 1-10 selon l'IA ; 0 = pas d'IA configurée. */
  importance: number;
  /** Résumé en 3 lignes (IA) ; vide sans IA. */
  resume: string;
}

/** Mots qui font qu'une actu compte pour un investisseur (sans IA, on reste prudent). */
const HOT_WORDS = /(hack|pirat|hijack|exploit|breach|vol[eé]|stolen|liquidat|rug|scam|arnaque|sec\b|poursuite|lawsuit|interdiction|suspension|faillite|bankrupt|partenariat|partnership|listing|etf|approv|upgrade|mainnet|halving|acquisition|rach[ae]t|adoption|institutionnel|reserve|strategic)/i;

export function isHotNews(item: NewsItem): boolean {
  return HOT_WORDS.test(`${item.title} ${item.summaryText}`);
}

// ------------------------------------------------------------------ RSS (sans DOMParser : pas de DOM dans Node)

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201C', rdquo: '\u201D', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026' };

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

/** Analyse un flux RSS 2.0 ; pure, testée avec de vrais extraits de Google News. */
export function parseRss(xml: string, coin: WatchedCoin): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const raw = clean(tag(block, 'title'));
    // « Titre de l'actu - Source » : le dernier « - » sépare le titre de la source.
    const dash = raw.lastIndexOf(' - ');
    const title = (dash > 0 ? raw.slice(0, dash) : raw).trim();
    const fallbackSource = dash > 0 ? raw.slice(dash + 3).trim() : '';
    const url = decode(tag(block, 'link')).trim() || decode(tag(block, 'guid')).trim();
    const sourceTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceTag ? clean(sourceTag[1]) : fallbackSource;
    const time = Date.parse(decode(tag(block, 'pubDate')).trim());
    if (!title || !/^https?:\/\//i.test(url) || !Number.isFinite(time)) continue;
    out.push({ coinId: coin.coinId, coinName: coin.name, title, url, source, publishedAt: time, summaryText: clean(tag(block, 'description')).slice(0, 280) });
  }
  return out;
}

/** Clé de dédoublonnage stable et courte d'une actu (hachage FNV-1a de son URL). */
export function newsKey(item: Pick<NewsItem, 'url'>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < item.url.length; i++) {
    h ^= item.url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `news:${h.toString(16)}`;
}

// ------------------------------------------------------------------ réseau (injecté : cycle.test.ts fournit de faux flux)

const TIMEOUT_MS = 15_000;

/** Dernières actus d'une crypto (Google News, en français), les plus récentes d'abord ; [] en cas d'échec. */
export async function fetchCoinNews(coin: WatchedCoin, maxAgeMs: number, limit = 8): Promise<NewsItem[]> {
  try {
    const q = encodeURIComponent(`${coin.name} crypto`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
    const res = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const items = parseRss(await res.text(), coin)
      .filter((i) => i.publishedAt > 0 && i.publishedAt <= Date.now() + 3600_000)
      .filter((i) => Date.now() - i.publishedAt < maxAgeMs)
      .sort((a, b) => b.publishedAt - a.publishedAt);
    return items.slice(0, limit);
  } catch {
    return []; // un flux indisponible ne bloque jamais les autres
  }
}
