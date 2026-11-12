// Fetches every feed in config/news-feeds.json and prints how many headlines each gives. Informational: CI runs it
// so a feed that moved or died shows up in the log; it never fails the build. Usage: npm run check:feeds
import { readFileSync } from "node:fs";
import { parseFeed } from "../src/news-lib.js";

const config = JSON.parse(readFileSync(new URL("../config/news-feeds.json", import.meta.url), "utf8"));
let bad = 0;
for (const c of config.categories) {
  for (const feed of c.feeds) {
    let line;
    try {
      const res = await fetch(feed, { headers: { "user-agent": "cortex-news/1.0" }, signal: AbortSignal.timeout(10000) });
      const items = res.ok ? parseFeed(await res.text(), { category: c.name, group: c.group, feed }) : [];
      line = items.length ? `ok   ${items.length} headlines, newest ${items[0].publishedAt.slice(0, 10)}: ${feed}` : `FAIL HTTP ${res.status}, no headlines: ${feed}`;
      if (!items.length) bad++;
    } catch (e) {
      bad++;
      line = `FAIL ${e.name}: ${feed}`;
    }
    console.log(line);
  }
}
console.log(bad ? `${bad} feed(s) gave no headlines.` : "Every feed works.");
