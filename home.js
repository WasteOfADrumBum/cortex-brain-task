// Cortex Home: what matters today. Each panel summarises another tab and links to it.
(() => {
  const CFG = window.CORTEX_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { fmtTime } = Brain;

  // ---------- Today strip: date, time, weather ----------
  const ringClock = HUD.ringClock($("ring-clock"));
  $("clock-tz").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");
  function tick() {
    const now = new Date();
    const h = now.getHours();
    const hh = CFG.clock24h ? String(h).padStart(2, "0") : String(h % 12 || 12);
    $("clock-hm").textContent = `${hh}:${String(now.getMinutes()).padStart(2, "0")}`;
    $("clock-ampm").textContent = CFG.clock24h ? "" : h < 12 ? "AM" : "PM";
    $("clock").setAttribute("datetime", now.toISOString());
    $("clock-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("date-day").textContent = now.getDate();
    $("date-month").textContent = now.toLocaleDateString([], { month: "long" });
    $("date-weekday").textContent = now.toLocaleDateString([], { weekday: "long" });
    ringClock.set(now);
    HomeDesk.tick(now);
  }

  const wxHost = $("weather");
  function forecastLink() {
    const url = Weather.forecastUrl();
    $("forecast-link").parentElement.hidden = !url;
    if (url) $("forecast-link").href = url;
  }
  Weather.bind($("weather-form"), $("weather-city"), $("weather-geo"), wxHost, forecastLink);
  HomeDesk.bindWeather(wxHost, forecastLink);
  Weather.refresh(wxHost).then(forecastLink);
  setInterval(() => Weather.refresh(wxHost), 15 * 60000);

  // ---------- Today's schedule (same calendar route and dashboard key as the Planner) ----------
  // The Planner's day view runs 6 AM to 10 PM and counts gaps of 30 minutes or more as open time.
  const DAY_START = 6, DAY_END = 22, MIN_OPEN = 30;
  const fmtDur = (m) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return [h ? `${h} hr` : "", r ? `${r} min` : ""].filter(Boolean).join(" "); };

  function sampleEvents(day) {
    const at = (h, m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).toISOString();
    return [
      { title: "Standup", start: at(9, 0), end: at(9, 15), allDay: false },
      { title: "Sprint planning", start: at(10, 0), end: at(11, 0), allDay: false },
      { title: "School pickup", start: at(15, 15), end: at(15, 45), allDay: false },
      { title: "Family dinner", start: at(18, 0), end: at(19, 0), allDay: false },
    ];
  }

  function largestOpen(day, timed) {
    const base = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START).getTime();
    const span = (DAY_END - DAY_START) * 60;
    const busy = timed
      .map((e) => [Math.max(0, (e.start - base) / 6e4), Math.min(span, (e.end - base) / 6e4)])
      .filter(([s, f]) => f > s)
      .sort((a, b) => a[0] - b[0]);
    let cur = Math.ceil(Math.max(0, (Date.now() - base) / 6e4) / 15) * 15;
    let best = null;
    const consider = (s, f) => { if (f - s >= MIN_OPEN && (!best || f - s > best[1] - best[0])) best = [s, f]; };
    for (const [s, f] of busy) { consider(cur, s); cur = Math.max(cur, f); }
    consider(cur, span);
    return best && { from: new Date(base + best[0] * 6e4), to: new Date(base + best[1] * 6e4), mins: best[1] - best[0] };
  }

  function renderSchedule(events, note) {
    const day = Brain.startOfDay(new Date());
    const next = new Date(day.getTime() + Brain.DAY);
    const evs = events.map((e) => e.allDay
      ? { ...e, start: new Date(`${e.start.slice(0, 10)}T00:00`), end: new Date(`${e.end.slice(0, 10)}T00:00`) }
      : { ...e, start: new Date(e.start), end: new Date(e.end) });
    const all = evs.filter((e) => e.allDay && e.start < next && e.end > day);
    const timed = evs.filter((e) => !e.allDay && e.start < next && e.end > day).sort((a, b) => a.start - b.start);
    const open = largestOpen(day, timed);
    const upcoming = timed.filter((e) => e.end > new Date());
    HomeDesk.schedule({ timed, all, upcoming, open, note });
    const shown = upcoming.slice(0, 5);
    const done = timed.length - upcoming.length;

    let html = "";
    if (note) html += `<p class="panel-note">${esc(note)}</p>`;
    html += `<p class="big-line">${timed.length ? `${timed.length} event${timed.length > 1 ? "s" : ""} today` : "Nothing scheduled today"}${done ? `, ${done} done` : ""}</p>`;
    html += `<p class="sub-line">${open
      ? `Largest open block: ${fmtDur(open.mins)}, ${fmtTime(open.from)} to ${fmtTime(open.to)}`
      : "No open block of 30 minutes or more left before 10 PM"}</p>`;
    if (all.length) html += `<p class="sub-line">All day: ${all.map((e) => esc(e.title)).join(", ")}</p>`;
    if (shown.length) {
      html += `<ul class="agenda" aria-label="Coming up today">${shown.map((e) =>
        `<li><span class="agenda-time">${fmtTime(e.start)}</span><span class="agenda-title">${esc(e.title)}</span></li>`).join("")}</ul>`;
      if (upcoming.length > shown.length) html += `<p class="sub-line">${upcoming.length - shown.length} more later today</p>`;
    }
    $("schedule-body").innerHTML = html;
  }

  function scheduleMessage(text) {
    $("schedule-body").innerHTML = `<p class="panel-note">${esc(text)}</p>`;
    HomeDesk.schedule({ message: text });
  }

  // ---------- Top 3 priorities (desktop Home): the same tasks route and dashboard key as the Planner ----------
  async function loadTasks() {
    const show = (model) => HomeDesk.tasks(model);
    if (Brain.state.mode === "demo") { show({ message: "Preview has no sample tasks. Turn Preview off to see your critical tasks." }); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    let res;
    try {
      res = await fetch("/api/tasks", { headers: key ? { "x-dash-key": key } : {} });
    } catch {
      show({ message: "Couldn't reach Todoist (offline or blocked)." });
      return;
    }
    if (res.status === 401) {
      show({ message: key ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key to see your top tasks here." });
      return;
    }
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !body) {
      show({ message: res.status === 404 ? "The tasks route isn't deployed yet." : `Tasks unavailable: ${body?.error || `error ${res.status}`}.` });
      return;
    }
    show({ tasks: body.tasks || [] });
  }

  // One failing source shows its own message here and leaves the rest of Home alone.
  async function loadSchedule() {
    const day = Brain.startOfDay(new Date());
    if (Brain.state.mode === "demo") { renderSchedule(sampleEvents(day), "Sample calendar (Preview)."); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    const to = new Date(day.getTime() + Brain.DAY);
    let res;
    try {
      res = await fetch(`/api/calendar?from=${day.toISOString()}&to=${to.toISOString()}`, { headers: key ? { "x-dash-key": key } : {} });
    } catch {
      scheduleMessage("Couldn't reach the calendar (offline or blocked).");
      return;
    }
    if (res.status === 401) {
      scheduleMessage(key ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key to see today's events here.");
      return;
    }
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok || !body) {
      scheduleMessage(res.status === 404 ? "The calendar route isn't deployed yet." : `Calendar unavailable: ${body?.error || `error ${res.status}`}.`);
      return;
    }
    const skipped = body.errors || [];
    renderSchedule(body.events || [], skipped.length ? `Skipped ${skipped.length === 1 ? "a calendar feed" : `${skipped.length} calendar feeds`}.` : "");
  }

  // ---------- Second Brain ----------
  function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

  function renderBrain(state) {
    const host = $("brain-body");
    if (state.mode === "idle") {
      const why = state.drive === "unconfigured" ? "Add the Google client ID to config.js, then link Drive." : "Link Drive (top bar) to see your notes, or press Preview for sample data.";
      host.innerHTML = `<p class="panel-note">${esc(why)}</p>`;
      HomeDesk.brain(state);
      return;
    }
    HomeDesk.brain(state);
    const s = Brain.stats(state.files);
    const sweep = Brain.routine("Claude", /sweep/i);
    const muse = Brain.routine("Muse");
    const next = sweep ? Brain.nextOccurrence(sweep.day, sweep.time) : null;
    const short = (d) => `${d.toLocaleDateString([], { weekday: "short" })} ${fmtTime(d)}`;
    const lastSweep = s.lastSweep
      ? `Last sweep: ${short(s.lastSweep)}${s.daysSince >= 7 ? ` (${plural(s.daysSince, "day")} ago)` : ""}`
      : "Last sweep: none found yet";
    const museLine = muse
      ? `Muse checks the sweep ${new Date(2000, 0, 2 + muse.day).toLocaleDateString([], { weekday: "long" })}s at ${fmtTime(new Date(`2000-01-01T${muse.time}`))}. Cortex can't confirm its runs yet.`
      : "";
    host.innerHTML = `
      <p class="big-line">${plural(s.total, "note")}, ${s.newThisWeek} new this week</p>
      <p class="sub-line"><span class="state-icon" aria-hidden="true">${s.sweepFresh ? "✓" : "!"}</span> ${esc(lastSweep)}${next ? ` · next: ${esc(short(next))}` : ""}</p>
      ${s.lastSweep && !s.sweepFresh ? '<p class="sub-line warn-text">The weekly sweep is overdue.</p>' : ""}
      ${museLine ? `<p class="sub-line">${esc(museLine)}</p>` : ""}`;
  }

  // ---------- Go to: every tab, plus quick links ----------
  const TABS = [
    ["/planner", "Planner", "Schedule, open hours and task buckets", ""],
    ["/finances", "Finances", "This month in detail, plus the year", "Arrives in phase 4"],
    ["/news", "News", "Headlines by category", "Arrives in phase 5"],
    ["/vault", "Vault", "Notes you can understand and find", ""],
    ["/ops", "Ops", "Is everything healthy, and what shipped", "Project cards arrive in phase 3"],
  ];
  function renderGoto() {
    $("goto").innerHTML = TABS.map(([href, label, job, soon]) => `
      <li><a href="${href}"><span class="goto-label">${label}</span><span class="goto-job">${job}${soon ? `<span class="goto-soon"> · ${soon}</span>` : ""}</span></a></li>`).join("");
    const ul = $("launchers");
    for (const l of CFG.launchers) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = '<span class="launch-code" aria-hidden="true"></span><span class="launch-label"></span><span class="visually-hidden"> (opens in a new tab)</span>';
      a.querySelector(".launch-code").textContent = l.code || l.label.slice(0, 2).toUpperCase();
      a.querySelector(".launch-label").textContent = l.label;
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  // ---------- Boot ----------
  renderGoto();
  // One interval drives both clocks. It stops when the page is hidden for good or put in the back/forward cache.
  tick();
  let clock = setInterval(tick, 1000);
  addEventListener("pagehide", () => { clearInterval(clock); clock = null; });
  addEventListener("pageshow", (e) => { if (e.persisted && !clock) { tick(); clock = setInterval(tick, 1000); } });
  let lastMode = null;
  Brain.boot({
    onUpdate(state) {
      renderBrain(state);
      // Reload the calendar only when Preview turns on or off.
      if (state.mode === "demo" ? lastMode !== "demo" : lastMode === "demo" || lastMode === null) { loadSchedule(); loadTasks(); }
      lastMode = state.mode;
    },
  });
  setInterval(() => { loadSchedule(); loadTasks(); }, 10 * 60000);
})();
