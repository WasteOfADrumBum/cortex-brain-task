// Reads and saves finance months in Drive: /Cortex/finance/YYYY-MM.json (plus YYYY-MM.prev.json, the copy it
// replaced) and one line per save in /Cortex/logs/ingest-YYYY-MM.jsonl (time, source, month, counts; never amounts).
import { folder, list, readText, writeText } from './_drive.js';

/** @typedef {import('../src/types').FinanceMonth} FinanceMonth */
/** @typedef {import('../src/types').SavedFinanceMonth} SavedFinanceMonth */

export async function readMonth(/** @type {string} */ ym) {
  const text = await readText(await folder(['Cortex', 'finance']), `${ym}.json`);
  return text ? /** @type {SavedFinanceMonth} */ (JSON.parse(text)) : null;
}

/** Every saved month of a year, oldest first. */
export async function readYear(/** @type {number} */ year) {
  const dir = await folder(['Cortex', 'finance']);
  const names = (await list(dir, `${year}-`)).map((f) => f.name).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).sort();
  /** @type {SavedFinanceMonth[]} */
  const months = [];
  for (const n of names) { const t = await readText(dir, n); if (t) months.push(JSON.parse(t)); }
  return months;
}

/**
 * Saves a checked month, keeping the copy it replaces as YYYY-MM.prev.json, and logs the save.
 * @param {FinanceMonth} value already checked by validateFinance
 * @param {SavedFinanceMonth | null} prev the saved copy, if any
 * @param {string} via "paste" or "ingest"
 */
export async function saveMonth(value, prev, via) {
  const dir = await folder(['Cortex', 'finance']);
  if (prev) await writeText(dir, `${value.month}.prev.json`, JSON.stringify(prev, null, 2));
  /** @type {SavedFinanceMonth} */
  const saved = { ...value, savedAt: new Date().toISOString() };
  await writeText(dir, `${value.month}.json`, JSON.stringify(saved, null, 2));
  const logs = await folder(['Cortex', 'logs']);
  const logName = `ingest-${saved.savedAt.slice(0, 7)}.jsonl`;
  const line = JSON.stringify({ at: saved.savedAt, via, source: value.source, month: value.month, bills: value.bills.length, income: value.income.length });
  const before = (await readText(logs, logName)) || '';
  await writeText(logs, logName, `${before}${line}\n`, 'application/x-ndjson');
  return saved;
}
