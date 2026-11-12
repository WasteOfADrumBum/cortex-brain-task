// Pure helpers for /api/ops (no network): deploy state words, first lines, weekly buckets and totals.
// Shared by api/ops.js and the /demo sample data (src/demo/ops.js), so both count the same way. Served as a static file.

/** @typedef {import('./types').DeployState} DeployState */

const DAY = 864e5;

/** GitHub deployment status state -> the word Ops shows. "inactive" is a successful deploy that a newer one replaced. */
export function deployState(/** @type {string | undefined} */ state) {
  /** @type {Record<string, DeployState>} */
  const map = { success: 'healthy', inactive: 'healthy', failure: 'failed', error: 'failed', pending: 'building', queued: 'building', in_progress: 'building' };
  return map[state ?? ''] ?? 'unknown';
}

/** The first non-empty line of a commit message or PR body, without Markdown markers, clipped to `max` characters. */
export function firstLine(/** @type {string | null | undefined} */ text, max = 140) {
  const line = String(text ?? '').split(/\r?\n/).map((l) => l.replace(/^[#>*\-\s]+/, '').trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Monday 00:00 UTC of the week holding `d`. */
export function weekStart(/** @type {Date} */ d) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/**
 * Merged PRs per week for the last `n` weeks (oldest first), counted per project name.
 * @param {{ name: string, merged: string[] }[]} projects merged-at times per project
 * @param {Date} now
 */
export function weeks(projects, now, n = 12) {
  const first = weekStart(now).getTime() - (n - 1) * 7 * DAY;
  const out = Array.from({ length: n }, (_, i) => ({
    start: new Date(first + i * 7 * DAY).toISOString().slice(0, 10),
    /** @type {Record<string, number>} */ counts: Object.fromEntries(projects.map((p) => [p.name, 0])),
  }));
  for (const p of projects) {
    for (const at of p.merged) {
      const i = Math.floor((Date.parse(at) - first) / (7 * DAY));
      if (i >= 0 && i < n) out[i].counts[p.name]++;
    }
  }
  return out;
}

/**
 * Totals strip: PRs merged this week (since Monday) and this calendar month, production deploys and failed deploys this week.
 * @param {{ merged: string[], deploys: string[], failed: number | null }[]} projects
 * @param {Date} now
 */
export function totals(projects, now) {
  const week = weekStart(now).getTime();
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const count = (/** @type {string[]} */ list, /** @type {number} */ since) => list.filter((t) => Date.parse(t) >= since).length;
  const failed = projects.map((p) => p.failed);
  return {
    mergedWeek: projects.reduce((n, p) => n + count(p.merged, week), 0),
    mergedMonth: projects.reduce((n, p) => n + count(p.merged, month), 0),
    deploysWeek: projects.reduce((n, p) => n + count(p.deploys, week), 0),
    failedWeek: failed.some((f) => f == null) ? null : failed.reduce((n, f) => n + (f ?? 0), 0),
  };
}
