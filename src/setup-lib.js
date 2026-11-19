// Which server connections Cortex has: each one names the Vercel variables it needs and what it unlocks. Used by
// /api/setup (real environment) and the /demo sample data. Only variable names and true/false leave the server,
// never a value.

/** @typedef {import('./types').Connection} Connection */

export const CONNECTIONS = [
  {
    id: 'planner',
    label: 'Todoist and Calendar',
    vars: ['TODOIST_TOKEN', 'GCAL_ICS_URLS'],
    unlocks: 'The Planner, the Home Top 3 and the health checks on this page.',
    optional: false,
  },
  {
    id: 'github',
    label: 'GitHub (read-only)',
    vars: ['GITHUB_TOKEN'],
    unlocks: 'Reliable project cards on this page. Without it GitHub allows 60 calls an hour, which the cards can run out of.',
    optional: false,
  },
  {
    id: 'google',
    label: 'Google Drive and Calendar (server)',
    vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    unlocks: 'Approving briefing proposals and the audit log. Finances reads your budget sheet in the browser and does not need this.',
    optional: false,
  },
  {
    id: 'ingest',
    label: 'Finance automation',
    vars: ['CORTEX_INGEST_TOKEN'],
    unlocks: 'Only for the older monthly finance JSON import. Finances now reads your budget sheet directly.',
    optional: true,
  },
];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Connection[]}
 */
export function connections(env) {
  return CONNECTIONS.map((c) => {
    const missing = c.vars.filter((v) => !String(env[v] ?? '').trim());
    return { id: c.id, label: c.label, unlocks: c.unlocks, optional: c.optional, ready: missing.length === 0, missing };
  });
}
