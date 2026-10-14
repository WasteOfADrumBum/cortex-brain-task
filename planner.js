// Cortex planner ("At a glance"): Todoist tasks, today, this week and this month.
// Data comes from /api/tasks and /api/calendar. When they fail, the planner says why and shows nothing in their place.
// On /demo it shows the sample tasks and calendar from src/demo/ (same shapes as the routes, src/types.d.ts).
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

let TASKS = [], EVENTS = [], TASK_META = {}, firstRender = true;

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
  if (Demo.on) return loadDemo(today, from, to);
  const k = getKey(), headers = k ? { 'x-dash-key': k } : {};
  // A network failure resolves to null so the other route still reports its own result.
  const get = url => fetch(url, { headers }).catch(() => null);
  const [tr, cr, rulesError] = await Promise.all([
    get('/api/tasks'),
    get(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`),
    TaskRules.ready().then(() => '', e => (TaskRules.fallback(), e.message))
  ]);
  const rulesNote = rulesError ? ` ${rulesError} Sizes and topics are off until it does.` : '';
  if (tr?.status === 401 || cr?.status === 401) {
    $('keyform').classList.add('on');
    TASKS = []; EVENTS = []; TASK_META = {};
    status((k ? 'That dashboard key was not accepted. Check it matches DASH_KEY in Vercel.'
      : 'Enter your dashboard key to load your tasks and calendar.') + rulesNote, true);
    CortexHeader.setStatus('warn', 'Key needed');
    render();
    return;
  }
  const [t, c] = await Promise.all([readApi('Tasks', tr), readApi('Calendar', cr)]);
  $('keyform').classList.remove('on');
  if (t.error || c.error) {
    // Show whichever route loaded; the one that failed stays empty and the status names it.
    TASKS = t.data?.tasks || []; EVENTS = c.data?.events || [];
    TASK_META = t.data ? { labels: t.data.labels, projects: t.data.projects, sections: t.data.sections } : {};
    status(`${[t.error, c.error].filter(Boolean).join(' ')}${rulesNote}`, true);
    CortexHeader.setStatus('warn', 'Data unavailable');
  } else {
    TASKS = t.data.tasks || []; EVENTS = c.data.events || [];
    // Todoist labels, projects and sections (null when Todoist could not list them).
    TASK_META = { labels: t.data.labels, projects: t.data.projects, sections: t.data.sections };
    // Some calendar feeds can fail while others load: show what loaded and name the skipped ones.
    const skipped = c.data.errors || [], warn = t.data.warnings || [];
    status(`Updated ${fmtTime(new Date())}. Refreshes every 10 minutes.${skipped.length
      ? ` Skipped ${skipped.length === 1 ? 'a calendar feed' : `${skipped.length} calendar feeds`}: ${skipped.join('. ')}.` : ''}${warn.length ? ` ${warn.join('. ')}.` : ''}${rulesNote}`,
      skipped.length > 0 || warn.length > 0 || !!rulesError);
    CortexHeader.setStatus('ok', 'Planner live');
  }
  render();
}
// The demo's sample tasks and calendar, in the same shapes the routes return.
async function loadDemo(today, from, to) {
  const [demo, rulesError] = await Promise.all([Demo.data(), TaskRules.ready().then(() => '', e => (TaskRules.fallback(), e.message))]);
  const t = demo.tasks(today), c = demo.calendar(from, to);
  TASKS = t.tasks; EVENTS = c.events;
  TASK_META = { labels: t.labels, projects: t.projects, sections: t.sections };
  status(`Sample tasks and calendar, updated ${fmtTime(new Date())}.${rulesError ? ` ${rulesError}` : ''}`, !!rulesError);
  CortexHeader.setStatus('demo', 'Demo data');
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
// Buckets come from the shared rules in task-rules.js (also used by Home's Top 3).
function prepTasks(today) {
  return TaskRules.buckets(TaskRules.prepare({ tasks: TASKS, ...TASK_META }).tasks, today);
}
function dueLabel(t, today) {
  if (!t.dueDay) return { text: 'No date' };
  const diff = Math.round((t.dueDay - today) / 864e5);
  let text = diff < 0 ? `Overdue ${-diff} day${diff === -1 ? '' : 's'}` : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
    : diff < 7 ? t.dueDay.toLocaleDateString([], { weekday: 'long' }) : t.dueDay.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (t.due.length > 10) text += `, ${fmtTime(t.dueAt)}`;
  return { text, overdue: diff < 0 };
}
function taskLi(t, today, needsSize) {
  const d = dueLabel(t, today), p = 5 - t.priority;
  const meta = [
    needsSize ? '<span class="needs-size">Needs size</span>' : '',
    p <= 3 ? `<span class="pri p${p}">P${p}<span class="sr"> priority</span></span>` : '',
    `<span class="${d.overdue ? 'overdue' : ''}"><span class="sr">Due </span>${esc(d.text)}</span>`,
    t.duration ? `<span>${fmtDur(t.duration)}</span>` : ''
  ].join('');
  const url = t.url || `https://app.todoist.com/app/task/${encodeURIComponent(t.id)}`;
  return `<li class="task"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(t.content)}<span class="sr"> (opens Todoist)</span></a><p class="meta">${meta}</p></li>`;
}
const LIST_CAP = 5; // lists longer than this scroll inside their own box
function taskList(key, label, items, today) {
  const ul = `<ul class="tasks">${items.map(t => taskLi(t, today, key === 'other')).join('')}</ul>`;
  if (items.length <= LIST_CAP) return ul;
  return `<div class="task-scroll fade" data-list="${key}" tabindex="0" role="region" aria-label="${label}, ${items.length} tasks, scrollable">${ul}</div>
    <p class="more-cue" aria-hidden="true"></p>`;
}
// Size each scroller to show the first five tasks plus a sliver of the sixth, then keep the "N more" cue current.
function fitTaskLists() {
  document.querySelectorAll('.task-scroll').forEach(box => {
    const li = box.querySelectorAll('li');
    if (!box.offsetParent) return; // inside a closed <details>, measured again on toggle
    if (li.length > LIST_CAP) box.style.maxHeight = `${li[LIST_CAP].offsetTop - li[0].offsetTop + 28}px`;
    taskCue(box);
  });
}
function taskCue(box) {
  const bottom = box.scrollTop + box.clientHeight, li = box.querySelectorAll('li');
  const below = [...li].filter(el => el.offsetTop + el.offsetHeight / 2 > bottom).length;
  box.classList.toggle('fade', below > 0);
  const cue = box.nextElementSibling;
  if (cue) cue.textContent = below ? `${below} more below, scroll the list` : 'End of list';
}
function renderTasks(today) {
  const g = prepTasks(today), size = TaskRules.config.size;
  const keep = {}, open = document.querySelector('#task-groups details')?.open;
  document.querySelectorAll('.task-scroll').forEach(b => { keep[b.dataset.list] = b.scrollTop; });
  const group = (cls, title, hint, items, emptyMsg) => `
    <section class="group ${cls}" aria-labelledby="g-${cls}">
      <h3 id="g-${cls}">${title} <span class="count">${items.length}</span></h3>
      <p class="hint">${hint}</p>
      ${items.length ? taskList(cls, title, items, today) : `<p class="empty">${emptyMsg}</p>`}
    </section>`;
  $('task-groups').innerHTML =
    group('crit', 'Critical this week', 'Overdue, or P1 and P2 due in the next 7 days', g.crit, 'Nothing critical. Pick up something below.') +
    group('quick', 'Quick pickups', size.quick?.hint || '', g.quick, 'No quick tasks right now.') +
    group('big', 'Big tasks', size.deep?.hint || '', g.big, 'No big tasks right now.') +
    (g.other.length ? `<section class="group" aria-label="Everything else"><details${open ? ' open' : ''}><summary>Everything else (${g.other.length})</summary>${taskList('other', 'Everything else', g.other, today)}</details></section>` : '');
  $('tasks-sub').textContent = `${g.count} open`;
  document.querySelectorAll('.task-scroll').forEach(b => {
    b.scrollTop = keep[b.dataset.list] || 0;
    b.addEventListener('scroll', () => taskCue(b), { passive: true });
  });
  fitTaskLists();
  document.querySelector('#task-groups details')?.addEventListener('toggle', fitTaskLists);
}
addEventListener('resize', () => fitTaskLists());

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
}
// In the demo the button is marked data-write, so it shows "Demo only" and the planner never starts Google sign-in.
$('btn-auth').addEventListener('click', () => (driveState === 'linked' ? Drive.signOut() : Drive.signIn()));
if (!Demo.on) {
  Drive.init(event => { driveState = event === 'signed-out' ? 'ready' : event; renderDrive(); })
    .then(r => { driveState = r; renderDrive(); })
    .catch(() => { driveState = 'error'; renderDrive(); });
  renderDrive();
}

CortexHeader.setStatus('', 'Loading');
setInterval(load, 10 * 60000);
load();
