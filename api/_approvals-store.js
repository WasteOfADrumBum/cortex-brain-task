// Where approvals are remembered: /Cortex/approvals/state.json (one record per proposal id, so a decided card
// never comes back) and /Cortex/logs/audit-YYYY-MM.jsonl (one line per decision: time, proposal id, action,
// target id, result; never titles, reasons or times). Both are Cortex-created files, inside the drive.file scope.
import { folder, readText, writeText } from './_drive.js';

/** @typedef {import('../src/types').ApprovalRecord} ApprovalRecord */

const KEEP_DAYS = 120;

/** @returns {Promise<Record<string, ApprovalRecord>>} */
export async function readState() {
  const text = await readText(await folder(['Cortex', 'approvals']), 'state.json');
  return text ? JSON.parse(text) : {};
}

/** Saves the state, dropping records older than 120 days (their briefings are long gone). */
export async function writeState(/** @type {Record<string, ApprovalRecord>} */ state, now = Date.now()) {
  const kept = Object.fromEntries(Object.entries(state).filter(([, r]) => now - Date.parse(r.at) < KEEP_DAYS * 864e5));
  await writeText(await folder(['Cortex', 'approvals']), 'state.json', JSON.stringify(kept, null, 2));
}

/** @param {{ at: string, id: string, action: string, targetId: string | null, decision: string, result: string }} line */
export async function audit(line) {
  const logs = await folder(['Cortex', 'logs']);
  const name = `audit-${line.at.slice(0, 7)}.jsonl`;
  const before = (await readText(logs, name)) || '';
  await writeText(logs, name, `${before}${JSON.stringify(line)}\n`, 'application/x-ndjson');
}
