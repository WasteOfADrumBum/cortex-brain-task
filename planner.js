// Cortex planner ("At a glance"): Todoist tasks, today, this week and this month.
// Data comes from /api/tasks and /api/calendar; sample data is shown when they are not set up.
const START_H = 6, END_H = 22, SPAN = (END_H - START_H) * 60, PX = 48 / 60, MIN_OPEN = 30;
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDate = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDur = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return [h ? `${h} hr` : '', r ? `${r} min` : ''].filter(Boolean).join(' '); };
const atMin = (day, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), START_H, m);

let TASKS = [], EVENTS = [], firstRender = true;

/* ---------- data ---------- */
function getKey() { try { return localStorage.getItem('dashKey') || ''; } catch { return ''; } }
function setKey(k) { try { localStorage.setItem('dashKey', k); } catch {} }

function monthRange(today) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + days) / 7);
  return { start, end: addDays(start, weeks * 7), weeks };
}

async function load() {
  const today = sod(new Date());
  const wkStart = addDays(today, -today.getDay());
  const { start, end } = monthRange(today);
  const from = start < wkStart ? start : wkStart;
  const to = end > addDays(wkStart, 7) ? end : addDays(wkStart, 7);
  const k = getKey(), headers = k ? { 'x-dash-key': k } : {};
  // A network failure resolves to null so the other route still reports its own result.
  const get = url => fetch(url, { headers }).catch(() => null);
  const [tr, cr] = await Promise.all([
    get('/api/tasks'),
    get(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
  ]);
  if (tr?.status === 401 || cr?.status === 401) {
    $('keyform').classList.add('on');
    ({ tasks: TASKS, events: EVENTS } = sample(today));
    status(k ? 'That dashboard key was not accepted. Check it matches DASH_KEY in Vercel. Showing sample data until then.'
      : 'Enter your dashboard key to load your tasks and calendar. Showing sample data until then.', true);
    CortexHeader.setStatus('warn', 'Key needed');
    render();
    return;
  }
  const [t, c] = await Promise.all([readApi('Tasks', tr), readApi('Calendar', cr)]);
  $('keyform').classList.remove('on');
  if (t.error || c.error) {
    ({ tasks: TASKS, events: EVENTS } = sample(today));
    status(`Showing sample data. ${[t.error, c.error].filter(Boolean).join(' ')}`, true);
    CortexHeader.setStatus('warn', 'Sample data');
  } else {
    TASKS = t.data.tasks || []; EVENTS = c.data.events || [];
    // Some calendar feeds can fail while others load: show what loaded and name the skipped ones.
    const skipped = c.data.errors || [];
    status(`Updated ${fmtTime(new Date())}. Refreshes every 10 minutes.${skipped.length
      ? ` Skipped ${skipped.length === 1 ? 'a calendar feed' : `${skipped.length} calendar feeds`}: ${skipped.join('. ')}.` : ''}`, skipped.length > 0);
    CortexHeader.setStatus('ok', 'Planner live');
  }
  render();
}
// Turns one API response into { data } or { error: a sentence saying what failed }.
// The routes never put secrets in their error text, so it is safe to show.
async function readApi(name, res) {
  if (!res) return { error: `${name}: could not reach the API (offline or blocked).` };
  let body = null;
  try { body = await res.json(); } catch {}
  if (res.ok && body) return { data: body };
  if (res.status === 404) return { error: `${name}: API route not found (404), so the functions are not deployed.` };
  if (res.ok) return { error: `${name}: API did not return JSON.` };
  return { error: `${name}: ${body?.error || 'API error'} (${res.status}).` };
}
function status(msg, note) { const s = $('status'); s.textContent = msg; s.classList.toggle('note', !!note); }

/* ---------- tasks ---------- */
function prepTasks(today) {
  const wk = addDays(today, 7);
  const L = t => (t.labels || []).map(l => l.toLowerCase());
  const quick = t => (t.duration && t.duration <= 30) || L(t).some(l => ['quick', 'small', '5min', '15min'].includes(l));
  const big = t => (t.duration && t.duration >= 60) || L(t).some(l => ['deep', 'big', 'large'].includes(l));
  const list = TASKS.map(t => {
    const dueAt = t.due ? (t.due.length > 10 ? new Date(t.due) : localDate(t.due)) : null;
    return { ...t, dueAt, dueDay: dueAt ? sod(dueAt) : null };
  }).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.priority - a.priority);
  const isCrit = t => t.dueDay && (t.dueDay < today || (t.dueDay < wk && t.priority >= 3));
  const crit = list.filter(isCrit), rest = list.filter(t => !isCrit(t));
  return {
    crit,
    quick: rest.filter(quick),
    big: rest.filter(t => !quick(t) && big(t)),
    other: rest.filter(t => !quick(t) && !big(t))
  };
}
function dueLabel(t, today) {
  if (!t.dueDay) return { text: 'No date' };
  const diff = Math.round((t.dueDay - today) / 864e5);
  let text = diff < 0 ? `Overdue ${-diff} day${diff === -1 ? '' : 's'}` : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
    : diff < 7 ? t.dueDay.toLocaleDateString([], { weekday: 'long' }) : t.dueDay.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (t.due.length > 10) text += `, ${fmtTime(t.dueAt)}`;
  return { text, overdue: diff < 0 };
}
function taskLi(t, today) {
  const d = dueLabel(t, today), p = 5 - t.priority;
  const meta = [
    p <= 3 ? `<span class="pri p${p}">P${p}<span class="sr"> priority</span></span>` : '',
    `<span class="${d.overdue ? 'overdue' : ''}"><span class="sr">Due </span>${esc(d.text)}</span>`,
    t.duration ? `<span>${fmtDur(t.duration)}</span>` : ''
  ].join('');
  const url = t.url || `https://app.todoist.com/app/task/${encodeURIComponent(t.id)}`;
  return `<li class="task"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(t.content)}<span class="sr"> (opens Todoist)</span></a><p class="meta">${meta}</p></li>`;
}
function renderTasks(today) {
  const g = prepTasks(today);
  const group = (cls, title, hint, items, emptyMsg) => `
    <section class="group ${cls}" aria-labelledby="g-${cls}">
      <h3 id="g-${cls}">${title} <span class="count">${items.length}</span></h3>
      <p class="hint">${hint}</p>
      ${items.length ? `<ul class="tasks">${items.map(t => taskLi(t, today)).join('')}</ul>` : `<p class="empty">${emptyMsg}</p>`}
    </section>`;
  $('task-groups').innerHTML =
    group('crit', 'Critical this week', 'Overdue, or P1 and P2 due in the next 7 days', g.crit, 'Nothing critical. Pick up something below.') +
    group('quick', 'Quick pickups', '30 minutes or less', g.quick, 'No quick tasks right now.') +
    group('big', 'Big tasks', 'An hour or more, best for a long open block', g.big, 'No big tasks right now.') +
    (g.other.length ? `<section class="group" aria-label="Everything else"><details><summary>Everything else (${g.other.length})</summary><ul class="tasks">${g.other.map(t => taskLi(t, today)).join('')}</ul></details></section>` : '');
  $('tasks-sub').textContent = `${TASKS.length} open`;
}

