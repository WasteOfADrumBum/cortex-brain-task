// Google Drive access (read-only). Sign-in sends the whole page to Google and back (OAuth 2.0 for client-side web
// apps, response_type=token), instead of a popup: Google's popup could finish without ever handing the token back
// to the page, which left Cortex on the sign-in screen with no message.
const Drive = (() => {
  const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  const API = "https://www.googleapis.com/drive/v3";
  const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
  const FIELDS = "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)";
  const FOLDER = "application/vnd.google-apps.folder";

  // The access token is kept in this browser until it expires (about an hour) so a reload
  // doesn't drop the link. It is read-only and never leaves this origin except to Google.
  const SESSION_KEY = "cortex.drive.session";
  const LINKED_KEY = "cortex.drive.linked";
  // The sign-in in flight: a random state value and the page to return to. Kept for this tab only.
  const PENDING_KEY = "cortex.drive.pending";

  let token = null;
  let expiresAt = 0;
  let lastError = "";
  let onChange = () => {};

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };
  const tab = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };
  function saveSession() {
    store.set(SESSION_KEY, JSON.stringify({ token, expiresAt }));
    store.set(LINKED_KEY, "1");
  }
  function restoreSession() {
    try {
      const s = JSON.parse(store.get(SESSION_KEY) || "null");
      if (s?.token && Date.now() < s.expiresAt - 60000) { token = s.token; expiresAt = s.expiresAt; return true; }
    } catch { /* corrupt entry */ }
    store.del(SESSION_KEY);
    return false;
  }
  function dropToken() {
    token = null;
    store.del(SESSION_KEY);
  }

  function configured() {
    return Boolean((window.CORTEX_CONFIG.googleClientId || "").trim());
  }
  // Google sends the page back here. It must be listed under the client's Authorized redirect URIs.
  const redirectUri = () => `${location.origin}/`;

  // Google's error codes in plain words. Anything else is shown as Google sent it.
  const ERRORS = {
    access_denied: "Sign-in was cancelled, or Google didn't allow it. Try again and choose Continue on each Google screen.",
    redirect_uri_mismatch: "Google doesn't know this address yet. Add it to the client's Authorized redirect URIs (see README).",
    invalid_client: "Google doesn't recognise the client ID in config.js.",
    unauthorized_client: "This Google client can't sign in from the browser. Check that it is a Web application client.",
  };

  /**
   * Reads Google's answer from the address after a sign-in. Pure: no storage, no page changes.
   * @param {string} hash location.hash, with or without the leading #
   * @param {{state: string, path: string} | null} pending what signIn stored for this tab
   * @param {number} now Date.now()
   * @returns {null | {error: string} | {token: string, expiresAt: number, path: string}}
   */
  function readReturn(hash, pending, now) {
    const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    if (!p.has("access_token") && !p.has("error")) return null;
    if (!pending || !pending.state || p.get("state") !== pending.state) {
      return { error: "That sign-in didn't start from this tab, so Cortex ignored it. Sign in again." };
    }
    if (p.has("error")) return { error: ERRORS[p.get("error")] || `Google said: ${p.get("error")}` };
    const scopes = (p.get("scope") || "").split(" ");
    if (!scopes.includes(SCOPE)) {
      return { error: "Google didn't give Cortex read access to Drive. Sign in again and allow Drive access." };
    }
    return {
      token: p.get("access_token"),
      expiresAt: now + (Number(p.get("expires_in")) || 3600) * 1000,
      path: pending.path && pending.path.startsWith("/") && !pending.path.startsWith("//") ? pending.path : "/",
    };
  }

  // Runs as soon as this script loads, so pages see the new session on first paint.
  // The token is taken out of the address straight away so it isn't left in history or bookmarks.
  (function finishSignIn() {
    let pending = null;
    try { pending = JSON.parse(tab.get(PENDING_KEY) || "null"); } catch { /* corrupt entry */ }
    const r = readReturn(location.hash, pending, Date.now());
    if (!r) return;
    tab.del(PENDING_KEY);
    history.replaceState(null, "", location.pathname + location.search);
    if ("error" in r) { lastError = r.error; return; }
    token = r.token;
    expiresAt = r.expiresAt;
    saveSession();
    if (r.path !== location.pathname + location.search) location.replace(r.path);
  })();

  async function init(changeHandler) {
    onChange = changeHandler;
    if (!configured()) return "unconfigured";
    if (lastError) return "error";
    if (restoreSession()) return "linked";
    return store.get(LINKED_KEY) ? "expired" : "ready";
  }

  function signIn() {
    if (!configured()) return;
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (!tab.set(PENDING_KEY, JSON.stringify({ state, path: location.pathname + location.search }))) {
      lastError = "This browser is blocking site storage, which sign-in needs. Allow it for this site and try again.";
      onChange("error", lastError);
      return;
    }
    const params = new URLSearchParams({
      client_id: window.CORTEX_CONFIG.googleClientId.trim(),
      redirect_uri: redirectUri(),
      response_type: "token",
      scope: SCOPE,
      include_granted_scopes: "true",
      state,
    });
    // After the first consent, skip the consent screen and just confirm the account.
    if (!store.get(LINKED_KEY)) params.set("prompt", "consent");
    location.assign(`${AUTH}?${params}`);
  }

  function signOut() {
    if (token) {
      // Tell Google to forget this token. Fire and forget: the page signs out either way.
      fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      }).catch(() => {});
    }
    dropToken();
    store.del(LINKED_KEY);
    onChange("signed-out");
  }

  const linked = () => Boolean(token) && Date.now() < expiresAt - 30000;
  // True when this browser holds an unexpired session, without waiting for Google sign-in to load.
  // Pages use it to pick the sign-in screen or the app on first paint.
  const hasSession = () => linked() || restoreSession();

  async function request(url, asText = false) {
    if (!linked()) { dropToken(); onChange("expired"); throw new Error("Drive session expired. Link Drive again."); }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { dropToken(); onChange("expired"); throw new Error("Drive session expired. Link Drive again."); }
    if (!res.ok) throw new Error(`Drive returned ${res.status}.`);
    return asText ? res.text() : res.json();
  }

  async function list(q) {
    const out = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({ q, fields: FIELDS, pageSize: "200", orderBy: "modifiedTime desc", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await request(`${API}/files?${params}`);
      out.push(...data.files);
      pageToken = data.nextPageToken || "";
    } while (pageToken && out.length < 2000);
    return out;
  }

  const quote = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  // Walks the brain folder (3 levels deep) and returns { files, folders }.
  async function loadBrain(rootId) {
    const folders = [{ id: rootId, name: "Second Brain", path: "" }];
    const files = [];
    let level = [folders[0]];
    for (let depth = 0; depth < 3 && level.length; depth++) {
      const next = [];
      // Query up to 20 parents at a time.
      for (let i = 0; i < level.length; i += 20) {
        const chunk = level.slice(i, i + 20);
        const parentQ = chunk.map((f) => `'${quote(f.id)}' in parents`).join(" or ");
        const items = await list(`(${parentQ}) and trashed = false`);
        for (const item of items) {
          const parent = chunk.find((f) => item.parents?.includes(f.id)) || chunk[0];
          // Full path of the parent folder below the brain root ("" for the root itself).
          const path = parent.path ? `${parent.path}/${parent.name}` : (parent.id === rootId ? "" : parent.name);
          if (item.mimeType === FOLDER) {
            const folder = { id: item.id, name: item.name, path };
            folders.push(folder);
            next.push(folder);
          } else {
            files.push({ ...item, folder: path });
          }
        }
      }
      level = next;
    }
    return { files, folders };
  }

  // Account storage (all of Drive, Gmail and Photos). about.get works with drive.readonly.
  async function storage() {
    const { storageQuota: q } = await request(`${API}/about?fields=storageQuota`);
    return { used: Number(q.usage) || 0, limit: q.limit ? Number(q.limit) : null, trash: Number(q.usageInDriveTrash) || 0 };
  }

  async function searchContent(text, folderIds) {
    const parents = folderIds.slice(0, 40).map((id) => `'${quote(id)}' in parents`).join(" or ");
    return list(`fullText contains '${quote(text)}' and trashed = false and (${parents})`);
  }

  async function readFile(file) {
    if (file.mimeType === "application/vnd.google-apps.document") {
      return request(`${API}/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`, true);
    }
    const textual = /^text\//.test(file.mimeType) || /\.(md|markdown|txt|json|csv)$/i.test(file.name) || file.mimeType === "application/json";
    if (!textual) return null;
    return request(`${API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, true);
  }

  // Morning briefings: the Markdown files the Claude routine writes to /Cortex/briefings (docs/briefing-routine.md).
  // Finds a "briefings" folder whose parent is named "Cortex" and returns its .md files, newest name first, with
  // the folder's link. Returns { files: [], folder: null } when there is no such folder yet.
  async function briefings() {
    const dirs = await list(`name = 'briefings' and mimeType = '${FOLDER}' and trashed = false`);
    for (const d of dirs) {
      const parents = d.parents || [];
      for (const p of parents) {
        const parent = await request(`${API}/files/${encodeURIComponent(p)}?fields=name&supportsAllDrives=true`);
        if (parent.name !== "Cortex") continue;
        const files = (await list(`'${quote(d.id)}' in parents and trashed = false and name contains '.md'`))
          .sort((a, b) => b.name.localeCompare(a.name));
        return { files, folder: d };
      }
    }
    return { files: [], folder: null };
  }

  return { init, signIn, signOut, linked, hasSession, readReturn, error: () => lastError, loadBrain, storage, searchContent, readFile, briefings, configured };
})();
