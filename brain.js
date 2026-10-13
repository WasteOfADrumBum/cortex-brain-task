// Shared Second Brain state for the Home, Vault and Ops tabs (and the header on placeholder tabs):
// Drive link, Preview (sample data), note types, sweep facts and note titles/summaries.
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

  // ---------- Preview (sample data) ----------
  // Preview carries across tabs for this browser tab, so moving between tabs keeps the sample data.
  const PREVIEW_KEY = "cortex.preview";
  const previewOn = () => { try { return sessionStorage.getItem(PREVIEW_KEY) === "1"; } catch { return false; } };
  const setPreview = (on) => { try { on ? sessionStorage.setItem(PREVIEW_KEY, "1") : sessionStorage.removeItem(PREVIEW_KEY); } catch { /* blocked */ } };

  function demoFiles() {
    const now = Date.now();
    const iso = (daysAgo, h = 0) => new Date(now - daysAgo * DAY - h * 3600000).toISOString();
    const mk = (name, folder, created, modified, body) => ({
      id: `demo-${name}`, name, folder, mimeType: "text/markdown",
      createdTime: iso(created), modifiedTime: iso(modified ?? created, 1), webViewLink: "", body,
    });
    const note = (title, description, text) => `---\nname: ${title}\ndescription: ${description}\n---\n# ${title}\n\n${text}`;
    const files = [
      mk("00-index.md", "", 30, 3, note("Second Brain rules (v6)", "How the brain is organised and what the weekly sweep does.", "## Folders\n- inbox/ holds new captures\n- notes/ is flat\n\n## Weekly sweep\n- Runs Mondays before 9am\n- Tags decision and about-me notes\n- Writes a digest")),
      mk("about-me.md", "", 60, 2, note("About me", "Sample profile: who I am, what I work on and how I like to work.", "Sample profile text. Your real about-me.md appears here once Drive is linked.")),
      mk("2026-10-05-weekly-digest.md", "notes", 5, 5, note("Weekly digest, Oct 5", "9 notes filed, 2 decisions tagged, inbox down to 3.", "- 9 notes filed\n- 2 decisions tagged\n- Inbox cleared to 3")),
      mk("2026-09-28-weekly-digest.md", "notes", 12, 12, note("Weekly digest, Sep 28", "6 notes filed and one duplicate merged.", "- 6 notes filed")),
      mk("00-index-v5-retired.md", "notes", 40, 20, "Retired index version."),
      mk("00-index-v4-retired.md", "notes", 70, 40, "Retired index version."),
      mk("idea-garage-workbench.md", "inbox", 0, 0, "Build a fold-down workbench for the garage."),
      mk("call-dentist.md", "inbox", 1, 1, "Reschedule cleaning."),
      mk("podcast-notes-focus.md", "inbox", 2, 2, "Notes on deep work and focus."),
      mk("gift-ideas.md", "inbox", 3, 1, "- Headphones\n- Board game"),
    ];
    const topics = [
      ["decision-new-laptop", "Decision: new laptop", "Chose a 14-inch model for battery life over raw speed."],
      ["drum-practice-plan", "Drum practice plan", "Four short sessions a week focused on rudiments and fills."],
      ["budget-q4", "Q4 budget", "Spending targets for October to December, with holiday travel."],
      ["meal-prep-ideas", "Meal prep ideas", "Easy batch meals that keep for four days."],
      ["reading-list", "Reading list", "Books queued for the rest of the year."],
      ["car-maintenance", "Car maintenance", "Oil change and tire rotation schedule."],
      ["workout-split", "Workout split", "Three-day strength routine with one cardio day."],
      ["home-network", "Home network", "Router settings and which devices sit on the guest network."],
      ["vacation-shortlist", "Vacation shortlist", "Three spring trip options with rough costs."],
      ["side-project-cortex", "Side project: Cortex", "What Cortex is for and the plan for version 2."],
      ["habit-tracker", "Habit tracker", "Daily habits being tried this month."],
      ["learning-rust", "Learning Rust", "Notes from the first five chapters of the Rust book."],
      ["garden-plan", "Garden plan", "What to plant in the raised beds next spring."],
      ["music-gear-wishlist", "Music gear wishlist", "Cymbals and an audio interface, in priority order."],
      ["weekly-review-template", "Weekly review template", "Questions to answer every Sunday evening."],
      ["ai-tools-compare", "AI tools compared", "Which assistant to use for writing, coding and research."],
      ["photo-backup-plan", "Photo backup plan", "Two copies on site, one in the cloud."],
    ];
    topics.forEach(([slug, title, desc], i) => {
      const created = (i * 7) % 29 + (i % 3);
      files.push(mk(`${slug}.md`, "notes", created, Math.max(0, created - (i % 4)), note(title, desc, `Sample note for Preview mode.\n\n- Point one\n- Point two`)));
    });
    return files.map((f) => ({ ...f, area: areaOf(f) }));
  }

  // ---------- Drive link + Preview wiring for a page ----------
  const state = {
    mode: "idle", // idle | live | demo
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

  function renderHeader() {
    let s = ["", "Standby"];
    if (state.mode === "demo") s = ["demo", "Preview data"];
    else if (state.drive === "unconfigured") s = ["warn", "Setup needed"];
    else if (state.drive === "expired") s = ["warn", "Relink Drive"];
    else if (state.drive === "error") s = ["warn", "Drive error"];
    else if (state.mode === "live") {
      const st = stats(state.files);
      s = st.lastSweep == null ? ["warn", "No sweep found"] : st.sweepFresh ? ["ok", "Drive linked"] : ["warn", "Sweep overdue"];
    }
    CortexHeader.setStatus(s[0], s[1]);
    const auth = document.getElementById("btn-auth");
    auth.textContent = state.drive === "linked" ? "Sign out" : state.drive === "expired" ? "Relink Drive" : "Link Drive";
    auth.disabled = !["ready", "linked", "expired", "error"].includes(state.drive);
    const demo = document.getElementById("btn-demo");
    demo.setAttribute("aria-pressed", String(state.mode === "demo"));
    // Preview is only for trying Cortex before Drive is linked.
    demo.hidden = state.drive === "linked" && state.mode !== "demo";
    const ticker = document.getElementById("ticker-sync");
    if (ticker) ticker.textContent = state.lastSync ? `Last sync: ${fmtTime(state.lastSync)}` : "Last sync: never";
  }

  function update() {
    renderHeader();
    onUpdate(state);
  }

  async function sync() {
    try {
      const [{ files, folders }, storage] = await Promise.all([
        Drive.loadBrain(CFG.brainFolderId),
        wantStorage ? Drive.storage().catch(() => null) : null, // storage is a nice-to-have; never fail the sync over it
      ]);
      if (state.mode === "demo") return; // Preview was switched on while syncing
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

  function startDemo() {
    state.mode = "demo";
    state.files = demoFiles();
    state.storage = { used: 4.2 * 2 ** 30, limit: 15 * 2 ** 30, trash: 0 };
    state.lastSync = null;
  }

  function onDriveChange(event, detail) {
    if (event === "linked") { state.drive = "linked"; if (state.mode !== "demo") sync(); else update(); return; }
    if (event === "signed-out") { state.drive = "ready"; if (state.mode === "live") { state.mode = "idle"; state.files = []; } state.storage = null; }
    if (event === "expired") state.drive = "expired";
    if (event === "error") { state.drive = "error"; state.error = detail; notice(`Google sign-in: ${detail}`); }
    update();
  }

  // options: { storage: also load Drive storage, onUpdate(state): redraw the page }
  function boot(options = {}) {
    onUpdate = options.onUpdate || (() => {});
    wantStorage = Boolean(options.storage);

    document.getElementById("btn-auth").addEventListener("click", () => {
      if (state.drive === "linked") Drive.signOut();
      else Drive.signIn();
    });
    document.getElementById("btn-demo").addEventListener("click", () => {
      if (state.mode === "demo") {
        setPreview(false);
        state.mode = Drive.linked() ? "live" : "idle";
        state.files = [];
        state.storage = null;
        if (state.mode === "live") { sync(); return; }
      } else {
        setPreview(true);
        startDemo();
      }
      update();
    });

    // ?demo=1 is the old Preview link; it switches Preview on for this browser tab.
    if (new URLSearchParams(location.search).has("demo")) setPreview(true);
    if (previewOn()) startDemo();
    update();

    setInterval(() => { if (state.mode === "live" && Drive.linked()) sync(); }, 10 * 60000);

    Drive.init(onDriveChange).then((r) => {
      state.drive = r;
      if (r === "unconfigured") notice("Add your Google OAuth client ID to config.js to link Drive. Until then, press Preview to see Cortex with sample data.");
      if (r === "linked" && state.mode !== "demo") { sync(); return; }
      update();
    }).catch((err) => {
      state.drive = "error";
      state.error = err.message;
      notice(err.message);
      update();
    });
    return state;
  }

  return {
    AREAS, DAY, areaOf, ago, startOfDay, fmtTime, fmtWhen, nextOccurrence, routine,
    stats, parseNote, prettyName, describe, boot, state, notice,
  };
})();
