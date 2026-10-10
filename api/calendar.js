// GET /api/calendar?from=ISO&to=ISO -> { events: [{ title, start, end, allDay, calendar }] }
// Reads Google Calendar "secret address in iCal format" feeds. No Google Cloud project, no token refresh.
// Env: GCAL_ICS_URLS (comma-separated secret iCal URLs), DASH_KEY
// Dependency: npm i ical-expander

import IcalExpander from 'ical-expander';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const norm = (summary, s, e, calendar) => ({
  title: summary || 'Busy',
  allDay: s.isDate,
  // All-day events stay as plain dates so they never shift a day across time zones
  start: s.isDate ? s.toString() : s.toJSDate().toISOString(),
  end: e.isDate ? e.toString() : e.toJSDate().toISOString(),
  calendar
});

export async function GET(request) {
  if (!process.env.DASH_KEY || request.headers.get('x-dash-key') !== process.env.DASH_KEY) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  const params = new URL(request.url).searchParams;
  const from = new Date(params.get('from') || Date.now());
  const to = new Date(params.get('to') || Date.now() + 42 * 864e5);
  if (isNaN(from) || isNaN(to) || to - from > 100 * 864e5) return json({ error: 'Bad date range' }, 400);

  const feeds = (process.env.GCAL_ICS_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  try {
    const lists = await Promise.all(feeds.map(async (feed, i) => {
      const res = await fetch(feed);
      if (!res.ok) throw new Error(`Calendar feed ${i + 1} returned ${res.status}`);
      const expander = new IcalExpander({ ics: await res.text(), maxIterations: 2000 });
      const { events, occurrences } = expander.between(from, to);
      return [
        ...events.map(e => norm(e.summary, e.startDate, e.endDate, i)),
        ...occurrences.map(o => norm(o.item.summary, o.startDate, o.endDate, i))
      ];
    }));
    return json({ events: lists.flat() });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
