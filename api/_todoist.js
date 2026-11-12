// Todoist writes for approved proposals (Todoist API v1, the same TODOIST_TOKEN as /api/tasks). Only the calls
// the approvals allowlist needs: read one task, change its due date, close it, add a task. Never deletes.
import { UpstreamError } from './_upstream.js';
import { instant, isDate } from '../src/approvals-lib.js';

const BASE = 'https://api.todoist.com/api/v1';

/** @returns {Promise<any>} the JSON answer, {} for an empty one, or null for 404 */
async function call(/** @type {string} */ path, /** @type {RequestInit} */ init = {}) {
  if (!process.env.TODOIST_TOKEN) throw new UpstreamError('TODOIST_TOKEN is not set in Vercel');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), authorization: `Bearer ${process.env.TODOIST_TOKEN}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch {
    throw new UpstreamError('Could not reach Todoist');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError(`Todoist returned ${res.status}${res.status === 401 || res.status === 403 ? ', check TODOIST_TOKEN' : ''}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/** @returns {Promise<{ id: string, done: boolean, due: string | null, recurring: boolean } | null>} */
export async function getTask(/** @type {string} */ id) {
  const t = await call(`/tasks/${encodeURIComponent(id)}`);
  if (!t) return null;
  return { id: String(t.id), done: !!(t.checked || t.is_deleted), due: t.due ? (t.due.datetime || t.due.date) : null, recurring: !!t.due?.is_recurring };
}

/** Due fields for a when: a plain date stays a date; a time is sent as UTC (a local time is read in `tz`). */
function dueFields(/** @type {string} */ when, /** @type {string} */ tz) {
  return isDate(when) ? { due_date: when } : { due_datetime: new Date(instant(when, tz)).toISOString() };
}

export async function setDue(/** @type {string} */ id, /** @type {string} */ when, /** @type {string} */ tz) {
  const r = await call(`/tasks/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(dueFields(when, tz)) });
  if (!r) throw new UpstreamError('Todoist no longer has that task');
}

export async function close(/** @type {string} */ id) {
  const r = await call(`/tasks/${encodeURIComponent(id)}/close`, { method: 'POST' });
  if (!r) throw new UpstreamError('Todoist no longer has that task');
}

/** @returns {Promise<string>} the new task's id */
export async function create(/** @type {{ content: string, due: string | null, priority: string }} */ p, /** @type {string} */ tz) {
  const priority = 5 - Number(p.priority.slice(1)); // p1 is Todoist's 4
  const r = await call('/tasks', { method: 'POST', body: JSON.stringify({ content: p.content, priority, ...(p.due ? dueFields(p.due, tz) : {}) }) });
  if (!r?.id) throw new UpstreamError('Todoist did not return the new task');
  return String(r.id);
}
