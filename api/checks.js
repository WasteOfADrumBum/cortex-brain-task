// GET /api/checks?title=Brain%20sweep%20ran&title=Muse%20check%20ran
//   -> { since, checks: [{ title, completedAt, description } | { title, completedAt: null, description: "" }] }
// The most recent completion of each named Todoist task in the last 7 days, read from Todoist's activity log.
// The activity log is used because "Brain sweep ran" is recurring: completing a recurring task only moves its due
// date, so it never appears in the completed-tasks list. 7 days is also all the history a free Todoist plan keeps.
// Env: TODOIST_TOKEN, DASH_KEY (same as /api/tasks)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const WINDOW_MS = 7 * 864e5;
const norm = s => String(s ?? '').trim().toLowerCase();

export async function GET(request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (request.headers.get('x-dash-key') !== process.env.DASH_KEY) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  if (!process.env.TODOIST_TOKEN) return json({ error: 'TODOIST_TOKEN is not set in Vercel' }, 500);
  const titles = new URL(request.url).searchParams.getAll('title').map(t => t.trim()).filter(Boolean).slice(0, 5);
  if (!titles.length) return json({ error: 'Name at least one task with ?title=' }, 400);

  // A minute inside the window, so the request never asks for history older than the plan allows.
  const since = new Date(Date.now() - WINDOW_MS + 60000);
  const wanted = new Map(titles.map(t => [norm(t), t]));
  /** @type {Map<string, import('../src/types').TodoistCheck>} */
  const latest = new Map();
  let cursor = null, pages = 0;
  do {
    const url = new URL('https://api.todoist.com/api/v1/activities');
    url.searchParams.set('object_type', 'item');
    url.searchParams.set('event_type', 'completed');
    url.searchParams.set('date_from', since.toISOString());
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TODOIST_TOKEN}` } });
    } catch {
      return json({ error: 'Could not reach Todoist' }, 502);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ', check TODOIST_TOKEN' : '';
      return json({ error: `Todoist activity log returned ${res.status}${hint}` }, 502);
    }
    const data = await res.json();
    for (const ev of data.results || []) {
      const key = norm(ev.extra_data?.content);
      if (!wanted.has(key)) continue;
      const prev = latest.get(key);
      if (prev && prev.completedAt >= ev.event_date) continue;
      latest.set(key, { title: wanted.get(key), completedAt: ev.event_date, description: String(ev.extra_data?.description || '') });
    }
    cursor = data.next_cursor;
  } while (cursor && ++pages < 10);

  /** @type {import('../src/types').ChecksResponse} */
  const body = {
    since: since.toISOString(),
    checks: titles.map(t => latest.get(norm(t)) || { title: t, completedAt: null, description: '' })
  };
  return json(body);
}
