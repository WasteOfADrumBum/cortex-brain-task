// Cortex Ops (phase 1): the Second Brain checklist (health checks from Todoist, inbox from Drive), recent note activity and Drive storage.
// Project cards, deploys and pull requests arrive in phase 3.
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
      { label: "Daily briefing exists for today", status: "later", detail: "Arrives with the Assistant in phase 6." },
      { label: "Finance data updated in the last 35 days", status: "later", detail: "Arrives with the Finances tab in phase 4." },
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
      if (state.auth === "in" && !started) { started = true; loadChecks(); setInterval(loadChecks, 10 * 60000); }
      renderChecklist(state);
      renderActivity(state);
      renderStorage(state);
    },
  });
})();
