// Cortex Vault: Second Brain notes with titles, one-line summaries and type tags.
(() => {
  const $ = (id) => document.getElementById(id);
  const { AREAS } = Brain;
  const params = new URLSearchParams(location.search);

  const view = {
    // null = every type except retired; retired notes only show when their chip is picked.
    area: AREAS.some((a) => a.key === params.get("type")) ? params.get("type") : null,
    query: "",
    contentHits: null,
    describing: false,
    selectedId: null,
  };
  let state = Brain.state;

  // ---------- Type filter chips ----------
  function renderChips() {
    const counts = Brain.stats(state.files).counts;
    const has = state.mode !== "idle";
    const chips = [{ key: null, label: "All", n: has ? Object.entries(counts).filter(([k]) => k !== "retired").reduce((a, [, n]) => a + n, 0) : null },
      ...AREAS.map((a) => ({ key: a.key, label: a.label, n: has ? counts[a.key] : null }))];
    $("chips").innerHTML = chips.map((c) => `
      <li><button type="button" class="chip" data-key="${c.key ?? ""}" aria-pressed="${view.area === c.key}">
        ${c.label}${c.n != null ? ` <span class="chip-n">${c.n}</span>` : ""}
      </button></li>`).join("");
  }
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-key]");
    if (!b) return;
    view.area = b.dataset.key || null;
    view.contentHits = null;
    const url = new URL(location.href);
    if (view.area) url.searchParams.set("type", view.area); else url.searchParams.delete("type");
    history.replaceState(null, "", url);
    render({ reselect: true });
    $("chips").querySelector(`button[data-key="${view.area ?? ""}"]`)?.focus();
  });

  // ---------- List ----------
  function visible() {
    let list = view.contentHits ?? state.files;
    list = view.area ? list.filter((f) => f.area === view.area) : list.filter((f) => f.area !== "retired");
    const q = view.query.trim().toLowerCase();
    if (q && !view.contentHits) list = list.filter((f) => [f.title, f.summary, f.name, f.folder].some((v) => (v || "").toLowerCase().includes(q)));
    return [...list].sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)).slice(0, 80);
  }

  // opts.reselect: the filter or search changed, so the first result opens in the reader.
  function renderList(opts = {}) {
    const ul = $("notes");
    // Lists redraw as titles arrive, so keep keyboard focus on the same note.
    const focusedId = document.activeElement?.closest?.(".note-btn")?.dataset.id;
    ul.replaceChildren();
    if (state.mode === "idle") {
      $("files-filter").textContent = "";
      ul.innerHTML = '<li class="empty"></li>';
      ul.firstChild.textContent = Brain.idleText(state);
      select(null);
      return;
    }
    const list = visible();
    const parts = [];
    if (view.area) parts.push(AREAS.find((a) => a.key === view.area).label);
    if (view.contentHits) parts.push(`contains "${view.query}"`);
    else if (view.query) parts.push(`matches "${view.query}"`);
    const summary = `Showing ${list.length}${parts.length ? `: ${parts.join(" · ")}` : ""}${view.describing ? " · reading titles…" : ""}`;
    if ($("files-filter").textContent !== summary) $("files-filter").textContent = summary;
    if (!list.length) { ul.innerHTML = '<li class="empty">Nothing matches.</li>'; select(null); return; }
    // Keep the open note while titles arrive or Drive re-syncs; open the first result when the filter changes or the note is gone.
    const keep = !opts.reselect && list.find((f) => f.id === view.selectedId);
    const current = keep || list[0];
    for (const f of list) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "note-btn";
      b.dataset.id = f.id;
      b.innerHTML = '<span class="note-main"><span class="note-title"></span><span class="note-summary"></span></span><span class="note-meta"><span class="tag"></span><span class="note-time"></span></span>';
      b.querySelector(".note-title").textContent = f.title || Brain.prettyName(f.name);
      b.querySelector(".note-summary").textContent = f.summary || "No summary yet.";
      b.querySelector(".note-summary").classList.toggle("is-empty", !f.summary);
      const tag = b.querySelector(".tag");
      tag.className = `tag tag-${f.area}`;
      tag.textContent = AREAS.find((a) => a.key === f.area)?.one || f.area;
      b.querySelector(".note-time").textContent = `Updated ${Brain.ago(f.modifiedTime)}`;
      if (f.id === current.id) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => select(f, { user: true }));
      li.appendChild(b);
      ul.appendChild(li);
      if (f.id === focusedId) b.focus();
    }
    select(current);
  }

  // Arrow keys move between notes; Enter or click opens one.
  $("notes").addEventListener("keydown", (e) => {
    const btns = [...$("notes").querySelectorAll(".note-btn")];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: btns.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, to))].focus();
  });

  function render(opts) {
    renderChips();
    renderList(opts);
  }

  // ---------- Search ----------
  $("search-input").addEventListener("input", (e) => {
    view.query = e.target.value;
    view.contentHits = null;
    renderList({ reselect: true });
  });
  $("search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = view.query.trim();
    if (!q) return;
    if (state.mode === "demo") {
      const needle = q.toLowerCase();
      view.contentHits = state.files.filter((f) => [f.body, f.name, f.title].some((v) => (v || "").toLowerCase().includes(needle)));
      renderList({ reselect: true });
      return;
    }
    if (state.mode !== "live") return;
    $("files-filter").textContent = "Searching inside notes…";
    try {
      const hits = await Drive.searchContent(q, state.folders.map((f) => f.id));
      const byId = new Map(state.files.map((f) => [f.id, f]));
      view.contentHits = hits.map((h) => byId.get(h.id)).filter(Boolean);
      renderList({ reselect: true });
    } catch (err) {
      $("files-filter").textContent = err.message;
    }
  });

  // ---------- Reader ----------
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
  // Two columns side by side from 1101px; below that the reader sits under the list.
  const sideBySide = matchMedia("(min-width: 1101px)");
  let loaded; // id + version of the note whose text is in the reader
  let loading = 0;

  // Shows f in the reader (null clears it). opts.user: picked by click or Enter, so focus follows sensibly.
  async function select(f, opts = {}) {
    view.selectedId = f?.id ?? null;
    for (const b of $("notes").querySelectorAll(".note-btn")) {
      if (b.dataset.id === view.selectedId) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    }
    const title = f ? f.title || Brain.prettyName(f.name) : "No note open";
    if ($("reader-title").textContent !== title) $("reader-title").textContent = title;
    const type = f && (AREAS.find((a) => a.key === f.area)?.one || "Note");
    $("reader-kicker").textContent = f ? `${type} · ${f.name} · updated ${new Date(f.modifiedTime).toLocaleString()}` : "";
    $("reader-link").href = f?.webViewLink || "#";
    $("reader-link").hidden = !f?.webViewLink;
    $("reader-back").hidden = !f;
    if (opts.user) {
      $("reader-status").textContent = `${title} is open in the reader.`;
      // Side by side, focus stays on the list so arrow keys keep working; stacked, the reader is below, so go to it.
      if (!sideBySide.matches) $("reader-title").focus();
    }
    const key = f ? `${f.id}@${f.modifiedTime}` : null;
    if (key === loaded) return;
    loaded = key;
    const body = $("reader-body");
    body.scrollTop = 0;
    if (!f) {
      body.innerHTML = state.mode === "idle" ? '<p class="muted"></p>' : '<p class="muted">Nothing to show. Pick another type or clear the search.</p>';
      if (state.mode === "idle") body.firstChild.textContent = Brain.idleText(state);
      return;
    }
    const token = ++loading;
    body.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const text = state.mode === "demo" ? f.body : await Drive.readFile(f);
      if (token !== loading) return;
      if (text == null) { body.innerHTML = '<p class="muted">Cortex can only show text notes and Google Docs. Open it in Drive instead.</p>'; return; }
      const note = Brain.parseNote(text);
      renderMarkdownLite(body, note.body);
      // The heading above already names the note, so drop a matching first heading.
      if (body.firstElementChild?.tagName === "H3" && body.firstElementChild.textContent.trim() === title.trim()) body.firstElementChild.remove();
      if (note.fm.description) {
        const lead = document.createElement("p");
        lead.className = "reader-lead";
        lead.textContent = note.fm.description;
        body.prepend(lead);
      }
    } catch (err) {
      if (token !== loading) return;
      loaded = null; // try again next time it is picked
      body.innerHTML = '<p class="muted"></p>';
      body.firstChild.textContent = err.message;
    }
  }
  $("reader-back").addEventListener("click", () => {
    const b = [...$("notes").querySelectorAll(".note-btn")].find((x) => x.dataset.id === view.selectedId);
    (b || $("search-input")).focus();
  });

  // Panels fill the window below the page heading; the banner and notice above them can come and go.
  const grid = document.querySelector(".vault-grid");
  const fit = () => {
    const top = `${Math.round(grid.getBoundingClientRect().top + scrollY)}px`;
    if (document.documentElement.style.getPropertyValue("--vault-top") !== top) document.documentElement.style.setProperty("--vault-top", top);
  };
  new ResizeObserver(fit).observe(document.body);
  addEventListener("resize", fit);

  // ---------- Boot ----------
  let described = null;
  Brain.boot({
    onUpdate(s) {
      state = s;
      render();
      // Titles and summaries come from each note's frontmatter, read once per file version.
      if (s.mode !== "idle" && described !== s.files) {
        described = s.files;
        view.describing = true;
        Brain.describe(s.files, { demo: s.mode === "demo", onProgress: renderList })
          .finally(() => { if (described === s.files) { view.describing = false; renderList(); } });
      }
    },
  });
})();
