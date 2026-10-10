// Cortex: wiring for the HUD.
(() => {
  const CFG = window.CORTEX_CONFIG;
  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;

  const AREAS = [
    { key: "inbox", label: "Inbox" },
    { key: "notes", label: "Notes" },
    { key: "digest", label: "Digests" },
    { key: "index", label: "Index" },
    { key: "profile", label: "Profile" },
    { key: "retired", label: "Retired" },
  ];

  const state = {
    mode: "idle", // idle | live | demo
    drive: "starting", // starting | unconfigured | ready | linked | expired | error
    files: [],
    folders: [],
    area: null,
    query: "",
    contentHits: null,
    lastSync: null,
    error: "",
  };

  // ---------- Helpers ----------
  const rx = (p) => new RegExp(p, "i");
  function areaOf(f) {
    const n = f.name;
    if (rx(CFG.patterns.retired).test(n)) return "retired";
    if (rx(CFG.patterns.index).test(n)) return "index";
    if (rx(CFG.patterns.profile).test(n)) return "profile";
    if (rx(CFG.patterns.digest).test(n)) return "digest";
    if (/^inbox(\/|$)/i.test(f.folder || "")) return "inbox";
    return "notes";
  }
  function ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.round(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  }
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function notice(text) {
    const n = $("notice");
    n.hidden = !text;
    n.textContent = text || "";
  }

  // ---------- Clock, date, time rings ----------
  const ringClock = HUD.ringClock($("ring-clock"));
  const ringHost = $("rings");
  const rings = {
    day: HUD.ring(ringHost, "Day"),
    week: HUD.ring(ringHost, "Week"),
    month: HUD.ring(ringHost, "Month"),
    year: HUD.ring(ringHost, "Year"),
  };
  $("clock-tz").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ");

  function tick() {
    const now = new Date();
    const h24 = CFG.clock24h;
    const h = now.getHours();
    const hh = h24 ? String(h).padStart(2, "0") : String(h % 12 || 12);
    const mm = String(now.getMinutes()).padStart(2, "0");
    const suffix = h24 ? "" : h < 12 ? "AM" : "PM";
    $("clock-hm").textContent = `${hh}:${mm}`;
    $("clock-ampm").textContent = suffix;
    $("clock-sec").textContent = String(now.getSeconds()).padStart(2, "0");
    $("clock").setAttribute("datetime", now.toISOString());
    $("clock-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("date-day").textContent = now.getDate();
    $("date-month").textContent = now.toLocaleDateString([], { month: "long" });
    $("date-weekday").textContent = now.toLocaleDateString([], { weekday: "long" });
    ringClock.set(now, `${hh}:${mm}`, suffix);

    const sod = startOfDay(now);
    const dow = (now.getDay() + 6) % 7; // Monday = 0
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const soy = new Date(now.getFullYear(), 0, 1);
    const eoy = new Date(now.getFullYear() + 1, 0, 1);
    rings.day.set((now - sod) / DAY);
    rings.week.set((dow * DAY + (now - sod)) / (7 * DAY));
    rings.month.set((now - som) / (eom - som));
    rings.year.set((now - soy) / (eoy - soy));
    if (now.getSeconds() === 0) renderSchedule();
  }

  // ---------- Launchers ----------
  function renderLaunchers() {
    const ul = $("launchers");
    for (const l of CFG.launchers) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = '<span class="launch-code" aria-hidden="true"></span><span class="launch-label"></span>';
      a.querySelector(".launch-code").textContent = l.code || l.label.slice(0, 2).toUpperCase();
      a.querySelector(".launch-label").textContent = l.label;
      a.setAttribute("aria-label", `${l.label} (opens in a new tab)`);
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  // ---------- Schedule ----------
  function nextOccurrence(day, time) {
    const [hh, mm] = time.split(":").map(Number);
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
    let add = (day - now.getDay() + 7) % 7;
    if (add === 0 && d <= now) add = 7;
    d.setDate(d.getDate() + add);
    return d;
  }
  function countdown(ms) {
    const m = Math.floor(ms / 60000);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d) return `in ${d}d ${h}h`;
    if (h) return `in ${h}h ${mi}m`;
    return `in ${mi}m`;
  }
  function renderSchedule() {
    const items = CFG.schedule
      .map((s) => ({ ...s, at: nextOccurrence(s.day, s.time) }))
      .sort((a, b) => a.at - b.at);
    const ol = $("schedule");
    ol.replaceChildren();
    items.forEach((s, i) => {
      const li = document.createElement("li");
      if (i === 0) li.className = "is-next";
      li.innerHTML = '<span class="sched-when"></span><span class="sched-what"><span class="t"></span><span class="sched-who"></span></span><span class="sched-in"></span>';
      li.querySelector(".sched-when").textContent = s.at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", hour12: !CFG.clock24h });
      li.querySelector(".t").textContent = s.label;
      li.querySelector(".sched-who").textContent = s.who;
      li.querySelector(".sched-in").textContent = countdown(s.at - Date.now());
      ol.appendChild(li);
    });
  }

  // ---------- Core + orbit ----------
  const coreSvg = $("core-svg");
  HUD.buildCore(coreSvg);
  function renderOrbit(counts) {
    const ul = $("orbit");
    ul.replaceChildren();
    const angles = [-150, -90, -30, 30, 90, 150];
    AREAS.forEach((a, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--a", `${angles[i]}deg`);
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.area === a.key));
      b.innerHTML = '<span class="l"></span><span class="n"></span>';
      b.querySelector(".l").textContent = a.label;
      b.querySelector(".n").textContent = counts ? counts[a.key] : "--";
      b.setAttribute("aria-label", `${a.label}: ${counts ? counts[a.key] : "no data"} files`);
      b.addEventListener("click", () => {
        state.area = state.area === a.key ? null : a.key;
        state.contentHits = null;
        renderAll();
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    $("core-center").setAttribute("aria-pressed", String(!state.area));
  }
  $("core-center").addEventListener("click", () => {
    state.area = null;
    state.contentHits = null;
    renderAll();
  });

  // ---------- Gauges ----------
  const gHost = $("gauges");
  const gauges = {
    inbox: HUD.gauge(gHost, { label: "Inbox load", max: 20 }),
    week: HUD.gauge(gHost, { label: "New this week", max: 20 }),
    sweep: HUD.gauge(gHost, { label: "Days since sweep", max: 14, steps: 7 }),
    health: HUD.gauge(gHost, { label: "Brain health", max: 100 }),
  };

  function computeStats() {
    const files = state.files;
    const counts = Object.fromEntries(AREAS.map((a) => [a.key, 0]));
    files.forEach((f) => counts[f.area]++);
    const weekAgo = Date.now() - 7 * DAY;
    const newThisWeek = files.filter((f) => new Date(f.createdTime) > weekAgo).length;
    const digests = files.filter((f) => f.area === "digest").sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const lastSweep = digests[0] ? new Date(digests[0].createdTime) : null;
    const daysSince = lastSweep ? Math.floor((Date.now() - lastSweep) / DAY) : null;
    const interval = CFG.sweepIntervalDays || 7;
    let health = null;
    if (daysSince != null) health = daysSince <= interval ? 100 : Math.max(0, Math.round(100 - ((daysSince - interval) / (interval * 2)) * 100));
    const index = files.find((f) => f.area === "index");
    return { counts, total: files.length, newThisWeek, daysSince, health, index };
  }

  function renderGauges(s) {
    if (!s) {
      Object.values(gauges).forEach((g) => g.set(null, { tone: "idle", note: "No data yet" }));
      return;
    }
    const inbox = s.counts.inbox;
    gauges.inbox.set(inbox, { max: Math.max(20, Math.ceil(inbox / 10) * 10), tone: inbox > 15 ? "bad" : inbox > 7 ? "warn" : "ok", note: inbox ? "waiting to be filed" : "inbox zero" });
    gauges.week.set(s.newThisWeek, { max: Math.max(20, Math.ceil(s.newThisWeek / 10) * 10), tone: "cyan", note: "files created" });
    const interval = CFG.sweepIntervalDays || 7;
    if (s.daysSince == null) gauges.sweep.set(null, { tone: "idle", note: "no digest found" });
    else gauges.sweep.set(s.daysSince, { max: Math.max(14, s.daysSince), tone: s.daysSince <= interval ? "ok" : s.daysSince <= interval * 2 ? "warn" : "bad", note: s.daysSince <= interval ? "on schedule" : "sweep overdue" });
    if (s.health == null) gauges.health.set(null, { tone: "idle", note: "needs a digest" });
    else gauges.health.set(s.health, { text: `${s.health}%`, tone: s.health >= 80 ? "ok" : s.health >= 40 ? "warn" : "bad", note: "sweep freshness" });
  }

  // ---------- Activity ----------
  function renderActivity() {
    const days = 30;
    const today = startOfDay(new Date()).getTime();
    const counts = new Array(days).fill(0);
    for (const f of state.files) {
      const d = startOfDay(new Date(f.modifiedTime)).getTime();
      const idx = days - 1 - Math.round((today - d) / DAY);
      if (idx >= 0 && idx < days) counts[idx]++;
    }
    const label = (i) => new Date(today - (days - 1 - i) * DAY).toLocaleDateString([], { month: "short", day: "numeric" });
    HUD.bars($("activity"), counts, [[0, label(0)], [14, label(14)], [29, "Today"]]);
    const total = counts.reduce((a, b) => a + b, 0);
    const peak = counts.indexOf(Math.max(...counts));
    $("activity-caption").textContent = state.mode === "idle"
      ? "Link Drive to see how often your brain changes."
      : `${total} files changed in the last 30 days${total ? `. Busiest day: ${label(peak)} with ${counts[peak]}.` : "."}`;
  }

  // ---------- Files ----------
  function visibleFiles() {
    let list = state.contentHits ?? state.files;
    if (state.area) list = list.filter((f) => f.area === state.area);
    const q = state.query.trim().toLowerCase();
    if (q && !state.contentHits) list = list.filter((f) => f.name.toLowerCase().includes(q) || (f.folder || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)).slice(0, 60);
  }
  function renderFiles() {
    const ul = $("files");
    ul.replaceChildren();
    const list = visibleFiles();
    const parts = [];
    if (state.area) parts.push(AREAS.find((a) => a.key === state.area).label);
    if (state.contentHits) parts.push(`contains "${state.query}"`);
    else if (state.query) parts.push(`name has "${state.query}"`);
    $("files-filter").textContent = parts.length ? `Showing ${list.length}: ${parts.join(" · ")}` : "";
    if (state.mode === "idle") {
      ul.innerHTML = '<li class="empty">Link Drive, or press Preview to try Cortex with sample data.</li>';
      return;
    }
    if (!list.length) { ul.innerHTML = '<li class="empty">Nothing matches.</li>'; return; }
    for (const f of list) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "file-btn";
      b.innerHTML = '<span class="tag"></span><span class="file-name"></span><span class="file-time"></span>';
      const tag = b.querySelector(".tag");
      tag.className = `tag tag-${f.area}`;
      tag.textContent = AREAS.find((a) => a.key === f.area)?.label || f.area;
      b.querySelector(".file-name").textContent = f.name;
      b.querySelector(".file-time").textContent = ago(f.modifiedTime);
      b.addEventListener("click", () => openViewer(f));
      li.appendChild(b);
      ul.appendChild(li);
    }
  }

  $("search-input").addEventListener("input", (e) => {
    state.query = e.target.value;
    state.contentHits = null;
    renderFiles();
  });
  $("search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = state.query.trim();
    if (!q) return;
    if (state.mode === "demo") {
      state.contentHits = state.files.filter((f) => (f.body || "").toLowerCase().includes(q.toLowerCase()) || f.name.toLowerCase().includes(q.toLowerCase()));
      renderFiles();
      return;
    }
    if (state.mode !== "live") return;
    $("files-filter").textContent = "Searching inside notes…";
    try {
      const hits = await Drive.searchContent(q, state.folders.map((f) => f.id));
      const byId = new Map(state.files.map((f) => [f.id, f]));
      state.contentHits = hits.map((h) => byId.get(h.id)).filter(Boolean);
      renderFiles();
    } catch (err) {
      $("files-filter").textContent = err.message;
    }
  });

  // ---------- Viewer ----------
  function renderMarkdownLite(host, text) {
    host.replaceChildren();
    let list = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd();
      const h = line.match(/^#{1,6}\s+(.*)/);
      const li = line.match(/^\s*[-*+]\s+(.*)/);
      if (li) {
        if (!list) { list = document.createElement("ul"); host.appendChild(list); }
        const item = document.createElement("li");
        item.textContent = li[1];
        list.appendChild(item);
        continue;
      }
      list = null;
      if (!line) continue;
      const node = document.createElement(h ? "h3" : "p");
      node.textContent = h ? h[1] : line;
      host.appendChild(node);
    }
  }
  async function openViewer(f) {
    const dlg = $("viewer");
    $("viewer-title").textContent = f.name;
    $("viewer-kicker").textContent = `${f.folder || "Second Brain"} · modified ${new Date(f.modifiedTime).toLocaleString()}`;
    const link = $("viewer-link");
    link.href = f.webViewLink || "#";
    link.hidden = !f.webViewLink;
    const body = $("viewer-body");
    body.innerHTML = '<p class="muted">Loading…</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const text = state.mode === "demo" ? f.body : await Drive.readFile(f);
      if (text == null) body.innerHTML = '<p class="muted">Cortex can only preview text and Google Docs. Open it in Drive instead.</p>';
      else renderMarkdownLite(body, text);
    } catch (err) {
      body.innerHTML = '<p class="muted"></p>';
      body.firstChild.textContent = err.message;
    }
  }
  $("viewer-close").addEventListener("click", () => $("viewer").close());
  $("viewer").addEventListener("click", (e) => { if (e.target === $("viewer")) $("viewer").close(); });

  // ---------- Systems ----------
  let battery = null;
  if (navigator.getBattery) navigator.getBattery().then((b) => {
    battery = b;
    ["levelchange", "chargingchange"].forEach((ev) => b.addEventListener(ev, renderSystems));
    renderSystems();
  }).catch(() => {});
  window.addEventListener("online", renderSystems);
  window.addEventListener("offline", renderSystems);
  navigator.connection?.addEventListener?.("change", renderSystems);

  function renderSystems() {
    const rows = [];
    const driveRow = {
      unconfigured: ["warn", "Google Drive", "Client ID missing in config.js"],
      starting: ["", "Google Drive", "Starting…"],
      ready: ["", "Google Drive", "Ready to link (read-only)"],
      linked: ["ok", "Google Drive", `Linked · drive.readonly${state.lastSync ? ` · synced ${ago(state.lastSync.toISOString())}` : ""}`],
      expired: ["warn", "Google Drive", "Session expired, link again"],
      error: ["bad", "Google Drive", state.error || "Sign-in failed"],
    }[state.drive];
    if (state.mode === "demo") rows.push(["warn", "Google Drive", "Preview mode: showing sample data"]);
    else rows.push(driveRow);
    const wx = Weather.status();
    rows.push([wx.ok ? "ok" : "warn", "Weather feed", wx.text]);
    const c = navigator.connection;
    const net = navigator.onLine
      ? `Online${c?.effectiveType ? ` · ${c.effectiveType.toUpperCase()}` : ""}${c?.downlink ? ` · ~${c.downlink} Mbps` : ""}`
      : "Offline";
    rows.push([navigator.onLine ? "ok" : "bad", "Network", net, c?.downlink ? Math.min(1, c.downlink / 10) : null]);
    if (battery) {
      const pct = Math.round(battery.level * 100);
      rows.push([pct < 20 && !battery.charging ? "warn" : "ok", "Battery", `${pct}%${battery.charging ? " · charging" : ""}`, battery.level]);
    }
    if (navigator.deviceMemory) rows.push(["ok", "Device memory", `At least ${navigator.deviceMemory} GB`]);

    const ul = $("systems");
    ul.replaceChildren();
    for (const [tone, name, detail, meter] of rows) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="sys-dot" aria-hidden="true"></span><span class="sys-name"></span><span class="sys-detail"></span>';
      li.querySelector(".sys-dot").className = `sys-dot ${tone}`;
      li.querySelector(".sys-name").textContent = name;
      li.querySelector(".sys-detail").textContent = detail;
      if (meter != null) {
        const m = document.createElement("span");
        m.className = "sys-meter";
        m.setAttribute("aria-hidden", "true");
        m.innerHTML = "<span></span>";
        m.firstChild.style.width = `${Math.round(meter * 100)}%`;
        li.appendChild(m);
      }
      ul.appendChild(li);
    }
  }

  // ---------- Status + top bar ----------
  function renderStatus(stats) {
    const el = $("sys-status");
    let s = ["", "Standby"];
    if (state.mode === "demo") s = ["demo", "Preview data"];
    else if (state.drive === "unconfigured") s = ["warn", "Setup needed"];
    else if (state.drive === "expired") s = ["warn", "Relink Drive"];
    else if (state.drive === "error") s = ["warn", "Drive error"];
    else if (state.mode === "live" && stats) {
      if (stats.health == null) s = ["warn", "No sweep found"];
      else if (stats.health >= 80) s = ["ok", "System optimal"];
      else s = ["warn", "Sweep overdue"];
    }
    el.dataset.state = s[0];
    el.querySelector(".label").textContent = s[1];

    const auth = $("btn-auth");
    auth.textContent = state.drive === "linked" ? "Sign out" : state.drive === "expired" ? "Relink Drive" : "Link Drive";
    auth.disabled = !["ready", "linked", "expired", "error"].includes(state.drive);
    $("btn-demo").setAttribute("aria-pressed", String(state.mode === "demo"));
    $("ticker-sync").textContent = state.lastSync ? `Last sync: ${state.lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Last sync: never";
  }

  function renderAll() {
    const stats = state.mode === "idle" ? null : computeStats();
    $("core-count").textContent = stats ? stats.total : "--";
    $("core-sub").textContent = !stats
      ? (state.drive === "unconfigured" ? "Add client ID to config.js" : "Link Drive to sync")
      : stats.index ? stats.index.name.replace(/\.md$/i, "") : "No index file found";
    const tone = !stats || stats.health == null ? "idle" : stats.health >= 80 ? "ok" : stats.health >= 40 ? "warn" : "bad";
    HUD.setCoreHealth(coreSvg, stats?.health != null ? stats.health / 100 : 0, tone);
    renderOrbit(stats?.counts);
    renderGauges(stats);
    renderActivity();
    renderFiles();
    renderStatus(stats);
    renderSystems();
  }

  // ---------- Data loading ----------
  async function syncDrive() {
    try {
      $("core-sub").textContent = "Syncing…";
      const { files, folders } = await Drive.loadBrain(CFG.brainFolderId);
      state.files = files.map((f) => ({ ...f, area: areaOf(f) }));
      state.folders = folders;
      state.mode = "live";
      state.lastSync = new Date();
      notice("");
    } catch (err) {
      notice(err.message);
    }
    renderAll();
  }

  function onDriveChange(event, detail) {
    if (event === "linked") { state.drive = "linked"; syncDrive(); return; }
    if (event === "signed-out") { state.drive = "ready"; if (state.mode === "live") { state.mode = "idle"; state.files = []; } }
    if (event === "expired") state.drive = "expired";
    if (event === "error") { state.drive = "error"; state.error = detail; notice(`Google sign-in: ${detail}`); }
    renderAll();
  }

  $("btn-auth").addEventListener("click", () => {
    if (state.drive === "linked") Drive.signOut();
    else Drive.signIn();
  });

  $("btn-demo").addEventListener("click", () => {
    if (state.mode === "demo") {
      state.mode = Drive.linked() ? "live" : "idle";
      state.files = [];
      if (state.mode === "live") { syncDrive(); return; }
    } else {
      state.mode = "demo";
      state.files = demoFiles();
      state.lastSync = null;
    }
    state.area = null;
    state.contentHits = null;
    renderAll();
  });

  // ---------- Sample data for Preview ----------
  function demoFiles() {
    const now = Date.now();
    const iso = (daysAgo, h = 0) => new Date(now - daysAgo * DAY - h * 3600000).toISOString();
    const mk = (name, folder, created, modified, body) => ({
      id: `demo-${name}`, name, folder, mimeType: "text/markdown",
      createdTime: iso(created), modifiedTime: iso(modified ?? created, 1), webViewLink: "", body,
    });
    const files = [
      mk("00-index.md", "", 30, 3, "# Second Brain rules (v6)\n\n## Folders\n- inbox/ holds new captures\n- notes/ is flat\n\n## Weekly sweep\n- Runs Mondays before 9am\n- Tags decision and about-me notes\n- Writes a digest"),
      mk("about-me.md", "", 60, 2, "# About me\n\nSample profile text. Your real about-me.md appears here once Drive is linked."),
      mk("2026-10-05-weekly-digest.md", "notes", 5, 5, "# Weekly digest\n\n- 9 notes filed\n- 2 decisions tagged\n- Inbox cleared to 3"),
      mk("2026-09-28-weekly-digest.md", "notes", 12, 12, "# Weekly digest\n\n- 6 notes filed"),
      mk("00-index-v5-retired.md", "notes", 40, 20, "Retired index version."),
      mk("00-index-v4-retired.md", "notes", 70, 40, "Retired index version."),
      mk("idea-garage-workbench.md", "inbox", 0, 0, "Build a fold-down workbench for the garage."),
      mk("call-dentist.md", "inbox", 1, 1, "Reschedule cleaning."),
      mk("podcast-notes-focus.md", "inbox", 2, 2, "Notes on deep work and focus."),
      mk("gift-ideas.md", "inbox", 3, 1, "- Headphones\n- Board game"),
    ];
    const topics = ["decision-new-laptop", "drum-practice-plan", "budget-q4", "meal-prep-ideas", "reading-list", "car-maintenance", "workout-split", "home-network", "vacation-shortlist", "side-project-cortex", "habit-tracker", "learning-rust", "garden-plan", "tax-docs-2026", "music-gear-wishlist", "weekly-review-template", "book-atomic-habits", "meeting-notes-oct", "health-checkup", "savings-goals", "recipe-chili", "ai-tools-compare", "photo-backup-plan", "birthday-plans"];
    topics.forEach((t, i) => {
      const created = (i * 7) % 29 + (i % 3);
      files.push(mk(`${t}.md`, "notes", created, Math.max(0, created - (i % 4)), `# ${t.replace(/-/g, " ")}\n\nSample note for Preview mode.\n\n- Point one\n- Point two`));
    });
    return files.map((f) => ({ ...f, area: areaOf(f) }));
  }

  // ---------- Boot ----------
  renderLaunchers();
  renderSchedule();
  tick();
  setInterval(tick, 1000);
  renderAll();

  const wxHost = $("weather");
  Weather.bind($("weather-form"), $("weather-city"), $("weather-geo"), wxHost, renderSystems);
  Weather.refresh(wxHost).then(renderSystems);
  setInterval(() => Weather.refresh(wxHost).then(renderSystems), 15 * 60000);

  setInterval(() => { if (state.mode === "live" && Drive.linked()) syncDrive(); }, 10 * 60000);

  if (new URLSearchParams(location.search).has("demo")) $("btn-demo").click();

  Drive.init(onDriveChange).then((r) => {
    state.drive = r;
    if (r === "unconfigured") notice("Add your Google OAuth client ID to config.js to link Drive. Until then, press Preview to see Cortex with sample data.");
    renderAll();
  }).catch((err) => {
    state.drive = "error";
    state.error = err.message;
    notice(err.message);
    renderAll();
  });
})();
