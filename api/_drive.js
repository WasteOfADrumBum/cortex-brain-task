// Server-side Google Drive access for Cortex's own files, with the drive.file scope (Cortex sees only files it
// created). Used by the finance routes. Files starting with "_" are not Vercel functions.
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (an OAuth "Web application" client) and GOOGLE_REFRESH_TOKEN
// (made once with scripts/get-refresh-token.mjs). Nothing here is cached between instances except folder ids.

export class DriveError extends Error {}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

export const driveConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

/** @type {{ token: string, until: number } | null} */
let access = null;
async function token() {
  if (access && Date.now() < access.until) return access.token;
  if (!driveConfigured()) throw new DriveError('Drive saving is not set up yet (GOOGLE_REFRESH_TOKEN is missing in Vercel)');
  let res;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: /** @type {string} */ (process.env.GOOGLE_CLIENT_ID),
        client_secret: /** @type {string} */ (process.env.GOOGLE_CLIENT_SECRET),
        refresh_token: /** @type {string} */ (process.env.GOOGLE_REFRESH_TOKEN),
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    throw new DriveError('Could not reach Google');
  }
  if (!res.ok) throw new DriveError(`Google refused the Drive token (${res.status}); make a new GOOGLE_REFRESH_TOKEN`);
  const body = await res.json();
  access = { token: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
  return access.token;
}

/** fetch with the Drive token; throws DriveError on failure. */
async function call(/** @type {string} */ url, /** @type {RequestInit} */ init = {}) {
  const t = await token();
  let res;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${t}` } });
  } catch {
    throw new DriveError('Could not reach Google Drive');
  }
  if (!res.ok) throw new DriveError(`Google Drive returned ${res.status}`);
  return res;
}

const q = (/** @type {string} */ s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Files directly inside a folder whose names match `contains` (all when omitted). @returns {Promise<{ id: string, name: string }[]>} */
export async function list(/** @type {string} */ parent, /** @type {string} */ contains = '') {
  const query = `'${q(parent)}' in parents and trashed=false${contains ? ` and name contains '${q(contains)}'` : ''}`;
  const res = await call(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=200`);
  return (await res.json()).files;
}

/** @type {Map<string, string>} */
const folders = new Map();
/** The id of /a/b/c, creating any folder that doesn't exist yet. */
export async function folder(/** @type {string[]} */ path) {
  const key = path.join('/');
  if (folders.has(key)) return /** @type {string} */ (folders.get(key));
  let parent = 'root';
  for (const name of path) {
    const found = (await list(parent, name)).find((f) => f.name === name);
    if (found) { parent = found.id; continue; }
    const res = await call(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
    });
    parent = (await res.json()).id;
  }
  folders.set(key, parent);
  return parent;
}

/** A file's text, or null when the folder has no file of that name. */
export async function readText(/** @type {string} */ parent, /** @type {string} */ name) {
  const file = (await list(parent, name)).find((f) => f.name === name);
  if (!file) return null;
  return (await call(`${API}/files/${file.id}?alt=media`)).text();
}

/** Creates or replaces a file's whole content. */
export async function writeText(/** @type {string} */ parent, /** @type {string} */ name, /** @type {string} */ text, mime = 'application/json') {
  const file = (await list(parent, name)).find((f) => f.name === name);
  if (file) {
    await call(`${UPLOAD}/files/${file.id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': mime }, body: text });
    return;
  }
  const boundary = `cortex${Math.random().toString(36).slice(2)}`;
  const body = `--${boundary}\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ name, parents: [parent], mimeType: mime })}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n${text}\r\n--${boundary}--`;
  await call(`${UPLOAD}/files?uploadType=multipart`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
}
