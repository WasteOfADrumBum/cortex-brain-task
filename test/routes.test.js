// Every public route, real and demo, answers 200 with the right page under the vercel.json rules. Run with `npm test`.
// To check a deployed copy instead, run `npm run check:routes -- <url>`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { router } from "./routes.js";

const route = router(fileURLToPath(new URL("../", import.meta.url)));
const TABS = ["planner", "finances", "news", "vault", "ops"];

test("real routes serve their pages", () => {
  assert.equal(route("/").file, "index.html");
  for (const t of TABS) assert.equal(route(`/${t}`).file, `${t}.html`, `/${t}`);
});

test("every /demo route serves the same page as the real tab, with noindex", () => {
  for (const [p, page] of [["/demo", "index.html"], ...TABS.map((t) => [`/demo/${t}`, `${t}.html`])]) {
    const r = route(p);
    assert.equal(r.status, 200, `${p} answers ${r.status}`);
    assert.equal(r.file, page, `${p} serves ${r.file}`);
    assert.equal(r.headers["X-Robots-Tag"], "noindex", `${p} lacks noindex`);
  }
});

test("/?demo=1 redirects to /demo, and unknown demo tabs stay 404", () => {
  assert.deepEqual([route("/?demo=1").status, route("/?demo=1").location], [307, "/demo"]);
  assert.equal(route("/demo/nope").status, 404);
});

test("the router itself: a rewrite to an .html path finds nothing under cleanUrls", () => {
  // Guards the model this test relies on: the bug that took /demo down in production must still read as a 404.
  assert.equal(route("/index.html").status, 308);
});
