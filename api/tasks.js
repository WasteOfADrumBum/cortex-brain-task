// GET /api/tasks  -> { tasks: [{ id, content, priority, due, duration, labels, projectId, sectionId, url }],
//                      labels: [name] | null, projects: [{ id, name }] | null, sections: [{ id, name, projectId }] | null, warnings: [text] }
// Works as a Vercel function (api/tasks.js) or a Next.js App Router route (app/api/tasks/route.js).
// Env: TODOIST_TOKEN (Todoist > Settings > Integrations > Developer), DASH_KEY (any long random string)
// Labels, projects and sections are extras: if one of them fails it comes back as null with a warning, and tasks still load.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Reads every page of a Todoist v1 list endpoint. Returns { items } or { error: text safe to show }.
async function readAll(path) {
  const all = [];
  let cursor = null;
  do {
    const url = new URL(`https://api.todoist.com/api/v1/${path}`);
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.TODOIST_TOKEN}` } });
    } catch {
      return { error: 'Could not reach Todoist' };
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? ', check TODOIST_TOKEN' : '';
      return { error: `Todoist returned ${res.status}${hint}` };
    }
    const data = await res.json();
    all.push(...(data.results || []));
    cursor = data.next_cursor;
  } while (cursor);
  return { items: all };
}

export async function GET(request) {
  if (!process.env.DASH_KEY) return json({ error: 'DASH_KEY is not set in Vercel' }, 500);
  if (request.headers.get('x-dash-key') !== process.env.DASH_KEY) {
    return json({ error: 'Missing or wrong dashboard key' }, 401);
  }
  if (!process.env.TODOIST_TOKEN) return json({ error: 'TODOIST_TOKEN is not set in Vercel' }, 500);
  const [t, l, p, s] = await Promise.all(['tasks', 'labels', 'projects', 'sections'].map(readAll));
  if (t.error) return json({ error: t.error }, 502);

  const warnings = [];
  const extra = (name, r, map) => {
    if (r.error) { warnings.push(`Todoist ${name}: ${r.error}`); return null; }
    return r.items.map(map);
  };
  // The response shape is TasksResponse in src/types.d.ts, the same type the /demo sample tasks use (checked by npm test).
  /** @type {import('../src/types').Task[]} */
  const tasks = t.items.map(t => ({
    id: t.id,
    content: t.content,
    priority: t.priority, // 4 = P1, 1 = P4
    due: t.due ? (t.due.datetime || t.due.date) : null,
    duration: t.duration ? (t.duration.unit === 'day' ? t.duration.amount * 480 : t.duration.amount) : null,
    labels: t.labels || [],
    projectId: t.project_id || null,
    sectionId: t.section_id || null,
    url: `https://app.todoist.com/app/task/${t.id}`
  }));
  /** @type {import('../src/types').TasksResponse} */
  const body = {
    tasks,
    labels: extra('labels', l, x => x.name),
    projects: extra('projects', p, x => ({ id: x.id, name: x.name })),
    sections: extra('sections', s, x => ({ id: x.id, name: x.name, projectId: x.project_id })),
    warnings
  };
  return json(body);
}
