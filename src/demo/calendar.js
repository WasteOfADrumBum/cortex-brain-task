// Sample calendar for /demo (Planner and Home's schedule). Made up: no real events or people.
/** @typedef {import("../types").CalendarEvent} CalendarEvent */
/** @typedef {import("../types").CalendarResponse} CalendarResponse */

/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** @param {Date} d @param {number} n */
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Events between from and to, the same shape /api/calendar returns.
 * @param {Date} from
 * @param {Date} to
 * @returns {CalendarResponse}
 */
export function calendar(from, to) {
  /** @param {Date} d @param {number} h @param {number} m */
  const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  /** @param {Date} d @param {number} h1 @param {number} m1 @param {number} h2 @param {number} m2 @param {string} title @returns {CalendarEvent} */
  const ev = (d, h1, m1, h2, m2, title) => ({ title, start: at(d, h1, m1), end: at(d, h2, m2), allDay: false, calendar: 0 });
  /** @type {CalendarEvent[]} */
  const events = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const today = new Date();
  const todayKey = ymd(today);
  for (let d = start; d < to; d = addDays(d, 1)) {
    const w = d.getDay();
    if (w >= 1 && w <= 5) events.push(ev(d, 9, 0, 9, 15, "Standup"));
    if (w === 2 || w === 4) events.push(ev(d, 17, 30, 18, 30, "Climbing gym"));
    if (w === 3) events.push(ev(d, 14, 0, 15, 0, "Release review"));
    if (w === 4) events.push(ev(d, 11, 0, 11, 30, "One-on-one"));
    if (w === 6) events.push(ev(d, 9, 0, 10, 0, "Farmers market"));
    if (w === 1) events.push({ title: "Recycling day", start: ymd(d), end: ymd(addDays(d, 1)), allDay: true, calendar: 0 });
    if (ymd(d) === todayKey) {
      events.push(ev(d, 10, 0, 11, 0, "Sprint planning"), ev(d, 10, 30, 11, 15, "Design review"),
        ev(d, 15, 15, 15, 45, "Pick up groceries"), ev(d, 18, 0, 19, 0, "Dinner with friends"), ev(d, 5, 30, 5, 50, "Morning run"));
    }
    if (ymd(d) === ymd(addDays(today, 3))) events.push({ title: "Team offsite", start: ymd(d), end: ymd(addDays(d, 1)), allDay: true, calendar: 0 });
  }
  return { events, failed: [], errors: [] };
}
