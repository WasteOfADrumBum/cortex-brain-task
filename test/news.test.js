// News: RSS and Atom parsing, merging, and /api/news with one working and one broken feed (mocked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, merge, text, image, summary, clip, pageMeta } from "../src/news-lib.js";
import demo from "../src/demo/index.js";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Sample &amp; Co</title><atom:link href="https://x.test/feed" rel="self"/>
  <item><title><![CDATA[Ship <b>faster</b> &#8211; today]]></title><link>https://x.test/a?utm=1</link><pubDate>Tue, 10 Nov 2026 09:00:00 GMT</pubDate></item>
  <item><title>No date</title><link>https://x.test/b</link></item>
  <item><title>Guid link</title><guid isPermaLink="true">https://x.test/c</guid><pubDate>Wed, 11 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title type="html">Atom Blog</title><link href="https://y.test/" rel="alternate"/>
  <entry><title>Entry one</title><link rel="replies" href="https://y.test/1#c"/><link rel="alternate" href="https://y.test/1"/><updated>2026-11-09T08:00:00Z</updated></entry>
  <entry><title>Entry two</title><link href="https://y.test/2"/><published>2026-11-11T08:00:00Z</published></entry>
</feed>`;
const where = (feed) => ({ category: "Cat", group: "Work", feed });

test("RSS: CDATA, tags and entities are cleaned; items without a date are skipped; newest first", () => {
  const items = parseFeed(RSS, where("https://x.test/feed"));
  assert.deepEqual(items.map((i) => i.title), ["Guid link", "Ship faster – today"]);
  assert.equal(items[1].source, "Sample & Co");
  assert.equal(items[0].url, "https://x.test/c");
  assert.equal(items[1].publishedAt, "2026-11-10T09:00:00.000Z");
});

test("Atom: the alternate link wins, published or updated dates both work", () => {
  const items = parseFeed(ATOM, where("https://y.test/atom"));
  assert.deepEqual(items.map((i) => [i.title, i.url]), [["Entry two", "https://y.test/2"], ["Entry one", "https://y.test/1"]]);
  assert.equal(items[0].source, "Atom Blog");
  assert.equal(text("&lt;b&gt;a&#x2019;b&lt;/b&gt;"), "a’b");
});

test("merge removes duplicates by URL and caps each category", () => {
  const mk = (url, cat, h) => ({ title: url, url, source: "s", category: cat, group: "Work", publishedAt: new Date(Date.UTC(2026, 10, 11, h)).toISOString() });
  const out = merge([mk("https://a/1", "A", 1), mk("https://a/1?ref=x", "B", 2), mk("https://a/2", "A", 3), mk("https://a/3", "A", 4)], 2);
  assert.deepEqual(out.map((i) => i.url), ["https://a/3", "https://a/2", "https://a/1?ref=x"]);
});

test("/api/news keeps working feeds and names the broken one", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).startsWith("https://x.test") ? new Response(RSS) : new Response("not found", { status: 404 }));
  try {
    const { build } = await import("../api/news.js");
    const body = await build({ categories: [{ name: "Cat", group: "Work", feeds: ["https://x.test/feed", "https://broken.test/rss"] }], perCategory: 8, homeGroups: ["Work"] });
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.failed, [{ category: "Cat", feed: "broken.test" }]);
    assert.deepEqual(body.categories, [{ name: "Cat", group: "Work" }]);
  } finally {
    globalThis.fetch = real;
  }
});

test("/api/news requires the dashboard key", async () => {
  process.env.DASH_KEY = "k";
  const { GET } = await import("../api/news.js");
  assert.equal((await GET(new Request("https://x/api/news"))).status, 401);
});

test("the demo has every category and a broken-feed note, with example.com links only", () => {
  const d = demo.news(new Date());
  for (const c of d.categories) assert.ok(d.items.some((i) => i.category === c.name) || c.name === "Cloud & DevOps", c.name);
  assert.ok(d.items.every((i) => i.url.startsWith("https://example.com/")));
  assert.equal(d.failed.length, 1);
});

test("summaries: feed boilerplate and a repeated title are dropped, and long text is clipped to a paragraph", () => {
  const wp = `<item><title>Big launch</title><description><![CDATA[<p>Big launch: The team shipped a new camera body with a stacked sensor and faster autofocus for wildlife work.</p><p>The post Big launch appeared first on Sample Photo.</p>]]></description></item>`;
  assert.equal(summary(wp, "Big launch"), "The team shipped a new camera body with a stacked sensor and faster autofocus for wildlife work.");
  assert.equal(summary("<item><description>Too short</description></item>", "x"), "", "under 40 characters is not a summary");
  const long = `${"First sentence is here and it is long enough. ".repeat(4)}${"word ".repeat(80)}`;
  const c = clip(long);
  assert.ok(c.length <= 320 && c.endsWith("."), c);
  assert.ok(clip("x ".repeat(300)).endsWith("…"));
});

test("pictures: media tags, image enclosures and the first real <img>, https only", () => {
  assert.equal(image(`<item><media:thumbnail url="https://i.test/t.jpg"/></item>`), "https://i.test/t.jpg");
  assert.equal(image(`<item><media:content url="https://i.test/v.mp4" medium="video"/><media:content url="https://i.test/p.png" medium="image"/></item>`), "https://i.test/p.png");
  assert.equal(image(`<item><enclosure url="https://i.test/e.jpg" type="image/jpeg" length="1"/></item>`), "https://i.test/e.jpg");
  assert.equal(image(`<entry><content type="html">&lt;img src="https://feeds.feedburner.com/x.gif" width="1"&gt;&lt;img src="https://cdn.test/a.webp?w=600"&gt;</content></entry>`), "https://cdn.test/a.webp?w=600");
  assert.equal(image(`<item><media:thumbnail url="http://i.test/insecure.jpg"/></item>`), "", "http pictures are skipped");
  const [item] = parseFeed(`<rss><channel><title>S</title><item><title>T</title><link>https://s.test/1</link><pubDate>Tue, 10 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`, where("https://s.test/f"));
  assert.equal(item.image, "");
  assert.equal(item.summary, "");
});

test("article preview tags fill in what the feed lacked", async () => {
  const meta = pageMeta(`<html><head><meta property="og:image" content="/img/hero.jpg"><meta name="description" content="A description of the article that is long enough to show."></head><body><meta property="og:image" content="https://late.test/x.jpg"></body>`, "https://s.test/post/1");
  assert.deepEqual(meta, { image: "https://s.test/img/hero.jpg", summary: "A description of the article that is long enough to show." });
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<head><meta property="og:image" content="https://p.test/og.png"><meta property="og:description" content="Preview text from the page itself, long enough to count."></head>`, { headers: { "content-type": "text/html" } });
  try {
    const { enrich } = await import("../api/news.js");
    const items = [{ title: "T", url: "https://s.test/1", source: "S", category: "C", group: "Work", publishedAt: "2026-11-10T00:00:00Z", summary: "", image: "" }];
    await enrich(items);
    assert.equal(items[0].image, "https://p.test/og.png");
    assert.equal(items[0].summary, "Preview text from the page itself, long enough to count.");
  } finally {
    globalThis.fetch = real;
  }
});
