// GET /api/ops -> OpsResponse (src/types.d.ts): one card per project in config/ops.json, a totals strip and
// merged PRs per week for the last 12 weeks. Reads GitHub (production deployments that Vercel reports, pull
// requests) and the public npm registry on request; stores nothing. Answers are cached for 5 minutes per instance.
// Env: DASH_KEY (same as /api/tasks). GITHUB_TOKEN is optional but needed in practice: a fine-grained, read-only
// token (Metadata, Contents, Deployments, Pull requests) for the listed repos. Without it GitHub allows 60 calls an
// hour per server address, which a full refresh can use up.
import { readFileSync } from 'node:fs';
import { keyMatches } from './_key.js';
import { deployState, firstLine, weeks, totals } from '../src/ops-lib.js';

/** @typedef {import('../src/types').OpsProject} OpsProject */
/** @typedef {import('../src/types').OpsResponse} OpsResponse */
/** @typedef {{ name: string, repo: string, url: string | null, npm?: string }} OpsConfigProject */

const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const DAY = 864e5;
const CACHE_MS = 5 * 60e3;
/** @type {{ at: number, body: OpsResponse } | null} */
let cache = null;

class GitHubError extends Error {}

/** GET one GitHub REST path. Throws GitHubError with a message safe to show. */
async function gh(/** @type {string} */ path) {
  /** @type {Record<string, string>} */
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'cortex-ops', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, { headers });
  } catch {
    throw new GitHubError('Could not reach GitHub');
  }
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError(process.env.GITHUB_TOKEN ? 'GitHub rate limit reached; try again later' : 'GitHub rate limit reached; add GITHUB_TOKEN in Vercel');
  }
  if (res.status === 401) throw new GitHubError('GitHub rejected GITHUB_TOKEN');
  if (!res.ok) throw new GitHubError(`GitHub returned ${res.status}`);
  return res.json();
}

/** Latest version on the public npm registry, or null when it can't be read. */
async function npmVersion(/** @type {string} */ name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * One project card plus the raw times the totals and chart need.
 * @param {OpsConfigProject} p
 * @param {Date} now
 * @returns {Promise<{ card: OpsProject, merged: string[], deploys: string[], failed: number | null }>}
 */
async function project(p, now) {
  const repo = encodeURI(p.repo);
  /** @type {OpsProject} */
  const card = { name: p.name, repo: p.repo, url: p.url, deploy: null, mergedPrs: [], openPrs: null, failedLast7Days: null, npm: p.npm ? { name: p.npm, version: null } : null };
  const npm = p.npm ? npmVersion(p.npm) : Promise.resolve(null);
  try {
    const [deploys, closed, open] = await Promise.all([
      gh(`/repos/${repo}/deployments?environment=Production&per_page=30`),
      gh(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`),
      gh(`/repos/${repo}/pulls?state=open&per_page=100`),
    ]);
    const merged = closed.filter((/** @type {any} */ pr) => pr.merged_at).sort((/** @type {any} */ a, /** @type {any} */ b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
    card.mergedPrs = merged.slice(0, 3).map((/** @type {any} */ pr) => ({ title: pr.title, mergedAt: pr.merged_at, summary: firstLine(pr.body), url: pr.html_url }));
    card.openPrs = open.length;

    const week = deploys.filter((/** @type {any} */ d) => now.getTime() - Date.parse(d.created_at) < 7 * DAY);
    // The newest status of the latest deploy and of each deploy in the last 7 days (at most 10).
    const recent = [deploys[0], ...week.slice(0, 10).filter((/** @type {any} */ d) => d !== deploys[0])].filter(Boolean);
    const states = await Promise.all(recent.map(async (/** @type {any} */ d) => (await gh(`/repos/${repo}/deployments/${d.id}/statuses?per_page=1`))[0]));
    if (deploys[0]) {
      const latest = states[0];
      const commit = await gh(`/repos/${repo}/commits/${deploys[0].sha}`).catch(() => null);
      card.deploy = {
        state: deployState(latest?.state),
        at: latest?.created_at ?? deploys[0].created_at,
        message: firstLine(commit?.commit?.message),
        url: latest?.environment_url || p.url,
      };
    }
    const weekIds = new Set(week.slice(0, 10).map((/** @type {any} */ d) => d.id));
    card.failedLast7Days = recent.filter((d, i) => weekIds.has(d.id) && deployState(states[i]?.state) === 'failed').length;
    card.npm = p.npm ? { name: p.npm, version: await npm } : null;
    return { card, merged: merged.map((/** @type {any} */ pr) => pr.merged_at), deploys: week.map((/** @type {any} */ d) => d.created_at), failed: card.failedLast7Days };
  } catch (e) {
    card.error = e instanceof GitHubError ? e.message : 'Could not read this project';
    card.npm = p.npm ? { name: p.npm, version: await npm } : null;
    return { card, merged: [], deploys: [], failed: null };
  }
}

/** Builds the full answer. Exported for tests. @param {OpsConfigProject[]} list @param {Date} now @returns {Promise<OpsResponse>} */
export async function build(list, now) {
  const rows = await Promise.all(list.map((p) => project(p, now)));
  const named = rows.map((r) => ({ name: r.card.name, merged: r.merged }));
  const warnings = rows.filter((r) => r.card.error).map((r) => `${r.card.name}: ${r.card.error}`);
  return { generatedAt: now.toISOString(), projects: rows.map((r) => r.card), totals: totals(rows, now), weeks: weeks(named, now), warnings };
}

export async function GET(/** @type {Request} */ request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (!keyMatches(request.headers.get('x-dash-key'), process.env.DASH_KEY)) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  if (cache && Date.now() - cache.at < CACHE_MS) return json(cache.body);
  /** @type {{ projects: OpsConfigProject[] }} */
  const config = JSON.parse(readFileSync(new URL('../config/ops.json', import.meta.url), 'utf8'));
  const body = await build(config.projects, new Date());
  // A run where every project failed (for example the rate limit) is not cached, so the next visit tries again.
  if (body.warnings.length < body.projects.length) cache = { at: Date.now(), body };
  return json(body);
}
