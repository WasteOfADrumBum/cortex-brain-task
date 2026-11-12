// One-time setup for saving finances to Drive and for approved Calendar changes: prints a Google refresh token with
// two scopes, drive.file (Cortex can see and change only files it creates) and calendar.events (read and change
// events, used only when you approve a proposal). Run it on your own computer, never on a server:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs
// The client must be an OAuth "Web application" client with http://localhost:53682 as an authorized redirect URI.
// Then put GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and the printed GOOGLE_REFRESH_TOKEN in Vercel. Treat the
// refresh token like a password: don't paste it anywhere else.
import { createServer } from "node:http";

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first."); process.exit(2); }
const redirect = "http://localhost:53682";
const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
auth.search = new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
  scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events",
}).toString();

const server = createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get("code");
  if (!code) { res.end("No code in the address. Close this tab and run the script again."); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const body = await r.json();
  res.end(body.refresh_token ? "Done. Go back to the terminal." : "Google did not return a refresh token. See the terminal.");
  if (body.refresh_token) console.log(`\nGOOGLE_REFRESH_TOKEN=${body.refresh_token}\n`);
  else console.error("No refresh token:", body.error || body);
  server.close();
});
server.listen(53682, () => console.log(`Open this address, sign in with the Google account that owns the Drive, and allow access:\n\n${auth}\n`));
