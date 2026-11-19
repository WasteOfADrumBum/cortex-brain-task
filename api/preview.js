// GET /api/preview?project=<name> -> a screenshot (image) of that project's live site, for the top of its Ops card.
// Only projects listed in config/ops.json with a url, so it can't be used to screenshot anything else. Uses
// Microlink's free screenshot API (no key; about 50 a day), and Vercel's CDN keeps each image for a day, so a
// normal day costs one call per site. When no screenshot can be made it answers 404 and the card shows the logo.
// No dashboard key: the images are of public sites and carry nothing private.
import { readFileSync } from 'node:fs';

const MISS = { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=300, s-maxage=900' } };

/** The screenshot's image bytes and type, or null. Exported for tests. */
export async function screenshot(/** @type {string} */ site) {
  const api = `https://api.microlink.io/?${new URLSearchParams({ url: site, screenshot: 'true', meta: 'false', 'viewport.width': '1280', 'viewport.height': '800', 'viewport.deviceScaleFactor': '1', waitUntil: 'networkidle2' })}`;
  try {
    const res = await fetch(api, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const shot = (await res.json())?.data?.screenshot?.url;
    if (typeof shot !== 'string' || !shot.startsWith('https://')) return null;
    const img = await fetch(shot, { signal: AbortSignal.timeout(10000) });
    const type = img.headers.get('content-type') || '';
    if (!img.ok || !type.startsWith('image/')) return null;
    return { type, bytes: await img.arrayBuffer() };
  } catch {
    return null;
  }
}

export async function GET(/** @type {Request} */ request) {
  const name = new URL(request.url).searchParams.get('project') || '';
  /** @type {{ projects: { name: string, url: string | null }[] }} */
  const config = JSON.parse(readFileSync(new URL('../config/ops.json', import.meta.url), 'utf8'));
  const site = config.projects.find((p) => p.name === name)?.url;
  if (!site || !/^https:\/\//.test(site)) return new Response('No live site for that project', MISS);
  const shot = await screenshot(site);
  if (!shot) return new Response('No screenshot right now', MISS);
  return new Response(shot.bytes, {
    headers: { 'content-type': shot.type, 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
