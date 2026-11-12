// Cortex Ops: project cards (live deploy, open and latest merged pull requests, npm version) from /api/ops, the
// shipping totals and 12-week chart, then the Second Brain checklist (health checks from Todoist, inbox from Drive),
// recent note activity and Drive storage.
(() => {
  const CFG = window.CORTEX_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const { DAY } = Brain;

  // Status is always text plus an icon, never colour alone.
  const MARKS = {
    yes: ["✓", "Done"],
    no: ["✗", "Not yet"],
    unknown: ["?", "Can't tell yet"],
    warn: ["⚠", "Warning"],
    later: ["…", "Not set up yet"],
  };

  // ---------- Projects from /api/ops (GitHub and npm, same dashboard key as the Planner) ----------
  // Deploy state is a word plus an icon; the icon colour only repeats it.
  const DEPLOY = {
    healthy: ["✓", "Healthy", "yes"],
    building: ["…", "Building", "unknown"],
    failed: ["✗", "Failed", "no"],
    unknown: ["?", "Can't tell", "later"],
    none: ["–", "No deploys", "later"],
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const day = (iso) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

  async function loadOps() {
    if (Demo.on) { renderOps({ body: (await Demo.data()).ops(new Date()) }); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    let res = null, body = null;
    try { res = await fetch("/api/ops", { headers: key ? { "x-dash-key": key } : {} }); } catch { /* offline */ }
    try { body = await res?.json(); } catch { /* not JSON */ }
    renderOps(!res ? { message: "Couldn't reach GitHub (offline or blocked)." }
      : res.status === 401 ? { message: key ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key so Cortex can read your projects." }
      : res.status === 404 ? { message: "The Ops route isn't deployed yet." }
      : !res.ok || !body ? { message: `Projects unavailable: ${body?.error || `error ${res.status}`}.` }
      : { body });
  }

  function card(p) {
    const [icon, word, cls] = DEPLOY[p.deploy ? p.deploy.state : "none"];
    const deployLine = p.error ? esc(p.error)
      : p.deploy ? `${p.deploy.at ? `Deployed ${esc(Brain.ago(p.deploy.at))}` : "Deployed"}${p.deploy.message ? `: ${esc(p.deploy.message)}` : ""}`
      : "This project has no live site.";
    const facts = p.error ? [] : [
      `${plural(p.openPrs ?? 0, "open pull request")}`,
      `${plural(p.failedLast7Days ?? 0, "failed deploy")} in the last 7 days`,
    ];
    if (p.npm) facts.push(`npm ${p.npm.name} ${p.npm.version ? `v${p.npm.version}` : "(version unavailable)"}`);
    const prs = p.mergedPrs.map((pr) => `<li>
        <a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.title)}<span class="visually-hidden"> (opens in a new tab)</span></a>
        <span class="pr-meta">merged ${esc(day(pr.mergedAt))}</span>
        ${pr.summary ? `<span class="pr-summary">${esc(pr.summary)}</span>` : ""}
      </li>`).join("");
    const name = p.url
      ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}<span class="visually-hidden"> (live site, opens in a new tab)</span></a>`
      : esc(p.name);
    return `<li class="panel project-card">
      <h3 class="project-name">${name}</h3>
      <p class="project-state check-${cls}"><span class="check-icon" aria-hidden="true">${icon}</span><span><strong>${word}.</strong> ${deployLine}</span></p>
      ${facts.length ? `<p class="project-facts">${facts.map(esc).join(" · ")}</p>` : ""}
      ${prs ? `<h4 class="project-sub">Last merged</h4><ul class="pr-list">${prs}</ul>` : p.error ? "" : '<p class="panel-note">No merged pull requests yet.</p>'}
      <p class="panel-link"><a href="https://github.com/${esc(p.repo)}" target="_blank" rel="noopener">Open on GitHub<span class="visually-hidden"> (opens in a new tab)</span></a></p>
    </li>`;
  }

  function renderOps(model) {
    const note = $("ops-note");
    if (!model.body) {
      $("ops-totals").innerHTML = `<li class="panel-note">${esc(model.message)}</li>`;
      $("ops-cards").innerHTML = "";
      $("ships-caption").textContent = "";
      $("ships").replaceChildren();
      $("ships-table-wrap").hidden = true;
      note.hidden = true;
      return;
    }
    const { projects, totals: t, weeks, warnings } = model.body;
    const tile = (n, label) => `<li><span class="total-num">${n ?? "?"}</span><span class="total-label">${label}</span></li>`;
    $("ops-totals").innerHTML = [
      tile(t.mergedWeek, "pull requests merged this week"),
      tile(t.mergedMonth, "merged this month"),
      tile(t.deploysWeek, "live deploys this week"),
      tile(t.failedWeek, "failed deploys, last 7 days"),
    ].join("");
    note.hidden = !warnings.length;
    note.textContent = warnings.length ? `Some projects couldn't be read: ${warnings.join("; ")}.` : "";
    $("ops-cards").innerHTML = projects.map(card).join("");

    const names = projects.map((p) => p.name);
    const sums = weeks.map((w) => names.reduce((n, k) => n + (w.counts[k] || 0), 0));
    HUD.bars($("ships"), sums, [[0, day(weeks[0].start)], [6, day(weeks[6].start)], [11, "This week"]]);
    const total = sums.reduce((a, b) => a + b, 0);
    const peak = sums.indexOf(Math.max(...sums));
    $("ships-caption").textContent = `${plural(total, "pull request")} merged in the last 12 weeks${total ? `. Busiest week: ${day(weeks[peak].start)} with ${sums[peak]}.` : "."}`;
    const table = $("ships-table");
    table.tHead.innerHTML = `<tr><th scope="col">Week of</th>${names.map((n) => `<th scope="col">${esc(n)}</th>`).join("")}<th scope="col">Total</th></tr>`;
    table.tBodies[0].innerHTML = weeks.map((w, i) => `<tr><th scope="row">${esc(day(w.start))}</th>${names.map((n) => `<td>${w.counts[n] || 0}</td>`).join("")}<td>${sums[i]}</td></tr>`).reverse().join("");
    $("ships-table-wrap").hidden = false;
  }

  // ---------- Health checks from Todoist ----------
  // Each automation completes a Todoist task when it runs ("Brain sweep ran", "Muse check ran"; config.js healthChecks).
  // /api/checks returns the newest completion of each in the last 7 days (same dashboard key as the Planner).
  const HEALTH = CFG.healthChecks || [];
  let checks = { state: "loading" }; // loading | ok { data } | error { message }

  async function loadChecks() {
    if (!HEALTH.length) return;
    const titles = HEALTH.map((h) => h.task);
    if (Demo.on) { checks = { state: "ok", data: (await Demo.data()).checks(new Date(), titles) }; renderChecklist(Brain.state); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    const qs = titles.map((t) => `title=${encodeURIComponent(t)}`).join("&");
    let res = null, body = null;
    try { res = await fetch(`/api/checks?${qs}`, { headers: key ? { "x-dash-key": key } : {} }); } catch { /* offline */ }
    try { body = await res?.json(); } catch { /* not JSON */ }
    checks = !res ? { state: "error", message: "Couldn't reach Todoist (offline or blocked)." }
      : res.status === 401 ? { state: "error", message: key ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key so Cortex can read Todoist." }
      : res.status === 404 ? { state: "error", message: "The checks route isn't deployed yet." }
      : !res.ok || !body ? { state: "error", message: `Todoist unavailable: ${body?.error || `error ${res.status}`}.` }
      : { state: "ok", data: body };
    renderChecklist(Brain.state);
  }

  // "Brain sweep: Mon 4:02 AM · Health check for the Second Brain." or "Muse check: not seen in 7 days" with a warning.
  function healthItem(h) {
    if (checks.state !== "ok") {
      return { label: `${h.name}: ${checks.state === "loading" ? "checking Todoist…" : "can't tell"}`, status: "unknown", detail: checks.message || "Loading." };
    }
    const c = checks.data.checks.find((x) => x.title.toLowerCase() === h.task.toLowerCase());
    if (!c?.completedAt) {
      return { label: `${h.name}: not seen in 7 days`, status: "warn", detail: `No completed "${h.task}" task in Todoist in the last 7 days.` };
    }
    const at = new Date(c.completedAt);
    const desc = (c.description.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "");
    const clip = desc.length > 140 ? `${desc.slice(0, 139).trimEnd()}…` : desc;
    return {
      label: `${h.name}: ${at.toLocaleDateString([], { weekday: "short" })} ${Brain.fmtTime(at)}${clip ? ` · ${clip}` : ""}`,
      status: "yes",
      detail: `"${h.task}" was completed in Todoist ${Brain.ago(c.completedAt)}.`,
    };
  }

  // ---------- Finance freshness: the newest saved month from /api/finance ----------
  let finance = { state: "loading" }; // loading | ok { savedAt | null } | error { message }
  async function loadFinance() {
    const y = new Date().getFullYear();
    if (Demo.on) { const m = (await Demo.data()).finances(new Date()).months; finance = { state: "ok", savedAt: m[m.length - 1]?.savedAt || null }; renderChecklist(Brain.state); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    let res = null, body = null;
    try { res = await fetch(`/api/finance?year=${y}`, { headers: key ? { "x-dash-key": key } : {} }); } catch { /* offline */ }
    try { body = await res?.json(); } catch { /* not JSON */ }
    finance = res?.ok && body ? { state: "ok", savedAt: body.months.map((m) => m.savedAt).sort().pop() || null }
      : { state: "error", message: body?.error || "Couldn't read finances." };
    renderChecklist(Brain.state);
  }
  function financeItem() {
    const label = "Finance data updated in the last 35 days";
    if (finance.state === "loading") return { label, status: "unknown", detail: "Checking Finances…", link: ["/finances", "Open Finances"] };
    if (finance.state === "error") return { label, status: "unknown", detail: finance.message, link: ["/finances", "Open Finances"] };
    if (!finance.savedAt) return { label, status: "no", detail: "Nothing saved yet this year.", link: ["/finances", "Update finances"] };
    const fresh = Date.now() - new Date(finance.savedAt).getTime() < 35 * DAY;
    return { label, status: fresh ? "yes" : "no", detail: `Last saved ${Brain.ago(finance.savedAt)}.`, link: ["/finances", "Open Finances"] };
  }

  // ---------- Briefing: whether /Cortex/briefings has today's file (read in the browser with the Drive link) ----------
  let brief = { state: "idle" }; // idle | loading | ok { today, latest } | error { message }
  let briefMode = "";
  async function loadBrief(state) {
    const mode = Demo.on ? "demo" : state.mode === "live" && Drive.linked() ? "live" : "";
    if (!mode || mode === briefMode) return;
    briefMode = mode;
    brief = { state: "loading" };
    try {
      const files = Demo.on ? (await Demo.data()).briefing(new Date()) : (await Drive.briefings()).files;
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.md`;
      const names = files.map((f) => f.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n) && n <= key).sort();
      brief = { state: "ok", today: names.includes(key), latest: names.pop() || null };
    } catch (e) {
      brief = { state: "error", message: `Couldn't read Cortex/briefings: ${e.message}` };
      briefMode = "";
    }
    renderChecklist(Brain.state);
  }
  function briefItem(state) {
    const label = "Daily briefing exists for today";
    const link = ["/briefing", "Open the briefing"];
    if (brief.state === "idle") return { label, status: "unknown", detail: state.mode === "idle" ? Brain.idleText(state) : "Checking Drive…", link };
    if (brief.state === "loading") return { label, status: "unknown", detail: "Checking Cortex/briefings in Drive…", link };
    if (brief.state === "error") return { label, status: "unknown", detail: brief.message, link };
    if (brief.today) return { label, status: "yes", detail: "Today's briefing is in Drive.", link };
    const last = brief.latest ? new Date(`${brief.latest.slice(0, 10)}T12:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) : "";
    return { label, status: "no", detail: last ? `The last one was for ${last}. The routine runs weekday mornings.` : "None found in Cortex/briefings yet. See docs/briefing-routine.md to set up the routine.", link };
  }

  function renderChecklist(state) {
    const live = state.mode !== "idle";
    const s = live ? Brain.stats(state.files) : null;
    const limit = CFG.inboxLimit ?? 7;
    const items = [
      // The sweep writes a digest note each run, so its item links to them.
      ...HEALTH.map((h) => ({ ...healthItem(h), link: /sweep/i.test(h.task) && live && s.lastDigest ? ["/vault?type=digest", "See digests"] : null })),
      {
        label: `Brain inbox has under ${limit} notes waiting`,
        status: !live ? "unknown" : s.counts.inbox < limit ? "yes" : "no",
        detail: !live ? Brain.idleText(state) : `${s.counts.inbox} ${s.counts.inbox === 1 ? "note is" : "notes are"} waiting to be filed.`,
        link: live ? ["/vault?type=inbox", "Open the inbox"] : null,
      },
      briefItem(state),
      financeItem(),
    ];
    $("checklist").innerHTML = items.map((it) => {
      const [icon, word] = MARKS[it.status];
      return `<li class="check check-${it.status}">
        <span class="check-icon" aria-hidden="true">${icon}</span>
        <span class="check-text">
          <span class="check-label">${esc(it.label)}</span>
          <span class="check-state">${word}. <span class="check-detail">${esc(it.detail)}</span></span>
          ${it.link ? `<a class="check-link" href="${it.link[0]}">${esc(it.link[1])}</a>` : ""}
        </span>
      </li>`;
    }).join("");
  }

  function renderActivity(state) {
    const days = 30;
    const today = Brain.startOfDay(new Date()).getTime();
    const counts = new Array(days).fill(0);
    for (const f of state.files) {
      const d = Brain.startOfDay(new Date(f.modifiedTime)).getTime();
      const idx = days - 1 - Math.round((today - d) / DAY);
      if (idx >= 0 && idx < days) counts[idx]++;
    }
    const label = (i) => new Date(today - (days - 1 - i) * DAY).toLocaleDateString([], { month: "short", day: "numeric" });
    HUD.bars($("activity"), counts, [[0, label(0)], [14, label(14)], [29, "Today"]]);
    const total = counts.reduce((a, b) => a + b, 0);
    const peak = counts.indexOf(Math.max(...counts));
    $("activity-caption").textContent = state.mode === "idle"
      ? Brain.idleText(state)
      : `${total} ${total === 1 ? "note" : "notes"} changed in the last 30 days${total ? `. Busiest day: ${label(peak)} with ${counts[peak]}.` : "."}`;
    $("activity-table-wrap").hidden = state.mode === "idle";
    $("activity-table").tBodies[0].innerHTML = counts.map((n, i) => `<tr><td>${i === days - 1 ? "Today" : label(i)}</td><td>${n}</td></tr>`).reverse().join("");
  }

  // Binary units, matching how Google shows storage (a 15 GB plan is 15 × 1024³ bytes).
  function bytes(n) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 100 || i === 0 ? Math.round(n) : +n.toFixed(1)} ${units[i]}`;
  }
  function renderStorage(state) {
    const st = state.storage;
    if (!st) {
      $("storage-body").innerHTML = `<p class="panel-note">${state.mode === "idle" ? esc(Brain.idleText(state)) : "Storage isn't available right now."}</p>`;
      return;
    }
    const pct = st.limit ? st.used / st.limit : null;
    const level = pct == null ? "yes" : pct < 0.8 ? "yes" : pct < 0.95 ? "warn" : "no";
    const words = { yes: "Plenty of room", warn: "Getting full", no: "Almost full" }[level];
    $("storage-body").innerHTML = st.limit
      ? `<p class="big-line">${bytes(st.used)} of ${bytes(st.limit)} used (${Math.round(pct * 100)}%)</p>
         <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round(pct * 100))}%"></span></div>
         <p class="sub-line"><span class="state-icon" aria-hidden="true">${level === "yes" ? "✓" : "!"}</span> ${words}: ${bytes(Math.max(0, st.limit - st.used))} free. This counts Drive, Gmail and Photos together.</p>`
      : `<p class="big-line">${bytes(st.used)} used</p><p class="sub-line">This account has no storage limit.</p>`;
  }

  let started = false;
  Brain.boot({
    storage: true,
    onUpdate(state) {
      // Todoist is read only once signed in (or in the demo).
      if (state.auth === "in" && !started) {
        started = true;
        loadChecks(); setInterval(loadChecks, 10 * 60000);
        loadOps(); setInterval(loadOps, 5 * 60000);
        loadFinance();
      }
      if (state.auth === "in") loadBrief(state);
      renderChecklist(state);
      renderActivity(state);
      renderStorage(state);
    },
  });
})();
