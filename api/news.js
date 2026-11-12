// GET /api/news -> NewsResponse (src/types.d.ts): headlines from the free RSS and Atom feeds in
// config/news-feeds.json, newest first, at most `perCategory` per category, duplicates removed. A feed that
// fails is skipped and named in `failed`. No API keys and no storage; answers are cached 30 minutes per instance.
// Env: DASH_KEY (same as /api/tasks).
import { readFileSync } from 'node:fs';
import { keyMatches } from './_key.js';
import { parseFeed, merge } from '../src/news-lib.js';

/** @typedef {import('../src/types').NewsResponse} NewsResponse */
/** @typedef {{ name: string, group: 'Work' | 'Life', feeds: string[] }} FeedCategory */

const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const CACHE_MS = 30 * 60e3;
/** @type {{ at: number, body: NewsResponse } | null} */
let cache = null;

/** One feed's text, or null when it doesn't answer within 8 seconds or isn't a feed. */
async function get(/** @type {string} */ url) {
  try {
    const res = await fetch(url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'user-agent': 'cortex-news/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = await res.text();
    return /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000)) ? body : null;
  } catch {
    return null;
  }
}

/** Builds the full answer. Exported for tests. @param {{ categories: FeedCategory[], perCategory: number, homeGroups: ('Work' | 'Life')[] }} config @returns {Promise<NewsResponse>} */
export async function build(config) {
  const jobs = config.categories.flatMap((c) => c.feeds.map((feed) => ({ category: c.name, group: c.group, feed })));
  const results = await Promise.all(jobs.map(async (j) => {
    const xml = await get(j.feed);
    const items = xml ? parseFeed(xml, j) : [];
    return { j, ok: !!xml && items.length > 0, items };
  }));
  return {
    generatedAt: new Date().toISOString(),
    categories: config.categories.map(({ name, group }) => ({ name, group })),
    items: merge(results.flatMap((r) => r.items), config.perCategory),
    failed: results.filter((r) => !r.ok).map((r) => ({ category: r.j.category, feed: new URL(r.j.feed).hostname.replace(/^www\./, '') })),
    homeGroups: config.homeGroups,
  };
}

export async function GET(/** @type {Request} */ request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (!keyMatches(request.headers.get('x-dash-key'), process.env.DASH_KEY)) return json({ error: 'Missing or wrong dashboard key' }, 401);
  if (cache && Date.now() - cache.at < CACHE_MS) return json(cache.body);
  const config = JSON.parse(readFileSync(new URL('../config/news-feeds.json', import.meta.url), 'utf8'));
  const body = await build(config);
  if (body.items.length) cache = { at: Date.now(), body };
  return json(body);
}
