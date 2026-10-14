// Sample health checks for /demo (Ops checklist): the sweep ran two days ago, the Muse check hasn't been seen,
// so the demo shows both the "seen" line and the warning. Made up, same shape as /api/checks.
/** @typedef {import("../types").ChecksResponse} ChecksResponse */

/**
 * @param {Date} now
 * @param {string[]} titles
 * @returns {ChecksResponse}
 */
export function checks(now, titles) {
  const ran = new Date(now.getTime() - 2 * 864e5);
  ran.setHours(8, 4, 0, 0);
  /** @type {Record<string, string>} */
  const seen = { "brain sweep ran": "Weekly sweep finished: 8 notes filed, inbox down to 4." };
  return {
    since: new Date(now.getTime() - 7 * 864e5).toISOString(),
    checks: titles.map((title) => {
      const d = seen[title.toLowerCase()];
      return d ? { title, completedAt: ran.toISOString(), description: d } : { title, completedAt: null, description: "" };
    }),
  };
}
