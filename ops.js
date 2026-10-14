// Cortex Ops (phase 1): the Second Brain checklist, recent note activity and Drive storage.
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
    later: ["…", "Not set up yet"],
  };

  function renderChecklist(state) {
    const live = state.mode !== "idle";
    const s = live ? Brain.stats(state.files) : null;
    const limit = CFG.inboxLimit ?? 7;
    const day = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const items = [
      {
        label: "Weekly sweep ran in the last 7 days",
        status: !live ? "unknown" : s.sweepFresh ? "yes" : "no",
        detail: !live ? Brain.idleText(state) : s.lastSweep ? `Newest digest: ${day(s.lastSweep)}.` : "No digest note found.",
        link: live && s.lastDigest ? ["/vault?type=digest", "See digests"] : null,
      },
      {
        label: "Muse check ran in the last 7 days",
        status: "unknown",
        detail: "Cortex can't see Muse's check yet. It needs a note or Todoist task that Muse leaves behind.",
      },
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

  Brain.boot({
    storage: true,
    onUpdate(state) {
      renderChecklist(state);
      renderActivity(state);
      renderStorage(state);
    },
  });
})();
