// How Vercel answers a path for this static site, from vercel.json alone: redirects, then files (with cleanUrls a
// page is only served at its clean path, and "/x.html" is redirected away), then rewrites, whose destination is
// looked up by the same file rules. Used by test/routes.test.js; it models only the vercel.json features this repo uses.
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

/** Turns a vercel.json source like "/demo/:tab(a|b)" or "/demo/:path*" into a matcher returning its params. */
function matcher(source) {
  const names = [];
  const rx = source.replace(/:(\w+)(\([^)]*\))?(\*)?/g, (_, name, group, star) => {
    names.push(name);
    return star ? "(.*)" : group || "([^/]+)";
  });
  const re = new RegExp(`^${rx}$`);
  return (p) => {
    const m = p.match(re);
    return m ? Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) : null;
  };
}

/**
 * @param {string} root the deployed folder
 * @returns {(url: string) => { status: number, file?: string, location?: string, headers: Record<string, string> }}
 */
export function router(root) {
  const cfg = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
  const isFile = (rel) => { const f = path.join(root, rel); return existsSync(f) && statSync(f).isFile(); };
  // The file a path serves, or "redirect" for an .html path under cleanUrls, or null.
  function file(p) {
    if (cfg.cleanUrls && p.endsWith(".html")) return isFile(p) ? "redirect" : null;
    if (p === "/") return isFile("index.html") ? "index.html" : null;
    const rel = p.slice(1);
    if (!rel.endsWith(".html") && isFile(rel)) return rel;
    if (cfg.cleanUrls && isFile(`${rel}.html`)) return `${rel}.html`;
    return null;
  }
  return (url) => {
    const u = new URL(url, "http://x");
    const p = u.pathname;
    const headers = {};
    for (const h of cfg.headers || []) if (matcher(h.source)(p)) for (const { key, value } of h.headers) headers[key] = value;
    for (const r of cfg.redirects || []) {
      if (matcher(r.source)(p) && (r.has || []).every((h) => h.type !== "query" || u.searchParams.has(h.key))) {
        return { status: r.permanent ? 308 : 307, location: r.destination, headers };
      }
    }
    let hit = file(p);
    if (hit === "redirect") return { status: 308, location: p.replace(/(index)?\.html$/, ""), headers };
    if (!hit) {
      for (const r of cfg.rewrites || []) {
        const params = matcher(r.source)(p);
        if (!params) continue;
        const dest = r.destination.replace(/:(\w+)/g, (_, n) => params[n]);
        hit = file(dest);
        // A rewrite to "/x.html" under cleanUrls finds no file: Vercel answers 404.
        if (hit === "redirect") hit = null;
        break;
      }
    }
    return hit ? { status: 200, file: hit, headers } : { status: 404, headers };
  };
}
