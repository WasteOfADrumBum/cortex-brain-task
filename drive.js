// Google Drive access (read-only) via Google Identity Services.
const Drive = (() => {
  const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  const API = "https://www.googleapis.com/drive/v3";
  const FIELDS = "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)";
  const FOLDER = "application/vnd.google-apps.folder";

  let tokenClient = null;
  let token = null;
  let expiresAt = 0;
  let onChange = () => {};

  function configured() {
    return Boolean((window.CORTEX_CONFIG.googleClientId || "").trim());
  }

  function waitForGis(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        if (window.google?.accounts?.oauth2) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("Google sign-in did not load. Check your connection or content blockers."));
        setTimeout(check, 150);
      })();
    });
  }

  async function init(changeHandler) {
    onChange = changeHandler;
    if (!configured()) return "unconfigured";
    await waitForGis();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.CORTEX_CONFIG.googleClientId.trim(),
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { token = null; onChange("error", resp.error_description || resp.error); return; }
        token = resp.access_token;
        expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
        onChange("linked");
      },
      error_callback: (err) => onChange("error", err?.message || "Sign-in was closed before it finished."),
    });
    return "ready";
  }

  function signIn() {
    if (!tokenClient) return;
    tokenClient.requestAccessToken({ prompt: token ? "" : "consent" });
  }

  function signOut() {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
    token = null;
    onChange("signed-out");
  }

  const linked = () => Boolean(token) && Date.now() < expiresAt - 30000;

  async function request(url, asText = false) {
    if (!linked()) { token = null; onChange("expired"); throw new Error("Drive session expired. Link Drive again."); }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { token = null; onChange("expired"); throw new Error("Drive session expired. Link Drive again."); }
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

  return { init, signIn, signOut, linked, loadBrain, searchContent, readFile, configured };
})();
