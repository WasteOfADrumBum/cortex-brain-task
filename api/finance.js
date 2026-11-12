// GET  /api/finance?year=2026 -> FinanceYear (src/types.d.ts): every saved month of that year, oldest first.
// POST /api/finance  { data: <one month>, confirm?: boolean } -> { ok, month, bills, savedAt, warnings }
//   The Finances tab's paste import. Same checks as /api/ingest/finance; 422 names the bad field, 409 lists
//   what would be lost so the page can ask before replacing. At most 20 saves an hour.
// Env: DASH_KEY, plus the Drive variables in api/_drive.js.
import { keyMatches } from './_key.js';
import { allow } from './_rate.js';
import { json, readBody, checkAndSave } from './_finance-save.js';
import { readYear } from './_finance-store.js';
import { DriveError, driveConfigured } from './_drive.js';

function denied(/** @type {Request} */ request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (!keyMatches(request.headers.get('x-dash-key'), process.env.DASH_KEY)) return json({ error: 'Missing or wrong dashboard key' }, 401);
  return null;
}

export async function GET(/** @type {Request} */ request) {
  const no = denied(request);
  if (no) return no;
  const year = Number(new URL(request.url).searchParams.get('year') || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ error: 'year must be like 2026' }, 400);
  if (!driveConfigured()) return json({ error: 'Drive saving is not set up yet (GOOGLE_REFRESH_TOKEN is missing in Vercel)' }, 503);
  try {
    return json({ year, months: await readYear(year) });
  } catch (e) {
    if (e instanceof DriveError) return json({ error: e.message }, 502);
    throw e;
  }
}

export async function POST(/** @type {Request} */ request) {
  const no = denied(request);
  if (no) return no;
  if (!allow('paste')) return json({ error: 'Too many saves this hour; try again later' }, 429);
  const body = await readBody(request);
  if ('res' in body) return body.res;
  const { data, confirm } = body.value || {};
  return checkAndSave(data, { confirm: confirm === true, via: 'paste' });
}
