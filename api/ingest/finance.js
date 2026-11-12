// POST /api/ingest/finance  Authorization: Bearer <CORTEX_INGEST_TOKEN>  body: one month (docs/cortex-v2-spec.md)
//   -> { ok: true, month, bills, savedAt, warnings }; 401 wrong token, 422 bad field (named, values never echoed),
//   429 over 20 calls an hour, 503 Drive not set up. For automation (a Claude routine), so it saves without a
//   confirm and returns any shrink warnings instead.
// Env: CORTEX_INGEST_TOKEN (a long random string), plus the Drive variables in api/_drive.js.
import { keyMatches } from '../_key.js';
import { allow } from '../_rate.js';
import { json, readBody, checkAndSave } from '../_finance-save.js';

export async function POST(/** @type {Request} */ request) {
  if (!process.env.CORTEX_INGEST_TOKEN) return json({ error: 'CORTEX_INGEST_TOKEN is not set in Vercel' }, 500);
  const auth = request.headers.get('authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!keyMatches(given, process.env.CORTEX_INGEST_TOKEN)) {
    console.warn('ingest/finance: rejected a call with a missing or wrong token');
    return json({ error: 'Missing or wrong token' }, 401);
  }
  if (!allow('ingest')) return json({ error: 'Too many calls this hour; try again later' }, 429);
  const body = await readBody(request);
  if ('res' in body) return body.res;
  return checkAndSave(body.value, { confirm: true, via: 'ingest' });
}
