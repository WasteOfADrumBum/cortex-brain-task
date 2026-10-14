// Shared Second Brain state for the Home, Vault and Ops tabs (and the header on placeholder tabs):
// the sign-in gate, Drive link, note types, sweep facts and note titles/summaries.
// Signed out, these pages show only the sign-in screen. On /demo (src/demo/mode.js) they show sample notes instead of Drive.
const Brain = (() => {
  const CFG = window.CORTEX_CONFIG;
  const DAY = 86400000;

  // Note types, in filter order. `one` is the singular used on tags.
  const AREAS = [
    { key: "inbox", label: "Inbox", one: "Inbox" },
    { key: "notes", label: "Notes", one: "Note" },
    { key: "digest", label: "Digests", one: "Digest" },
    { key: "index", label: "Index", one: "Index" },
    { key: "profile", label: "Profile", one: "Profile" },
    { key: "retired", label: "Retired", one: "Retired" },
  ];

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
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.round(h / 24);
    if (d === 1) return "yesterday";
    if (d < 30) return `${d} days ago`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  }
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !CFG.clock24h });
  const fmtWhen = (d) => `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${fmtTime(d)}`;

  function nextOccurrence(day, time) {
    const [hh, mm] = time.split(":").map(Number);
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
    let add = (day - now.getDay() + 7) % 7;
    if (add === 0 && d <= now) add = 7;
    d.setDate(d.getDate() + add);
    return d;
  }
  // A recurring routine from config.js `schedule`, e.g. routine("Claude", /sweep/i).
  const routine = (who, label = /./) => (CFG.schedule || []).find((s) => s.who === who && label.test(s.label));

  // ---------- Stats used by Home and Ops ----------
  function stats(files) {
    const counts = Object.fromEntries(AREAS.map((a) => [a.key, 0]));
    files.forEach((f) => counts[f.area]++);
    // Retired versions are archives: they keep their own count but don't count as notes.
    const active = files.filter((f) => f.area !== "retired");
    const weekAgo = Date.now() - 7 * DAY;
    const newThisWeek = active.filter((f) => new Date(f.createdTime) > weekAgo).length;
    const digests = files.filter((f) => f.area === "digest").sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const lastSweep = digests[0] ? new Date(digests[0].createdTime) : null;
    const daysSince = lastSweep ? Math.floor((Date.now() - lastSweep) / DAY) : null;
    const interval = CFG.sweepIntervalDays || 7;
    return { counts, total: active.length, newThisWeek, lastSweep, lastDigest: digests[0] || null, daysSince, sweepFresh: daysSince != null && daysSince <= interval };
  }

  // ---------- Note titles and summaries ----------
  // Frontmatter is the simple `key: value` block between leading --- lines that the sweep writes.
  function parseNote(text) {
    const fm = {};
    let body = text || "";
    const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (m) {
      for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (kv) fm[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim();
      }
      body = body.slice(m[0].length);
    }
    const heading = body.match(/^#{1,6}\s+(.+)$/m)?.[1].trim();
    const firstPara = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^(#|[-*+]\s|```|>|\|)/.test(l));
    const sentence = firstPara?.match(/^(.+?[.!?])(\s|$)/)?.[1] || firstPara || "";
    const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
    return { fm, body, title: fm.name || heading || "", summary: clip(fm.description || sentence, 160) };
  }
  // "2026-10-05-weekly-digest.md" -> "2026-10-05 weekly digest"
  const prettyName = (name) => name.replace(/\.(md|markdown|txt)$/i, "").replace(/(\d)-(?=[a-z])/gi, "$1 ").replace(/(?<=[a-z])-(?=[a-z0-9])/gi, " ");

  // Titles and summaries need each note's text, so they are cached per file version in this browser.
  const META_KEY = "cortex.noteMeta";
  let metaCache = null;
  function cache() {
    if (!metaCache) { try { metaCache = JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { metaCache = {}; } }
    return metaCache;
  }
  function saveCache(files) {
    const keep = new Set(files.map((f) => f.id));
    const c = cache();
    for (const id of Object.keys(c)) if (!keep.has(id)) delete c[id];
    try { localStorage.setItem(META_KEY, JSON.stringify(c)); } catch { /* storage full or blocked */ }
  }
  function applyMeta(f, meta) {
    f.title = meta?.title || prettyName(f.name);
    f.summary = meta?.summary || "";
    return f;
  }
  // Fills f.title and f.summary for every file. Calls onProgress after each batch so lists can redraw.
  async function describe(files, { demo = false, onProgress = () => {} } = {}) {
    const c = cache();
    const todo = [];
    for (const f of files) {
      if (demo) { applyMeta(f, parseNote(f.body)); continue; }
      const hit = c[f.id];
      if (hit && hit.m === f.modifiedTime) applyMeta(f, hit);
      else { applyMeta(f, null); todo.push(f); }
    }
    onProgress();
    let i = 0;
    async function worker() {
      while (i < todo.length) {
        const f = todo[i++];
        try {
          const text = await Drive.readFile(f);
          const meta = text == null ? { title: "", summary: "" } : parseNote(text);
          c[f.id] = { m: f.modifiedTime, title: meta.title, summary: meta.summary };
          applyMeta(f, meta);
        } catch { /* leave the file name as the title */ }
        if (i % 6 === 0) onProgress();
      }
    }
    if (todo.length) {
      await Promise.all([worker(), worker(), worker(), worker()]);
      saveCache(files);
      onProgress();
    }
  }

  // ---------- Sign-in gate, Drive link and demo wiring for a page ----------
  const state = {
    mode: "idle", // idle | live | demo
    auth: "pending", // pending | in | out: out shows only the sign-in screen
    drive: "starting", // starting | unconfigured | ready | linked | expired | error
    files: [],
    folders: [],
    storage: null,
    lastSync: null,
    error: "",
  };
  let onUpdate = () => {};
  let wantStorage = false;

  function notice(text) {
    const n = document.getElementById("notice");
    if (!n) return;
    n.hidden = !text;
    n.textContent = text || "";
  }

  // ---------- Sign-in screen ----------
  // Signed out, the page shows this and nothing else: no panels, no tabs, no sample data.
  // The page's own content stays in the DOM but hidden (body[data-auth="out"] in styles.css), and never loads data.
  let signinNote = null;
  let signinBtn = null;
  function buildSignin() {
    const main = document.getElementById("main");
    if (!main || document.getElementById("signin")) return;
    const box = document.createElement("section");
    box.className = "signin";
    box.id = "signin";
    box.setAttribute("aria-labelledby", "signin-h");
    box.innerHTML = `
      <svg class="signin-mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" class="bm-outer"/><circle cx="24" cy="24" r="14" class="bm-mid"/><circle cx="24" cy="24" r="6" class="bm-core"/>
      </svg>
      <h1 id="signin-h">Sign in to Cortex</h1>
      <p class="signin-lede">Cortex is a private dashboard. Sign in with the Google account that owns it.</p>
      <button type="button" class="btn btn-primary signin-btn" id="signin-btn" disabled>Sign in with Google</button>
      <p class="signin-note" id="signin-note" role="status">Loading Google sign-in…</p>
      <p class="signin-demo"><a href="/demo">See the demo with sample data</a></p>`;
    main.prepend(box);
    signinBtn = box.querySelector("#signin-btn");
    signinNote = box.querySelector("#signin-note");
    signinBtn.addEventListener("click", () => Drive.signIn());
  }
  function renderSignin() {
    if (!signinBtn) return;
    signinBtn.disabled = !["ready", "expired", "error"].includes(state.drive);
    signinNote.textContent =
      state.drive === "starting" ? "Loading Google sign-in…"
      : state.drive === "unconfigured" ? "Sign-in isn't set up: add the Google client ID to config.js."
      : state.drive === "error" ? `Google sign-in: ${state.error}`
      : state.drive === "expired" ? "Your session ended. Sign in again to continue."
      : "";
  }
  function setAuth(auth) {
    state.auth = auth;
    document.body.dataset.auth = auth;
  }

  function renderHeader() {
    let s = ["", "Standby"];
    if (Demo.on) s = ["demo", "Demo data"];
    else if (state.auth === "out") s = ["", "Signed out"];
    else if (state.drive === "unconfigured") s = ["warn", "Setup needed"];
    else if (state.drive === "expired") s = ["warn", "Relink Drive"];
    else if (state.drive === "error") s = ["warn", "Drive error"];
    else if (state.mode === "live") {
      const st = stats(state.files);
      s = st.lastSweep == null ? ["warn", "No sweep found"] : st.sweepFresh ? ["ok", "Drive linked"] : ["warn", "Sweep overdue"];
    }
    CortexHeader.setStatus(s[0], s[1]);
    const auth = document.getElementById("btn-auth");
    if (Demo.on) {
      auth.textContent = "Link Drive"; // data-write: the demo answers with "Demo only"
    } else {
      auth.textContent = state.drive === "linked" ? "Sign out" : state.drive === "expired" ? "Relink Drive" : "Link Drive";
      auth.disabled = !["ready", "linked", "expired", "error"].includes(state.drive);
    }
    const ticker = document.getElementById("ticker-sync");
    if (ticker) ticker.textContent = Demo.on ? "Sample data" : state.lastSync ? `Last sync: ${fmtTime(state.lastSync)}` : "Last sync: never";
  }

  function update() {
    renderHeader();
    renderSignin();
    onUpdate(state);
  }

  async function sync() {
    try {
      const [{ files, folders }, storage] = await Promise.all([
        Drive.loadBrain(CFG.brainFolderId),
        wantStorage ? Drive.storage().catch(() => null) : null, // storage is a nice-to-have; never fail the sync over it
      ]);
      state.storage = storage;
      state.files = files.map((f) => ({ ...f, area: areaOf(f) }));
      state.folders = folders;
      state.mode = "live";
      state.lastSync = new Date();
      notice("");
    } catch (err) {
      notice(err.message);
    }
    update();
  }

  function onDriveChange(event, detail) {
    if (event === "linked") { state.drive = "linked"; setAuth("in"); sync(); return; }
    // Signing out leaves nothing of the brain on screen: reload to the sign-in screen.
    if (event === "signed-out") { location.reload(); return; }
    // An expired session keeps what is on screen; the top bar offers Relink Drive.
    if (event === "expired") state.drive = "expired";
    if (event === "error") { state.drive = "error"; state.error = detail; if (state.auth === "in") notice(`Google sign-in: ${detail}`); }
    update();
  }

  // The demo's sample notes and storage, the same shape Drive gives (src/types.d.ts).
  async function bootDemo() {
    setAuth("in");
    update();
    const demo = await Demo.data();
    state.files = demo.notes(new Date()).map((f) => ({ ...f, area: areaOf(f) }));
    state.storage = demo.storage;
    state.mode = "demo";
    update();
  }

  // What a panel says while there are no notes to show yet (signed in, but Drive hasn't answered).
  function idleText(st) {
    if (st.drive === "unconfigured" && !Demo.on) return "Add the Google client ID to config.js, then link Drive.";
    if (st.drive === "expired" || st.drive === "error") return "Link Drive again (top bar) to see your notes.";
    return "Loading notes…";
  }

  // options: { storage: also load Drive storage, onUpdate(state): redraw the page }
  // Pages read state.auth: they load their own data (weather, calendar, tasks) only once it is "in".
  function boot(options = {}) {
    onUpdate = options.onUpdate || (() => {});
    wantStorage = Boolean(options.storage);

    document.getElementById("btn-auth").addEventListener("click", () => {
      if (state.drive === "linked") Drive.signOut();
      else Drive.signIn();
    });

    if (Demo.on) { bootDemo(); return state; }

    buildSignin();
    // Decide on first paint from the stored session, so a signed-in reload never flashes the sign-in screen.
    setAuth(Drive.hasSession() ? "in" : "out");
    update();

    setInterval(() => { if (state.mode === "live" && Drive.linked()) sync(); }, 10 * 60000);

    Drive.init(onDriveChange).then((r) => {
      state.drive = r;
      if (r === "linked") { setAuth("in"); sync(); return; }
      if (state.mode !== "live") setAuth("out");
      update();
    }).catch((err) => {
      state.drive = "error";
      state.error = err.message;
      update();
    });
    return state;
  }

  return {
    AREAS, DAY, areaOf, ago, startOfDay, fmtTime, fmtWhen, nextOccurrence, routine,
    stats, parseNote, prettyName, describe, boot, idleText, state, notice,
  };
})();