/* ---------- events ---------- */
function normEvents() {
  return EVENTS.map(e => e.allDay
    ? { ...e, start: localDate(e.start), end: localDate(e.end) }
    : { ...e, start: new Date(e.start), end: new Date(e.end) });
}
function eventsOn(day, evs) {
  const next = addDays(day, 1);
  return {
    all: evs.filter(e => e.allDay && e.start < next && e.end > day),
    timed: evs.filter(e => !e.allDay && e.start < next && e.end > day).sort((a, b) => a.start - b.start)
  };
}
function place(day, list) {
  const base = atMin(day, 0), items = [], outside = [];
  for (const e of list) {
    const s = Math.max(0, (e.start - base) / 6e4), f = Math.min(SPAN, (e.end - base) / 6e4);
    if (f <= s) { outside.push(e); continue; }
    items.push({ ev: e, s, f: Math.max(f, s + 15) });
  }
  items.sort((a, b) => a.s - b.s || b.f - a.f);
  let cluster = [], end = -1;
  const flush = () => {
    const lanes = [];
    for (const it of cluster) { let i = lanes.findIndex(x => x <= it.s); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = it.f; it.lane = i; }
    for (const it of cluster) it.lanes = lanes.length;
    cluster = [];
  };
  for (const it of items) { if (cluster.length && it.s >= end) { flush(); end = -1; } cluster.push(it); end = Math.max(end, it.f); }
  flush();
  return { items, outside };
}
function openBlocks(items, fromMin) {
  const busy = items.map(i => [i.s, i.f]).sort((a, b) => a[0] - b[0]), out = [];
  let cur = Math.ceil(Math.max(0, fromMin) / 15) * 15;
  for (const [s, f] of busy) { if (s - cur >= MIN_OPEN) out.push([cur, s]); cur = Math.max(cur, f); }
  if (SPAN - cur >= MIN_OPEN) out.push([cur, SPAN]);
  return out;
}
function evLi(it) {
  const e = it.ev, h = (it.f - it.s) * PX;
  const w = 100 / it.lanes;
  return `<li class="ev${h < 34 ? ' short' : ''}" style="top:${it.s * PX}px;height:${h - 2}px;left:${it.lane * w}%;width:calc(${w}% - 3px)">
    <span class="ev-t">${esc(e.title)}</span><span class="ev-time"><span class="sr">, </span>${fmtTime(e.start)}<span class="sr"> to ${fmtTime(e.end)}</span></span></li>`;
}
function gutterHTML() {
  let h = '';
  for (let i = START_H; i <= END_H; i++) h += `<span style="top:${(i - START_H) * 48}px">${new Date(2000, 0, 1, i).toLocaleTimeString([], { hour: 'numeric' })}</span>`;
  return `<div class="gutter" aria-hidden="true">${h}</div>`;
}
function nowMin(day) { const n = new Date(); return sod(n).getTime() === day.getTime() ? (n - atMin(day, 0)) / 6e4 : null; }
function nowLine(m) { return m !== null && m >= 0 && m <= SPAN ? `<div class="now" data-now style="top:${m * PX}px" aria-hidden="true"></div>` : ''; }

