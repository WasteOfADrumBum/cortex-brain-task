// The checks and save both finance routes share: size limit, schema (src/finance-lib.js), shrink warnings, Drive.
// Error answers name the field but never echo the posted values.
import { validateFinance, shrinkWarnings } from '../src/finance-lib.js';
import { readMonth, saveMonth } from './_finance-store.js';
import { DriveError, driveConfigured } from './_drive.js';

export const json = (/** @type {unknown} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const MAX_BYTES = 100_000;

/** Reads a JSON body of at most 100 KB. @returns {Promise<{ ok: true, value: any } | { ok: false, res: Response }>} */
export async function readBody(/** @type {Request} */ request) {
  const text = await request.text();
  if (text.length > MAX_BYTES) return { ok: false, res: json({ error: 'Body is larger than 100 KB' }, 413) };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, res: json({ error: 'Body is not valid JSON' }, 400) }; }
}

/**
 * Checks and saves one month. With `confirm` false, a save that would drop items or has incomplete accounts
 * answers 409 with the warnings instead; automation passes confirm true and gets the warnings back after saving.
 * @param {unknown} payload
 * @param {{ confirm: boolean, via: string }} opts
 */
export async function checkAndSave(payload, { confirm, via }) {
  const checked = validateFinance(payload);
  if ('field' in checked) return json({ error: checked.message, field: checked.field }, 422);
  if (!driveConfigured()) return json({ error: 'Drive saving is not set up yet (GOOGLE_REFRESH_TOKEN is missing in Vercel)' }, 503);
  try {
    const prev = await readMonth(checked.value.month);
    const warnings = shrinkWarnings(prev, checked.value);
    if (warnings.length && !confirm) return json({ error: 'Confirm to replace the saved month', warnings }, 409);
    const saved = await saveMonth(checked.value, prev, via);
    return json({ ok: true, month: saved.month, bills: saved.bills.length, savedAt: saved.savedAt, warnings });
  } catch (e) {
    if (e instanceof DriveError) return json({ error: e.message }, 502);
    throw e;
  }
}
