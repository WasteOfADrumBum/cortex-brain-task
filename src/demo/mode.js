// @ts-check
// Demo mode for the portfolio: /demo and /demo/<tab> serve the real pages (vercel.json rewrites) and this file
// switches them to sample data. Loaded on every page right after config.js; on real pages it does nothing.
// In the demo it:
//   - replaces the personal parts of config.js (name, quick links, weather place, routines, Drive and Spotify ids),
//   - adds the "Demo with sample data" banner and a "Demo only" message for anything marked data-write,
//   - keeps tab links inside /demo,
//   - loads the sample data (src/demo/index.js) on request with Demo.data().
const Demo = (() => {
  const on = /^\/demo(\/|$)/.test(location.pathname);

  // Tab routes that have a /demo twin: "/", "/planner", "/finances", "/news", "/vault", "/ops" (plus ?query or #hash).
  const TAB = /^\/(?:planner|finances|news|vault|ops)?(?=$|[?#])/;
  /** "/planner#day" -> "/demo/planner#day" in the demo; unchanged otherwise. @param {string} href */
  const path = (href) => (on && TAB.test(href) ? `/demo${href.replace(/^\/(?=$|[?#])/, "")}` : href);

  /** @type {Promise<import("../types").DemoData> | null} */
  let loading = null;
  /** The sample data. Only ever loaded on /demo pages. */
  const data = () => (loading ||= import("/src/demo/index.js").then((m) => m.default));

  if (!on) return { on, path, data, only: () => {} };

  // ---------- Made-up profile in place of config.js's personal values ----------
  /** @type {import("../types").DemoProfile} */
  const profile = {
    userName: "Alex",
    spotifyPlaylistUrl: "",
    weather: { name: "Sample City", lat: 39.5, lon: -98.35, units: "fahrenheit" },
    launchers: [
      { label: "Drive", code: "DR", url: "https://drive.google.com/" },
      { label: "Gmail", code: "GM", url: "https://mail.google.com/" },
      { label: "Calendar", code: "CA", url: "https://calendar.google.com/" },
      { label: "Todoist", code: "TD", url: "https://todoist.com/" },
      { label: "GitHub", code: "GH", url: "https://github.com/" },
      { label: "Claude", code: "CL", url: "https://claude.ai/" },
    ],
    schedule: [
      { label: "Weekly brain sweep", who: "Claude", day: 1, time: "08:00" },
      { label: "Sweep health check", who: "Muse", day: 6, time: "10:00" },
    ],
  };
  // No Google client or folder id: the demo never talks to Drive.
  Object.assign(window.CORTEX_CONFIG, profile, { googleClientId: "", brainFolderId: "" });
  document.documentElement.classList.add("is-demo");

  // ---------- Banner and "Demo only" message ----------
  const bar = document.createElement("aside");
  bar.className = "demo-bar";
  bar.setAttribute("aria-label", "Demo notice");
  bar.innerHTML = `<p class="demo-banner" role="status"><span class="demo-tag" aria-hidden="true">Demo</span>Demo with sample data. Nothing here is real.</p>
    <p class="demo-toast" id="demo-toast" role="status"></p>`;
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.after(bar); else document.body.prepend(bar);
  const toast = /** @type {HTMLElement} */ (bar.querySelector("#demo-toast"));
  let hideTimer = 0;
  /** Shows the "Demo only" message for an action the demo doesn't do. @param {string} [what] */
  function only(what) {
    toast.textContent = `Demo only. ${what ? `${what} is` : "Changes are"} turned off in the demo, so nothing is saved.`;
    toast.classList.add("is-on");
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { toast.classList.remove("is-on"); toast.textContent = ""; }, 6000);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && toast.textContent) { toast.classList.remove("is-on"); toast.textContent = ""; } });

  // Anything that would change data carries data-write="<what it does>". In the demo it shows the message instead.
  // Capture phase, so the page's own handlers never run.
  document.addEventListener("click", (e) => {
    const el = /** @type {Element} */ (e.target).closest?.("[data-write]");
    if (!el || el.tagName === "FORM") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    only(/** @type {HTMLElement} */ (el).dataset.write);
  }, true);
  document.addEventListener("submit", (e) => {
    const form = /** @type {HTMLFormElement} */ (e.target);
    if (!form.matches("[data-write]")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    only(form.dataset.write);
  }, true);

  // ---------- Keep tab links inside /demo ----------
  /** @param {ParentNode} root */
  function fixLinks(root) {
    root.querySelectorAll("a[href^='/']").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/demo")) a.setAttribute("href", path(href));
    });
  }
  fixLinks(document);
  // Links that would change something (like "Edit quick links") go nowhere in the demo; clicking shows the message.
  document.querySelectorAll("a[data-write]").forEach((a) => a.setAttribute("href", "#demo-only"));
  new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach((n) => { if (n instanceof Element) { if (n.matches("a[href^='/']")) fixLinks(/** @type {ParentNode} */ (n.parentNode)); else fixLinks(n); } });
  }).observe(document.body, { childList: true, subtree: true });

  return { on, path, data, only };
})();