function renderDay(today, evs) {
  const { all, timed } = eventsOn(today, evs);
  const { items, outside } = place(today, timed);
  const nm = nowMin(today);
  const open = openBlocks(items, nm ?? 0);
  const total = open.reduce((a, [s, f]) => a + f - s, 0);
  $('open-sum').textContent = open.length ? `${open.length} open block${open.length > 1 ? 's' : ''}, ${fmtDur(total)} free` : 'No open blocks left today';
  $('day-allday').innerHTML = all.map(e => `<li class="chip">${esc(e.title)}</li>`).join('');
  $('day-allday').hidden = !all.length;
  const blocks = [
    ...items.map(it => ({ s: it.s, html: evLi(it) })),
    ...open.map(([s, f]) => ({ s, html: `<li class="open" style="top:${s * PX}px;height:${(f - s) * PX - 2}px">Open ${fmtDur(f - s)}<span class="sr">, ${fmtTime(atMin(today, s))} to ${fmtTime(atMin(today, f))}</span></li>` }))
  ].sort((a, b) => a.s - b.s);
  $('day-scroll').innerHTML = `<div class="tl">${gutterHTML()}<div class="track">${nowLine(nm)}<ol aria-label="Events and open time today">${blocks.map(b => b.html).join('')}</ol></div></div>`;
  $('day-outside').textContent = outside.length ? `Outside 6 AM to 10 PM: ${outside.map(e => `${e.title} at ${fmtTime(e.start)}`).join(', ')}` : '';
}

