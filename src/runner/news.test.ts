// Veille presse du runner : analyse RSS Google News, mots-clés d'importance, clés de dédoublonnage.

import { describe, expect, it } from 'vitest';
import { isHotNews, newsKey, parseRss, type NewsItem } from './news';

const COIN = { coinId: 'solana', name: 'Solana' };

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Recherche</title>
<item><title>Solana victime d'un hack de 200 M$ - Journal Crypto</title>
<link>https://news.google.com/r/abc123</link>
<guid ispermalink="false">https://news.google.com/r/abc123</guid>
<pubDate>Wed, 11 Nov 2026 08:00:00 GMT</pubDate>
<description><![CDATA[Un pont de la chaîne a été exploité…]]></description>
<source url="https://journalcrypto.fr">Journal Crypto</source>
</item>
<item><title>Solana dépasse un nouveau sommet de TVL - Defi Daily</title>
<link>https://news.google.com/r/def456</link>
<pubDate>Wed, 11 Nov 2026 07:00:00 GMT</pubDate>
<description>Solana continue de grimper.</description>
</item>
</channel></rss>`;

describe('veille presse — analyse du flux', () => {
  it('titre et source séparés, actus horodatées, plus récentes en premier', () => {
    const items = parseRss(RSS, COIN);
    expect(items).toHaveLength(2);
    expect(items[0].title).not.toContain('Journal Crypto'); // le suffixe « - Source » est retiré du titre
    expect(items[0].source).toBe('Journal Crypto');
    expect(items[0].url).toBe('https://news.google.com/r/abc123');
    expect(items[0].publishedAt).toBe(new Date('2026-11-11T08:00:00Z').getTime());
    // sans balise <source>, la source est le dernier segment du titre
    expect(items[1].source).toBe('Defi Daily');
  });

  it('un flux vide ou cassé ne renvoie rien, sans lever d’erreur', () => {
    expect(parseRss('', COIN)).toEqual([]);
    expect(parseRss('<rss><channel>', COIN)).toEqual([]);
  });

  it('heuristique : un hack ou un ETF compte, une simple opinion non', () => {
    const mk = (title: string): NewsItem => ({ coinId: 'solana', coinName: 'Solana', title, url: 'https://x/' + Math.random(), source: '', publishedAt: 0, summaryText: '' });
    expect(isHotNews(mk('Solana victime d’un hack massif'))).toBe(true);
    expect(isHotNews(mk('Le listing de SOL annoncé'))).toBe(true);
    expect(isHotNews(mk('Trois raisons d’aimer Solana'))).toBe(false);
  });

  it('la clé de dédoublonnage est stable et courte (hachage de l’URL)', () => {
    const a = { url: 'https://news.google.com/r/abc123' };
    expect(newsKey(a)).toBe(newsKey(a));
    expect(newsKey(a)).toMatch(/^news:[0-9a-f]+$/);
    expect(newsKey(a)).not.toBe(newsKey({ url: 'https://news.google.com/r/other' }));
  });
});
