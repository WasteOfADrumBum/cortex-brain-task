// GET /api/setup -> { connections: [{ id, label, unlocks, optional, ready, missing: [variable names] }] }
// Which Vercel variables are set, so the Ops page can say what to connect. Names only: no value ever leaves here.
// Env: DASH_KEY (same as /api/tasks)
import { keyMatches } from './_key.js';
import { connections } from '../src/setup-lib.js';

const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET(/** @type {Request} */ request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (!keyMatches(request.headers.get('x-dash-key'), process.env.DASH_KEY)) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  return json({ connections: connections(process.env) });
}