function renderWeek(today, evs) {
  const start = addDays(today, -today.getDay());
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  $('week-range').textContent = `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} to ${days[6].toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  let head = '<div aria-hidden="true"></div>', body = gutterHTML();
  days.forEach((d, i) => {
    const { all, timed } = eventsOn(d, evs), isToday = d.getTime() === today.getTime();
    const label = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    head += `<div class="wk-day" id="wd${i}"${isToday ? ' aria-current="date"' : ''}><span class="sr">${label}</span><span aria-hidden="true">${d.toLocaleDateString([], { weekday: 'short' })}<strong>${d.getDate()}</strong></span>${all.length ? `<ul aria-label="All-day">${all.map(e => `<li>${esc(e.title)}</li>`).join('')}</ul>` : ''}</div>`;
    const { items, outside } = place(d, timed);
    const extra = outside.length ? `<li class="sr">Outside 6 AM to 10 PM: ${outside.map(e => esc(e.title)).join(', ')}</li>` : '';
    body += `<div class="track${isToday ? ' today' : ''}">${isToday ? nowLine(nowMin(d)) : ''}<ol aria-labelledby="wd${i}">${items.map(evLi).join('')}${extra}${!items.length && !extra ? '<li class="sr">No events</li>' : ''}</ol></div>`;
  });
  $('week-scroll').innerHTML = `<div class="wk"><div class="wk-head">${head}</div><div class="wk-body">${body}</div></div>`;
}

function renderMonth(today, evs) {
  const { start, weeks } = monthRange(today);
  const name = today.toLocaleDateString([], { month: 'long', year: 'numeric' });
  $('month-h').textContent = name;
  const wd = [...Array(7)].map((_, i) => addDays(start, i));
  let rows = '';
  for (let w = 0; w < weeks; w++) {
    rows += '<tr>';
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i), { all, timed } = eventsOn(d, evs);
      const list = [...all.map(e => ({ t: e.title, all: true })), ...timed.map(e => ({ t: e.title }))];
      const isToday = d.getTime() === today.getTime(), other = d.getMonth() !== today.getMonth();
      rows += `<td class="${other ? 'other' : ''}"${isToday ? ' aria-current="date"' : ''}>
        <span class="dnum"><span class="sr">${d.toLocaleDateString([], { weekday: 'long', month: 'long' })} </span>${d.getDate()}</span>
        ${list.length ? `<ul>${list.map((e, n) => `<li class="${e.all ? 'all' : ''}${n > 2 ? ' sr' : ''}">${esc(e.t)}</li>`).join('')}</ul>` : ''}
        ${list.length > 3 ? `<span class="more" aria-hidden="true">+${list.length - 3} more</span>` : ''}</td>`;
    }
    rows += '</tr>';
  }
  $('month-grid').innerHTML = `<table class="month"><caption class="sr">${name} schedule</caption><thead><tr>${wd.map(d => `<th scope="col"><abbr title="${d.toLocaleDateString([], { weekday: 'long' })}">${d.toLocaleDateString([], { weekday: 'short' })}</abbr></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function render() {
  const today = sod(new Date()), evs = normEvents();
  const keep = { d: $('day-scroll').scrollTop, w: $('week-scroll').scrollTop };
  $('today-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  renderTasks(today); renderDay(today, evs); renderWeek(today, evs); renderMonth(today, evs);
  if (firstRender) {
    const m = nowMin(today), y = m !== null && m > 60 ? (Math.min(m, SPAN) - 60) * PX : 0;
    $('day-scroll').scrollTop = y; $('week-scroll').scrollTop = y; firstRender = false;
  } else { $('day-scroll').scrollTop = keep.d; $('week-scroll').scrollTop = keep.w; }
}

/* ---------- sample data (used when the API routes are missing) ---------- */
function sample(today) {
  const at = (d, h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  const ev = (d, h1, m1, h2, m2, title) => ({ title, start: at(d, h1, m1), end: at(d, h2, m2), allDay: false });
  const { start, end } = monthRange(today), events = [];
  for (let d = new Date(start); d < end; d = addDays(d, 1)) {
    const w = d.getDay();
    if (w >= 1 && w <= 5) events.push(ev(d, 9, 0, 9, 15, 'Standup'));
    if (w === 2 || w === 4) events.push(ev(d, 17, 30, 18, 30, 'Soccer practice'));
    if (w === 3) events.push(ev(d, 14, 0, 15, 0, 'Release deploy'));
    if (w === 4) events.push(ev(d, 11, 0, 11, 30, '1:1 with manager'));
    if (w === 6) events.push(ev(d, 9, 0, 10, 0, 'Motorcycle service'));
    if (w === 1) events.push({ title: 'Trash and recycling', start: key(d), end: key(addDays(d, 1)), allDay: true });
  }
  events.push(ev(today, 10, 0, 11, 0, 'Sprint planning'), ev(today, 10, 30, 11, 15, 'Vendor demo'),
    ev(today, 15, 15, 15, 45, 'School pickup'), ev(today, 18, 0, 19, 0, 'Family dinner'), ev(today, 5, 30, 5, 50, 'Dog walk'));
  events.push({ title: 'Kids half day', start: key(addDays(today, 3)), end: key(addDays(today, 4)), allDay: true });
  const due = n => key(addDays(today, n));
  const tasks = [
    { id: '1', content: 'Fix map layer bug for agency client', priority: 4, due: due(-1), duration: 120, labels: [] },
    { id: '2', content: 'Send senior dev promotion notes to manager', priority: 4, due: due(1), duration: 45, labels: [] },
    { id: '3', content: 'Review Codex PR on cortex-brain-task', priority: 3, due: due(2), duration: 30, labels: [] },
    { id: '4', content: 'Schedule dentist for kids', priority: 2, due: due(0), duration: 10, labels: [] },
    { id: '5', content: 'Renew motorcycle registration', priority: 1, due: due(5), duration: 15, labels: [] },
    { id: '6', content: 'Reply to recruiter on LinkedIn', priority: 1, due: null, duration: 15, labels: [] },
    { id: '7', content: 'Edit fall photo set for One Small Photo', priority: 2, due: due(9), duration: 180, labels: [] },
    { id: '8', content: 'Write case study for portfolio', priority: 1, due: null, duration: 90, labels: [] },
    { id: '9', content: 'Order furnace filters', priority: 1, due: due(3), duration: 0, labels: ['quick'] },
    { id: '10', content: 'Back up drum recordings', priority: 1, due: null, duration: 0, labels: [] }
  ];
  return { tasks, events };
}

/* ---------- boot ---------- */
$('keyform').addEventListener('submit', e => { e.preventDefault(); setKey($('keyinput').value.trim()); $('keyinput').value = ''; load(); });
setInterval(() => {
  const today = sod(new Date());
  document.querySelectorAll('[data-now]').forEach(el => { const m = nowMin(today); if (m !== null) el.style.top = `${Math.min(Math.max(m, 0), SPAN) * PX}px`; });
}, 60000);
/* ---------- Drive link in the shared header (same session as the dashboard) ---------- */
let driveState = 'unconfigured';
function renderDrive() {
  const auth = $('btn-auth');
  auth.textContent = driveState === 'linked' ? 'Sign out' : driveState === 'expired' ? 'Relink Drive' : 'Link Drive';
  auth.disabled = !['ready', 'linked', 'expired', 'error'].includes(driveState);
  $('btn-demo').hidden = driveState === 'linked';
}
$('btn-auth').addEventListener('click', () => (driveState === 'linked' ? Drive.signOut() : Drive.signIn()));
// Preview is the dashboard's sample mode; the planner already shows sample data until its routes are set up.
$('btn-demo').addEventListener('click', () => { location.href = 'index.html?demo=1'; });
Drive.init(event => { driveState = event === 'signed-out' ? 'ready' : event; renderDrive(); })
  .then(r => { driveState = r; renderDrive(); })
  .catch(() => { driveState = 'error'; renderDrive(); });
renderDrive();

CortexHeader.setStatus('', 'Loading');
setInterval(load, 10 * 60000);
load();
