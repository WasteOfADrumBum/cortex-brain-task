// Checks a deployed Cortex: every real and demo route must answer 200 (redirects are not followed), and demo
// routes must carry noindex. Usage: npm run check:routes -- https://<deployment>   Exits 1 on any failure.
const base = process.argv[2]?.replace(/\/$/, "");
if (!base) { console.error("Usage: npm run check:routes -- <base url>"); process.exit(2); }
const TABS = ["planner", "finances", "news", "vault", "ops"];
const paths = ["/", ...TABS.map((t) => `/${t}`), "/demo", ...TABS.map((t) => `/demo/${t}`)];
let failed = 0;
for (const p of paths) {
  const res = await fetch(base + p, { redirect: "manual" });
  const robots = res.headers.get("x-robots-tag") || "";
  const ok = res.status === 200 && (!p.startsWith("/demo") || robots.includes("noindex"));
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${p}${p.startsWith("/demo") ? ` (X-Robots-Tag: ${robots || "none"})` : ""}`);
}
process.exit(failed ? 1 : 0);
