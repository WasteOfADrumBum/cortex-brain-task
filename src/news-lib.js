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

/** Attribute value from a tag's attribute text. */
const attr = (/** @type {string} */ attrs, /** @type {string} */ name) => attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1];
/** Entity-decoded but tag-keeping text, for finding <img> inside escaped HTML descriptions. */
const decoded = (/** @type {string} */ raw) => raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
const https = (/** @type {string | undefined} */ u) => {
  const v = u ? text(u) : '';
  if (v.startsWith('//')) return `https:${v}`;
  return /^https:\/\//i.test(v) ? v : '';
};

/**
 * The item's picture: media:thumbnail, an image media:content or enclosure, else the first <img> in its HTML.
 * Only https addresses, so the page never loads a mixed-content image.
 */
export function image(/** @type {string} */ block) {
  for (const m of block.matchAll(/<media:thumbnail\b([^>]*)>/gi)) { const u = https(attr(m[1], 'url')); if (u) return u; }
  for (const m of block.matchAll(/<(?:media:content|enclosure)\b([^>]*)>/gi)) {
    const a = m[1];
    const u = https(attr(a, 'url'));
    if (u && (/image/i.test(attr(a, 'medium') || attr(a, 'type') || '') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u))) return u;
  }
  const html = decoded(tag(block, 'content:encoded') || tag(block, 'content') || tag(block, 'description') || tag(block, 'summary') || '');
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    const u = https(attr(m[1], 'src'));
    // Tracking pixels and feed badges are tiny; skip anything that says it is.
    const w = Number(attr(m[1], 'width') || 0);
    if (u && !(w > 0 && w < 40) && !/feedburner|pixel|tracking|gravatar/i.test(u)) return u;
  }
  return '';
}

const SUMMARY_MAX = 320;
/** One paragraph or less: the first sentences that fit in about 320 characters, never cut mid-word. */
export function clip(/** @type {string} */ s, max = SUMMARY_MAX) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = cut.match(/^[\s\S]*[.!?](?=\s)/)?.[0];
  if (sentence && sentence.length > max * 0.45) return sentence;
  return `${cut.replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '')}…`;
}

/** A short plain-text summary from the item's description, summary or content, without feed boilerplate. */
export function summary(/** @type {string} */ block, /** @type {string} */ title) {
  for (const raw of [tag(block, 'description'), tag(block, 'summary'), tag(block, 'media:description'), tag(block, 'content:encoded'), tag(block, 'content')]) {
    let t = text(raw)
      .replace(/\bThe post .{1,200}? appeared first on .{1,120}?\.?$/i, '')
      .replace(/\b(Continue reading|Read more|Read the full (story|article)|Comments)\b.*$/i, '')
      .replace(/\[(?:…|\.\.\.|&#8230;)\]\s*$/, '…')
      .trim();
    if (t.toLowerCase().startsWith(title.toLowerCase())) t = t.slice(title.length).replace(/^[\s:–—-]+/, '');
    if (t.length >= 40) return clip(t);
  }
  return '';
}

/**
 * Headlines from one feed, newest first. Items without a title, an http(s) link or a readable date are skipped.
 * Each has a short summary and an https picture when the feed carries them ("" otherwise).
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
    out.push({ title: title.slice(0, 200), url, source: channel.slice(0, 60), category: where.category, group: where.group, publishedAt: new Date(t).toISOString(), summary: summary(b, title), image: image(b) });
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * The article page's own preview: og:image / twitter:image and og:description / description, from its <head>.
 * Used for headlines whose feed gave no picture or summary.
 * @param {string} html
 * @param {string} pageUrl relative image addresses resolve against it
 */
export function pageMeta(html, pageUrl) {
  const head = html.slice(0, 200_000).split(/<\/head>/i)[0];
  /** @type {Record<string, string>} */
  const meta = {};
  for (const m of head.matchAll(/<meta\b([^>]+)>/gi)) {
    const key = (attr(m[1], 'property') || attr(m[1], 'name') || '').toLowerCase();
    const content = m[1].match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
    const value = content ? (content[1] ?? content[2]) : undefined;
    if (key && value && !(key in meta)) meta[key] = value;
  }
  let img = meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'] || '';
  try { img = img ? new URL(text(img), pageUrl).href : ''; } catch { img = ''; }
  const desc = text(meta['og:description'] || meta['twitter:description'] || meta.description || '');
  return { image: /^https:\/\//.test(img) ? img : '', summary: desc.length >= 40 ? clip(desc) : '' };
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
