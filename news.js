// Cortex News: headlines by category from /api/news (free RSS feeds in config/news-feeds.json, same dashboard key as
// the Planner), each with a small picture on the left and a summary of one paragraph or less. A filter bar of toggle buttons (All, Work, Life, one per category) keeps nine categories from
// becoming one long scroll. Broken feeds are named in a small note. /demo uses sample headlines.
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let data = null;
  let filter = "All";
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function load() {
    if (Demo.on) { data = (await Demo.data()).news(new Date()); render(); return; }
    let key = "";
    try { key = localStorage.getItem("dashKey") || ""; } catch { /* storage blocked */ }
    let res = null, body = null;
    try { res = await fetch("/api/news", { headers: key ? { "x-dash-key": key } : {} }); } catch { /* offline */ }
    try { body = await res?.json(); } catch { /* not JSON */ }
    const msg = !res ? "Couldn't reach the news feeds (offline or blocked)."
      : res.status === 401 ? (key ? "Your dashboard key wasn't accepted. Open the Planner to enter it again." : "Open the Planner once and enter your dashboard key so Cortex can load the news.")
      : res.status === 404 ? "The news route isn't deployed yet."
      : !res.ok || !body ? `News unavailable: ${body?.error || `error ${res.status}`}.` : "";
    if (msg) { $("news-status").textContent = msg; $("news-sections").innerHTML = ""; $("news-filters").innerHTML = ""; return; }
    data = body;
    render();
  }

  // The source's initials, shown when a headline has no picture or its picture fails to load.
  const initials = (src) => (src.match(/[A-Za-z0-9]+/g) || ["?"]).filter((w) => !/^(the|a|of|and)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const fallback = (src) => `<span class="news-fallback">${esc(initials(src))}</span>`;
  // Pictures are decoration next to the headline (alt=""), so a screen reader reads the title, summary and source only.
  function item(i) {
    const thumb = i.image
      ? `<img src="${esc(i.image)}" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-source="${esc(i.source)}">`
      : fallback(i.source);
    return `<li class="news-item">
      <span class="news-thumb" aria-hidden="true">${thumb}</span>
      <div class="news-body">
        <a class="news-title" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}<span class="visually-hidden"> (opens in a new tab)</span></a>
        ${i.summary ? `<p class="news-summary">${esc(i.summary)}</p>` : ""}
        <span class="news-meta">${esc(i.source)} · ${esc(Brain.ago(i.publishedAt))}</span>
      </div>
    </li>`;
  }
  // A picture that fails to load (blocked, moved, hotlink-protected) becomes the initials tile.
  $("news-sections").addEventListener("error", (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.closest(".news-thumb")) img.outerHTML = fallback(img.dataset.source || "");
  }, true);

  function chips() {
    const options = ["All", "Work", "Life", ...data.categories.map((c) => c.name)];
    $("news-filters").innerHTML = options.map((o) => `<button type="button" class="chip" aria-pressed="${o === filter}" data-filter="${esc(o)}">${esc(o)}</button>`).join("");
  }

  function render() {
    chips();
    const shown = data.categories.filter((c) => filter === "All" || filter === c.group || filter === c.name);
    const failed = data.failed.length ? ` ${data.failed.length} ${data.failed.length === 1 ? "feed" : "feeds"} unavailable: ${data.failed.map((f) => `${f.feed} (${f.category})`).join(", ")}.` : "";
    $("news-status").textContent = `Updated ${Brain.ago(data.generatedAt)}.${failed}`;
    $("news-sections").innerHTML = shown.map((c) => {
      const items = data.items.filter((i) => i.category === c.name);
      const id = `h-news-${slug(c.name)}`;
      return `<section class="panel news-section" aria-labelledby="${id}">
        <h2 class="panel-title" id="${id}">${esc(c.name)} <span class="code">${esc(c.group)}</span></h2>
        ${items.length ? `<ul class="news-list">${items.map(item).join("")}</ul>` : '<p class="panel-note">No headlines from this category right now.</p>'}
      </section>`;
    }).join("");
  }

  $("news-filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-filter]");
    if (!b || !data) return;
    filter = b.dataset.filter;
    render();
    $("news-filters").querySelector(`[data-filter="${CSS.escape(filter)}"]`)?.focus();
  });

  let started = false;
  Brain.boot({ onUpdate(state) { if (state.auth === "in" && !started) { started = true; load(); setInterval(load, 30 * 60000); } } });
})();
