// RSS and Atom parsing for the News tab, with no dependencies: headlines, links and dates from <item> or <entry>.
// Shared by api/news.js, scripts/check-feeds.mjs and the tests. Served as a static file but only used on the server.

/** @typedef {import('./types').NewsItem} NewsItem */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Decodes CDATA, the common named entities and numeric ones, and drops tags before and after decoding. */
export function text(/** @type {string | undefined} */ raw) {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENTITIES[/** @type {keyof typeof ENTITIES} */ (e.toLowerCase())] ?? m;
    })
    // Atom "html" titles arrive escaped, so tags can appear only after decoding.
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (/** @type {string} */ xml, /** @type {string} */ name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

/** The article link: Atom's rel="alternate" (or first) href, else RSS <link>, else a permalink <guid>. */
function link(/** @type {string} */ block) {
  const atom = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const alt = atom.find((a) => /rel=["']alternate["']/i.test(a)) ?? atom.find((a) => !/rel=/i.test(a) && /href=/i.test(a));
  const href = alt?.match(/href=["']([^"']+)["']/i)?.[1];
  if (href) return text(href);
  const rss = text(tag(block, 'link'));
  if (rss) return rss;
  const guid = text(tag(block, 'guid'));
  return /^https?:\/\//.test(guid) ? guid : '';
}

/**
 * Headlines from one feed, newest first. Items without a title, an http(s) link or a readable date are skipped.
 * @param {string} xml
 * @param {{ category: string, group: NewsItem['group'], feed: string }} where
 * @returns {NewsItem[]}
 */
export function parseFeed(xml, where) {
  const channel = text(tag(xml.replace(/<(item|entry)\b[\s\S]*$/i, ''), 'title')) || new URL(where.feed).hostname.replace(/^www\./, '');
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  /** @type {NewsItem[]} */
  const out = [];
  for (const b of blocks) {
    const title = text(tag(b, 'title'));
    const url = link(b);
    const when = text(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const t = Date.parse(when);
    if (!title || !/^https?:\/\//.test(url) || Number.isNaN(t)) continue;
    out.push({ title: title.slice(0, 200), url, source: channel.slice(0, 60), category: where.category, group: where.group, publishedAt: new Date(t).toISOString() });
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * One list for the page: duplicates (same URL) removed, newest first, at most `perCategory` per category.
 * @param {NewsItem[]} items
 * @param {number} perCategory
 */
export function merge(items, perCategory) {
  const seen = new Set();
  /** @type {Record<string, number>} */
  const count = {};
  return [...items]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter((i) => {
      const key = i.url.replace(/[?#].*$/, '').replace(/\/$/, '');
      if (seen.has(key) || (count[i.category] ?? 0) >= perCategory) return false;
      seen.add(key);
      count[i.category] = (count[i.category] ?? 0) + 1;
      return true;
    });
}
