// GET /api/tasks  -> { tasks: [{ id, content, priority, due, duration, labels, url }] }
// Works as a Vercel function (api/tasks.js) or a Next.js App Router route (app/api/tasks/route.js).
// Env: TODOIST_TOKEN (Todoist > Settings > Integrations > Developer), DASH_KEY (any long random string)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET(request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (request.headers.get('x-dash-key') !== process.env.DASH_KEY) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  if (!process.env.TODOIST_TOKEN) return json({ error: 'TODOIST_TOKEN is not set in Vercel' }, 500);
  const all = [];
  let cursor = null;
  do {
    const url = new URL('https://api.todoist.com/api/v1/tasks');
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TODOIST_TOKEN}` } });
    } catch {
      return json({ error: 'Could not reach Todoist' }, 502);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ', check TODOIST_TOKEN' : '';
      return json({ error: `Todoist returned ${res.status}${hint}` }, 502);
    }
    const data = await res.json();
    all.push(...(data.results || []));
    cursor = data.next_cursor;
  } while (cursor);

  const tasks = all.map(t => ({
    id: t.id,
    content: t.content,
    priority: t.priority, // 4 = P1, 1 = P4
    due: t.due ? (t.due.datetime || t.due.date) : null,
    duration: t.duration ? (t.duration.unit === 'day' ? t.duration.amount * 480 : t.duration.amount) : null,
    labels: t.labels || [],
    url: `https://app.todoist.com/app/task/${t.id}`
  }));
  return json({ tasks });
}
