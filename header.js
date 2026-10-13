// Shared Cortex top bar for every page, so the tab headers can't drift apart.
// Each page has <header class="topbar" data-page="home|planner|finances|news|vault|ops"></header>;
// this fills it in and runs the compact menu (tabs and actions collapse into it on narrow screens).
// Pages set the status light with CortexHeader.setStatus().
const CortexHeader = (() => {
  // Clean URLs (vercel.json cleanUrls) so every tab is linkable and the back button works.
  const TABS = [
    ["home", "/", "Home"],
    ["planner", "/planner", "Planner"],
    ["finances", "/finances", "Finances"],
    ["news", "/news", "News"],
    ["vault", "/vault", "Vault"],
    ["ops", "/ops", "Ops"],
  ];
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
    <p class="sys-status" id="sys-status" role="status"><span class="dot" aria-hidden="true"></span><span class="label">Standby</span></p>
    <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="top-menu" aria-label="Menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <div class="top-menu" id="top-menu">
      <nav class="views" aria-label="Tabs">
        <ul>${TABS.map(([id, href, label]) => `<li><a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a></li>`).join("")}</ul>
      </nav>
      <div class="top-actions">
        <p class="menu-status" id="menu-status" aria-hidden="true">Status: Standby</p>
        <button type="button" class="btn btn-ghost" id="btn-demo" aria-pressed="false">Preview</button>
        <button type="button" class="btn btn-primary" id="btn-auth">Link Drive</button>
      </div>
    </div>`;

  const status = topbar.querySelector("#sys-status");
  const menuBtn = topbar.querySelector("#menu-btn");
  const menu = topbar.querySelector("#top-menu");

  function setStatus(state, label) {
    status.dataset.state = state;
    status.querySelector(".label").textContent = label;
    topbar.querySelector("#menu-status").textContent = `Status: ${label}`;
  }

  // ---------- Compact menu ----------
  const isOpen = () => topbar.classList.contains("menu-open");
  function setMenu(open, { focus = false } = {}) {
    topbar.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) (menu.querySelector('[aria-current="page"]') || menu.querySelector("a, button:not([hidden])"))?.focus();
    else if (focus) menuBtn.focus();
  }
  menuBtn.addEventListener("click", () => setMenu(!isOpen()));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) setMenu(false, { focus: true });
  });
  document.addEventListener("click", (e) => {
    if (isOpen() && !topbar.contains(e.target)) setMenu(false);
  });
  menu.addEventListener("click", (e) => { if (e.target.closest(".top-actions button")) setMenu(false, { focus: true }); });
  menu.addEventListener("focusout", (e) => {
    if (isOpen() && e.relatedTarget && !topbar.contains(e.relatedTarget)) setMenu(false);
  });

  return { setStatus };
})();
