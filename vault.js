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
    render();
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

  function renderList() {
    const ul = $("notes");
    // Lists redraw as titles arrive, so keep keyboard focus on the same note.
    const focusedId = document.activeElement?.closest?.(".note-btn")?.dataset.id;
    ul.replaceChildren();
    if (state.mode === "idle") {
      $("files-filter").textContent = "";
      ul.innerHTML = '<li class="empty"></li>';
      ul.firstChild.textContent = Brain.idleText(state);
      return;
    }
    const list = visible();
    const parts = [];
    if (view.area) parts.push(AREAS.find((a) => a.key === view.area).label);
    if (view.contentHits) parts.push(`contains "${view.query}"`);
    else if (view.query) parts.push(`matches "${view.query}"`);
    const summary = `Showing ${list.length}${parts.length ? `: ${parts.join(" · ")}` : ""}${view.describing ? " · reading titles…" : ""}`;
    if ($("files-filter").textContent !== summary) $("files-filter").textContent = summary;
    if (!list.length) { ul.innerHTML = '<li class="empty">Nothing matches.</li>'; return; }
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
      b.addEventListener("click", () => openViewer(f, b));
      li.appendChild(b);
      ul.appendChild(li);
      if (f.id === focusedId) b.focus();
    }
  }

  function render() {
    renderChips();
    renderList();
  }

  // ---------- Search ----------
  $("search-input").addEventListener("input", (e) => {
    view.query = e.target.value;
    view.contentHits = null;
    renderList();
  });
  $("search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = view.query.trim();
    if (!q) return;
    if (state.mode === "demo") {
      const needle = q.toLowerCase();
      view.contentHits = state.files.filter((f) => [f.body, f.name, f.title].some((v) => (v || "").toLowerCase().includes(needle)));
      renderList();
      return;
    }
    if (state.mode !== "live") return;
    $("files-filter").textContent = "Searching inside notes…";
    try {
      const hits = await Drive.searchContent(q, state.folders.map((f) => f.id));
      const byId = new Map(state.files.map((f) => [f.id, f]));
      view.contentHits = hits.map((h) => byId.get(h.id)).filter(Boolean);
      renderList();
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
  let opener = null;
  async function openViewer(f, from) {
    opener = from;
    const dlg = $("viewer");
    $("viewer-title").textContent = f.title || Brain.prettyName(f.name);
    const type = AREAS.find((a) => a.key === f.area)?.one || "Note";
    $("viewer-kicker").textContent = `${type} · ${f.name} · updated ${new Date(f.modifiedTime).toLocaleString()}`;
    const link = $("viewer-link");
    link.href = f.webViewLink || "#";
    link.parentElement.hidden = !f.webViewLink;
    const body = $("viewer-body");
    body.innerHTML = '<p class="muted">Loading…</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const text = state.mode === "demo" ? f.body : await Drive.readFile(f);
      if (text == null) { body.innerHTML = '<p class="muted">Cortex can only show text notes and Google Docs. Open it in Drive instead.</p>'; return; }
      const note = Brain.parseNote(text);
      renderMarkdownLite(body, note.body);
      if (note.fm.description) {
        const lead = document.createElement("p");
        lead.className = "viewer-lead";
        lead.textContent = note.fm.description;
        body.prepend(lead);
      }
    } catch (err) {
      body.innerHTML = '<p class="muted"></p>';
      body.firstChild.textContent = err.message;
    }
  }
  $("viewer-close").addEventListener("click", () => $("viewer").close());
  $("viewer").addEventListener("click", (e) => { if (e.target === $("viewer")) $("viewer").close(); });
  $("viewer").addEventListener("close", () => opener?.focus());

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
