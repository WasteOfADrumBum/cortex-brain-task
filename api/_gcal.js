// Google Calendar writes for approved proposals, with the server's Google token (api/_drive.js), which must
// include the calendar.events scope. Only read one event, move it, or add one. Never deletes.
import { UpstreamError } from './_upstream.js';
import { googleToken } from './_drive.js';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars';

/** @returns {Promise<any>} the JSON answer, or null for 404 / 410 */
async function call(/** @type {string} */ path, /** @type {RequestInit} */ init = {}) {
  const t = await googleToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${t}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  } catch {
    throw new UpstreamError('Could not reach Google Calendar');
  }
  if (res.status === 404 || res.status === 410) return null;
  if (res.status === 403) throw new UpstreamError('Google Calendar refused (403); the refresh token may lack the calendar.events scope, so make a new one');
  if (!res.ok) throw new UpstreamError(`Google Calendar returned ${res.status}`);
  return res.json();
}

const path = (/** @type {string} */ cal, /** @type {string} */ id = '') => `/${encodeURIComponent(cal)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;

/** @returns {Promise<{ id: string, cancelled: boolean, allDay: boolean, start: string | null, end: string | null, timeZone: string | null } | null>} */
export async function getEvent(/** @type {string} */ cal, /** @type {string} */ id) {
  const e = await call(path(cal, id));
  if (!e) return null;
  return {
    id: String(e.id),
    cancelled: e.status === 'cancelled',
    allDay: !e.start?.dateTime,
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    timeZone: e.start?.timeZone || null,
  };
}

/** Moves an event to new start and end instants (ISO), keeping its own time zone. */
export async function moveEvent(/** @type {string} */ cal, /** @type {string} */ id, /** @type {string} */ start, /** @type {string} */ end, /** @type {string | null} */ timeZone) {
  const tz = timeZone ? { timeZone } : {};
  const r = await call(path(cal, id), { method: 'PATCH', body: JSON.stringify({ start: { dateTime: start, ...tz }, end: { dateTime: end, ...tz } }) });
  if (!r) throw new UpstreamError('Google Calendar no longer has that event');
}

/** @returns {Promise<string>} the new event's id */
export async function createEvent(/** @type {string} */ cal, /** @type {{ title: string, start: string, end: string }} */ e) {
  const r = await call(path(cal), { method: 'POST', body: JSON.stringify({ summary: e.title, start: { dateTime: e.start }, end: { dateTime: e.end } }) });
  if (!r?.id) throw new UpstreamError('Google Calendar did not return the new event');
  return String(r.id);
}
