// GET  /api/approvals -> ApprovalsResponse (src/types.d.ts): which proposals were already decided, so the page
//      hides them, and whether approving is set up yet.
// POST /api/approvals { id, decision: "approve" | "reject" | "undo", proposal, tz } -> { status, ... }
//   The proposal comes from the briefing the page read. The server checks it against the allowlist again
//   (src/approvals-lib.js), re-reads the task or event and refuses with 409 "Stale, review again" when it changed,
//   then runs it with the server-side tokens, stores the decision and writes the audit line (api/_approvals-run.js).
//   Undo works for 10 seconds after an approved reschedule or move. At most 60 decisions an hour.
// Env: DASH_KEY, TODOIST_TOKEN, and the Google variables in api/_drive.js (with the calendar.events scope).
import { keyMatches } from './_key.js';
import { allow } from './_rate.js';
import { json, readBody } from './_finance-save.js';
import { driveConfigured } from './_drive.js';
import { UpstreamError } from './_upstream.js';
import { readState, writeState, audit } from './_approvals-store.js';
import { decide } from './_approvals-run.js';
import * as todoist from './_todoist.js';
import * as calendar from './_gcal.js';

const NOT_SET_UP = 'Approving is not set up yet: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN are needed in Vercel';

function denied(/** @type {Request} */ request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (!keyMatches(request.headers.get('x-dash-key'), process.env.DASH_KEY)) return json({ error: 'Missing or wrong dashboard key' }, 401);
  return null;
}

export async function GET(/** @type {Request} */ request) {
  const no = denied(request);
  if (no) return no;
  /** @type {import('../src/types').ApprovalsResponse} */
  const body = { configured: driveConfigured(), decisions: {} };
  if (!body.configured) return json(body);
  try {
    for (const [id, r] of Object.entries(await readState())) body.decisions[id] = { status: r.status, at: r.at, ...(r.note ? { note: r.note } : {}) };
  } catch (e) {
    if (e instanceof UpstreamError) return json({ error: e.message }, 502);
    throw e;
  }
  return json(body);
}

export async function POST(/** @type {Request} */ request) {
  const no = denied(request);
  if (no) return no;
  if (!allow('approvals', 60)) return json({ error: 'Too many decisions this hour; try again later' }, 429);
  if (!driveConfigured()) return json({ error: NOT_SET_UP }, 503);
  const body = await readBody(request);
  if ('res' in body) return body.res;
  try {
    const r = await decide(body.value, { readState, writeState, audit, todoist, calendar });
    return json(r.body, r.status);
  } catch (e) {
    if (e instanceof UpstreamError) return json({ error: e.message }, 502);
    throw e;
  }
}
