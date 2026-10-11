// Shared Cortex top bar for every page, so the dashboard and planner headers can't drift apart.
// Each page has <header class="topbar" data-page="dashboard|planner"></header>; this fills it in
// and runs the phone menu. Pages set the status light with CortexHeader.setStatus().
const CortexHeader = (() => {
  const PAGES = [["dashboard", "index.html", "Dashboard"], ["planner", "planner.html", "Planner"]];
  const topbar = document.querySelector(".topbar");
  const page = topbar.dataset.page;

  topbar.innerHTML = `
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" class="bm-outer"/>
        <circle cx="24" cy="24" r="14" class="bm-mid"/>
        <circle cx="24" cy="24" r="6" class="bm-core"/>
      </svg>
      <div>
        <p class="brand-name">Cortex</p>
        <p class="brand-sub">Second Brain Command</p>
      </div>
    </div>
    <nav class="views" aria-label="Views">
      <ul>${PAGES.map(([id, href, label]) => `<li><a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a></li>`).join("")}</ul>
    </nav>
    <p class="sys-status" id="sys-status" role="status"><span class="dot" aria-hidden="true"></span><span class="label">Standby</span></p>
    <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="top-actions" aria-label="Menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <div class="top-actions" id="top-actions">
      <p class="menu-status" id="menu-status" aria-hidden="true">Status: Standby</p>
      <button type="button" class="btn btn-ghost" id="btn-demo" aria-pressed="false">Preview</button>
      <button type="button" class="btn btn-primary" id="btn-auth">Link Drive</button>
    </div>`;

  const status = topbar.querySelector("#sys-status");
  const menuBtn = topbar.querySelector("#menu-btn");
  const actions = topbar.querySelector("#top-actions");

  function setStatus(state, label) {
    status.dataset.state = state;
    status.querySelector(".label").textContent = label;
    topbar.querySelector("#menu-status").textContent = `Status: ${label}`;
  }

  // ---------- Phone menu ----------
  function setMenu(open, { focus = false } = {}) {
    topbar.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) actions.querySelector("button:not([hidden])")?.focus();
    else if (focus) menuBtn.focus();
  }
  menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && topbar.classList.contains("menu-open")) setMenu(false, { focus: true });
  });
  document.addEventListener("click", (e) => {
    if (topbar.classList.contains("menu-open") && !topbar.contains(e.target)) setMenu(false);
  });
  actions.addEventListener("click", (e) => { if (e.target.closest("button")) setMenu(false, { focus: true }); });
  actions.addEventListener("focusout", (e) => {
    if (topbar.classList.contains("menu-open") && e.relatedTarget && !topbar.contains(e.relatedTarget)) setMenu(false);
  });

  return { setStatus };
})();
