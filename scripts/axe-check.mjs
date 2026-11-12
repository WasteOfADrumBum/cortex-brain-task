// Accessibility check: serves this folder the way Vercel does (test/routes.js reads vercel.json), opens every
// /demo tab in Chromium and runs axe-core with the WCAG 2.0-2.2 A and AA rules. The demo uses sample data and
// needs no sign-in, so it covers every tab's real markup. Exits 1 on any violation or any script error on a page.
// Usage: npm run check:a11y   (CI installs Chromium with `npx playwright install --with-deps chromium`)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { router } from "../test/routes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = router(root);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer((req, res) => {
  const hit = route(req.url);
  if (hit.location) { res.writeHead(hit.status, { location: hit.location, ...hit.headers }); return res.end(); }
  if (!hit.file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(hit.file)] || "application/octet-stream", ...hit.headers });
  res.end(readFileSync(path.join(root, hit.file)));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const axeSource = readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8");

const pages = ["/demo", ...["planner", "finances", "news", "vault", "ops"].map((t) => `/demo/${t}`)];
const browser = await chromium.launch();
let failed = 0;
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    /** @type {string[]} */
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const p of pages) {
      errors.length = 0;
      await page.goto(base + p, { waitUntil: "networkidle" });
      await page.addScriptTag({ content: axeSource });
      const { violations } = await page.evaluate(() =>
        // @ts-ignore axe is injected above
        window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
      const label = `${p} at ${viewport.width}px`;
      // A script error can leave a tab half drawn and still pass axe, so it fails the check too.
      if (errors.length) { failed += errors.length; console.log(`FAIL ${label}: script error: ${errors.join("; ")}`); }
      if (!violations.length) { if (!errors.length) console.log(`ok   ${label}`); continue; }
      failed += violations.length;
      console.log(`FAIL ${label}`);
      for (const v of violations) console.log(`  ${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
