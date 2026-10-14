// Cortex Home, desktop layout (1101px and up): clock hub, schedule, Top 3, forecast, brain, music and links.
// home.js owns the data loading and the one clock interval; it hands everything to these render functions.
// The phone and tablet Home keeps its own markup, so nothing here changes it.
const HomeDesk = (() => {
  const CFG = window.CORTEX_CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (d) => Brain.fmtTime(d);
  const fmtDur = (m) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return [h ? `${h} hr` : "", r ? `${r} min` : ""].filter(Boolean).join(" "); };
  // Schedule bars and priority badges cycle through the accent colours.
  const ACCENTS = ["violet", "blue", "orange"];
  const PRI_ACCENTS = ["orange", "blue", "violet"];

  // ---------- Clock hub ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const rings = {
    year: [$("d-ring-year"), 178], month: [$("d-ring-month"), 168], hour: [$("d-ring-hour"), 154],
    min: [$("d-ring-min"), 141], sec: [$("d-ring-sec"), 128],
  };
  // Same math as the mockup: the dash is the share of the circle that has elapsed.
  function setRing([node, r], p) {
    const c = 2 * Math.PI * r;
    node.setAttribute("stroke-dasharray", `${(c * Math.max(p, 0.001)).toFixed(1)} ${c.toFixed(1)}`);
  }

  // "Eastern Time" where the browser supports generic zone names, otherwise the zone id.
  (function timeZoneLabel() {
    let label = "";
    try {
      label = new Intl.DateTimeFormat("en-US", { timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "";
    } catch { /* older browser */ }
    if (!label) label = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ").replace(/^.*\//, "");
    $("d-tz").textContent = label;
  })();
  $("d-name").textContent = CFG.userName || "there";

  let lastMinute = -1;
  function tick(d) {
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
    const dayFrac = (h * 3600 + m * 60 + s) / 86400;
    const monthP = (day - 1 + dayFrac) / new Date(y, mo + 1, 0).getDate();
    const yearP = (d - new Date(y, 0, 1)) / (new Date(y + 1, 0, 1) - new Date(y, 0, 1));

    setRing(rings.sec, (s + 1) / 60);
    setRing(rings.min, (m + s / 60) / 60);
    setRing(rings.hour, ((h % 12) + m / 60) / 12);
    setRing(rings.month, monthP);
    setRing(rings.year, yearP);
    $("d-secs").textContent = `:${String(s).padStart(2, "0")}`;
    if (m === lastMinute) return;

    // Everything below changes at most once a minute.
    lastMinute = m;
    const hh = CFG.clock24h ? String(h).padStart(2, "0") : String(h % 12 || 12);
    $("d-hm").textContent = `${hh}:${String(m).padStart(2, "0")}`;
    $("d-ampm").textContent = CFG.clock24h ? "" : h < 12 ? "AM" : "PM";
    $("d-greeting").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    $("d-day").textContent = day;
    $("d-month").textContent = MONTHS[mo];
    $("d-weekday").textContent = d.toLocaleDateString([], { weekday: "long" });
    $("d-date-full").textContent = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("d-year-pct").textContent = `${Math.round(yearP * 100)}%`;
    $("d-month-pct").textContent = `${Math.round(monthP * 100)}%`;
  }

  // ---------- Weather circle, its pop-overs, and the Forecast panel ----------
  const pops = [[$("d-wx-more-btn"), $("d-wx-more")], [$("d-wx-loc-btn"), $("d-wx-loc")]];
  function openPop(btn, open) {
    for (const [b, p] of pops) {
      const on = b === btn && open;
      b.setAttribute("aria-expanded", String(on));
      p.hidden = !on;
    }
    if (open && btn === $("d-wx-loc-btn")) $("d-weather-city").focus();
  }
  for (const [btn] of pops) btn.addEventListener("click", () => openPop(btn, btn.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = pops.find(([b]) => b.getAttribute("aria-expanded") === "true");
    if (open) { openPop(open[0], false); open[0].focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".hd-wx-bar, .hd-pop")) pops.forEach(([b]) => b.getAttribute("aria-expanded") === "true" && openPop(b, false));
  });

  const shortDay = (d, i) => (i === 0 ? "Today" : d.toLocaleDateString([], { weekday: "short" }));
  function weather(info) {
    $("d-wx-err").textContent = info.formError || "";
    if (info.formError) return;
    const place = info.loc?.place || info.loc?.name || "";
    $("d-fc-place").textContent = place;
    $("d-wx-place").textContent = place;
    const url = Weather.forecastUrl();
    $("d-fc-link").parentElement.hidden = !url;
    if (url) $("d-fc-link").href = url;
    if (!info.ok) {
      $("d-wx").innerHTML = `<span class="hd-wx-msg">${esc(info.error)}</span>`;
      $("d-fc").innerHTML = `<p class="hd-note">${esc(info.error)}</p>`;
      $("d-wx-rows").innerHTML = "";
      $("d-wx-updated").textContent = "";
      return;
    }
    // A location change succeeded: close the form and show the new weather.
    if ($("d-wx-loc-btn").getAttribute("aria-expanded") === "true") openPop($("d-wx-loc-btn"), false);
    const w = Weather.summary(info.result);
    $("d-wx").innerHTML = `
      <span class="visually-hidden">${w.temp}${w.deg}, ${esc(w.cond)}, high ${w.hi}°, low ${w.lo}°</span>
      <svg class="hd-wx-icon" viewBox="0 0 48 48" aria-hidden="true">${w.icon}</svg>
      <span class="hd-wx-temp" aria-hidden="true">${w.temp}${w.deg}</span>
      <span class="hd-wx-cond" aria-hidden="true">${esc(w.cond)}</span>
      <span class="hd-wx-hilo" aria-hidden="true">H ${w.hi}° · L ${w.lo}°</span>`;
    $("d-wx-updated").textContent = `Updated ${fmtTime(info.at)}`;
    $("d-wx-rows").innerHTML = w.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("d-fc").innerHTML = `<ul class="hd-fc">${w.days.map((d, i) => `
      <li${i === 0 ? ' class="is-today"' : ""}>
        <span class="hd-fc-day" aria-hidden="true">${esc(shortDay(d.date, i))}</span>
        <svg viewBox="0 0 48 48" aria-hidden="true">${d.icon}</svg>
        <span class="hd-fc-hi" aria-hidden="true">${d.hi}°</span>
        <span class="hd-fc-lo" aria-hidden="true">${d.lo}°</span>
        <span class="visually-hidden">${i === 0 ? "Today" : d.date.toLocaleDateString([], { weekday: "long" })}: ${esc(d.cond)}, high ${d.hi}°, low ${d.lo}°</span>
      </li>`).join("")}</ul>`;
  }

  // ---------- Today's schedule ----------
  // "2–4 PM", "11:30 AM–1 PM": hours without :00, and one AM/PM when both ends share it.
  function shortRange(a, b) {
    if (CFG.clock24h) return `${fmtTime(a)}–${fmtTime(b)}`;
    const part = (d) => { const h = d.getHours() % 12 || 12, m = d.getMinutes(); return m ? `${h}:${String(m).padStart(2, "0")}` : String(h); };
    const ap = (d) => (d.getHours() < 12 ? "AM" : "PM");
    return ap(a) === ap(b) ? `${part(a)}–${part(b)} ${ap(b)}` : `${part(a)} ${ap(a)}–${part(b)} ${ap(b)}`;
  }

  // model: { timed, all, upcoming, open, note } from home.js, or { message } when the calendar can't load.
  function schedule(model) {
    const host = $("d-sched");
    if (model.message) { host.innerHTML = `<p class="hd-note">${esc(model.message)}</p>`; $("d-open").textContent = ""; return; }
    const { all, upcoming, open, note } = model;
    $("d-open").textContent = open ? `Open ${shortRange(open.from, open.to)}` : "No open block";
    const shown = upcoming.slice(0, 5);
    let html = note ? `<p class="hd-note">${esc(note)}</p>` : "";
    if (all.length) html += `<p class="hd-allday">All day: ${all.map((e) => esc(e.title)).join(", ")}</p>`;
    html += shown.length
      ? `<ul class="hd-sched">${shown.map((e, i) => `<li class="acc-${ACCENTS[i % 3]}"><span class="hd-sched-time">${fmtTime(e.start)}</span><span class="hd-sched-title">${esc(e.title)}</span></li>`).join("")}</ul>`
      : `<p class="hd-note">${model.timed.length ? "Nothing else on the calendar today." : "Nothing scheduled today."}</p>`;
    if (upcoming.length > shown.length) html += `<p class="hd-more">${upcoming.length - shown.length} more later today</p>`;
    host.innerHTML = html;
  }

  // ---------- Top 3 priorities ----------
  // Top 3 is the Planner's "Critical this week" bucket in the Planner's order, from the shared rules in task-rules.js:
  // overdue, or P1/P2 due in the next 7 days; sorted by due time, then priority. @system tasks never appear.
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function dueText(t, today) {
    const diff = Math.round((t.dueDay - today) / 864e5);
    let text = diff < 0 ? `Overdue ${-diff} day${diff === -1 ? "" : "s"}` : diff === 0 ? "Due today" : diff === 1 ? "Due tomorrow"
      : `Due ${t.dueDay.toLocaleDateString([], { weekday: "long" })}`;
    if (t.due.length > 10) text += `, ${fmtTime(t.dueAt)}`;
    return text;
  }
  // model.needKey: "missing" (no key saved) or "rejected" (the saved key got a 401). Shows the inline key form.
  function tasks(model) {
    const host = $("d-tasks");
    const form = $("d-key-form");
    const needKey = !Demo.on && model.needKey;
    form.hidden = !needKey;
    $("d-key-err").textContent = needKey === "rejected" ? "That key wasn't accepted. Check it and try again." : "";
    if (needKey) {
      host.innerHTML = '<p class="hd-note">Enter your dashboard key to see your top tasks and today\'s schedule here. It\'s the same key the Planner uses.</p>';
      return;
    }
    if (model.message) { host.innerHTML = `<p class="hd-note">${esc(model.message)}</p>`; return; }
    const today = sod(new Date());
    const crit = TaskRules.buckets(TaskRules.prepare(model.body).tasks, today).crit;
    if (!crit.length) { host.innerHTML = '<p class="hd-note">Nothing critical this week. Pick something up in the Planner.</p>'; return; }
    const top = crit.slice(0, 3);
    host.innerHTML = `<ol class="hd-pri">${top.map((t, i) => {
      const meta = [dueText(t, today), 5 - t.priority <= 2 ? `P${5 - t.priority}` : "", t.duration ? fmtDur(t.duration) : ""].filter(Boolean).join(" · ");
      const url = t.url || `https://app.todoist.com/app/task/${encodeURIComponent(t.id)}`;
      // Topic chips are plain text; private topics (Health, Money) also replace the title with "<Topic> task".
      const chips = t.topics.length
        ? `<span class="hd-chips"><span class="visually-hidden">Topics: </span>${t.topics.map((x) => `<span class="hd-chip">${esc(x.name)}</span>`).join('<span class="visually-hidden">, </span>')}</span>`
        : "";
      return `<li class="acc-${PRI_ACCENTS[i]}"><span class="hd-pri-n" aria-hidden="true">${i + 1}</span><span class="hd-pri-text">
        <span class="hd-pri-head"><a class="hd-pri-title" href="${esc(url)}" target="_blank" rel="noopener">${esc(TaskRules.homeTitle(t))}<span class="visually-hidden"> (opens Todoist)</span></a>${chips}</span>
        <span class="hd-pri-meta">${esc(meta)}</span></span></li>`;
    }).join("")}</ol>${crit.length > 3 ? `<p class="hd-more">${crit.length - 3} more critical in the Planner</p>` : ""}`;
  }

  // ---------- Second brain ----------
  const ICON_OK = '<svg class="hd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="#34D399" stroke-width="2.6" fill="none"/></svg>';
  const ICON_WARN = '<svg class="hd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" stroke="#FB923C" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 10v5M12 17.5v.5" stroke="#FB923C" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_OPEN = '<svg class="hd-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="#FB923C" stroke-width="2.4" fill="none"/></svg>';
  function brain(state) {
    const host = $("d-brain");
    if (state.mode === "idle") {
      host.innerHTML = `<p class="hd-note">${esc(Brain.idleText(state))}</p>`;
      return;
    }
    const s = Brain.stats(state.files);
    const sweep = Brain.routine("Claude", /sweep/i);
    const muse = Brain.routine("Muse");
    const next = sweep ? Brain.nextOccurrence(sweep.day, sweep.time) : null;
    const short = (d) => `${d.toLocaleDateString([], { weekday: "short" })} ${fmtTime(d)}`;
    const n = (k, one) => `${k} ${k === 1 ? one : `${one}s`}`;
    const sweepLine = s.lastSweep
      ? `Last sweep: ${short(s.lastSweep)}${s.sweepFresh ? "" : " (overdue)"}${next ? ` · next: ${short(next)}` : ""}`
      : `No sweep found yet${next ? ` · next: ${short(next)}` : ""}`;
    const museLine = muse
      ? `Muse checks ${new Date(2000, 0, 2 + muse.day).toLocaleDateString([], { weekday: "long" })}s ${fmtTime(new Date(`2000-01-01T${muse.time}`))} · not confirmed yet`
      : "";
    host.innerHTML = `
      <p class="hd-big">${n(s.total, "note")}, <span class="hd-accent">${s.newThisWeek} new this week</span></p>
      <ul class="hd-checks">
        <li>${s.sweepFresh ? ICON_OK : ICON_WARN}<span>${esc(sweepLine)}</span></li>
        ${museLine ? `<li>${ICON_OPEN}<span>${esc(museLine)}</span></li>` : ""}
      </ul>`;
  }

  // ---------- Now playing (Spotify embed) ----------
  // The demo has no Spotify embed (that would be a real playlist): a same-size sample player whose controls show "Demo only".
  async function demoMusic() {
    const host = $("d-music");
    const list = (await Demo.data()).playlist;
    host.innerHTML = `
      <div class="hd-embed hd-fake-player">
        <p class="hd-fake-now"><span class="hd-fake-label">Sample playlist</span><span class="hd-fake-title">${esc(list[0].title)}</span><span class="hd-fake-artist">${esc(list[0].artist)} · ${esc(list[0].length)}</span></p>
        <button type="button" class="btn btn-ghost" data-write="Playing music">Play</button>
        <ol class="hd-fake-list" aria-label="Up next">${list.slice(1).map((t) => `<li>${esc(t.title)} <span>${esc(t.artist)}</span></li>`).join("")}</ol>
      </div>
      <div class="hd-div"><a class="hd-link" href="#demo-only" data-write="Opening Spotify">Open in Spotify</a></div>`;
    $("d-eq").hidden = false;
  }

  function music() {
    if (Demo.on) { demoMusic(); return; }
    const raw = (CFG.spotifyPlaylistUrl || "").trim();
    const m = raw.match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
    const host = $("d-music");
    if (!m) {
      host.innerHTML = `<p class="hd-note">${raw ? "That Spotify link isn't one Cortex can embed." : "Add a playlist link in config.js"} (<code>spotifyPlaylistUrl</code>) to play it here.</p>`;
      return;
    }
    const [, type, id] = m;
    const open = `https://open.spotify.com/${type}/${id}`;
    host.innerHTML = `
      <div class="hd-embed">
        <iframe title="Spotify player: Cortex playlist" src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&amp;theme=0"
          width="100%" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
      </div>
      <div class="hd-div"><a class="hd-link" href="${open}" target="_blank" rel="noopener">Open in Spotify<span class="visually-hidden"> (opens in a new tab)</span></a></div>`;
    $("d-eq").hidden = false;
  }

  // ---------- Quick links ----------
  function links() {
    const ul = $("d-links");
    for (const l of CFG.launchers) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = '<span class="hd-code" aria-hidden="true"></span><span class="hd-link-label"></span><span class="visually-hidden"> (opens in a new tab)</span>';
      a.querySelector(".hd-code").textContent = l.code || l.label.slice(0, 2).toUpperCase();
      a.querySelector(".hd-link-label").textContent = l.label;
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  function bindWeather(host, after) {
    Weather.bind($("d-weather-form"), $("d-weather-city"), $("d-weather-geo"), host, after);
    Weather.subscribe(weather);
  }

  music();
  links();
  return { tick, schedule, tasks, brain, bindWeather };
})();
