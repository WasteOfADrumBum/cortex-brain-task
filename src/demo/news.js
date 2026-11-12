// Sample headlines for /demo News and Home. Made up: titles and sources are invented and link to example.com.
// Same shape as /api/news, with one feed marked unavailable so the demo shows that note too.
/** @typedef {import("../types").NewsItem} NewsItem */
/** @typedef {import("../types").NewsResponse} NewsResponse */

/**
 * @param {Date} now
 * @returns {NewsResponse}
 */
export function news(now) {
  const ago = (/** @type {number} */ h) => new Date(now.getTime() - h * 3600000).toISOString();
  /** @type {[string, string, string, NewsItem["group"], number][]} */
  const rows = [
    ["A practical guide to writing smaller pull requests", "Sample Dev Weekly", "Full-Stack Development", "Work", 2],
    ["What changed in browser accessibility tools this year", "Sample Web Journal", "Full-Stack Development", "Work", 5],
    ["Three ways teams are using AI assistants for code review", "Sample AI Digest", "AI Tools & Agents", "Work", 3],
    ["Agents that ask before they act, explained", "Sample AI Digest", "AI Tools & Agents", "Work", 26],
    ["Serverless cold starts, measured", "Sample Cloud Notes", "Cloud & DevOps", "Work", 20],
    ["How to write a promotion packet engineers actually read", "Sample Careers Letter", "Software Careers", "Work", 40],
    ["The best budget lenses for street photography", "Sample Photo Blog", "Photography", "Life", 6],
    ["Golden hour without the crowds", "Sample Photo Blog", "Photography", "Life", 50],
    ["Indie games worth a weekend", "Sample Game Review", "Gaming & Technology", "Life", 30],
    ["Home studio drum mics on a budget", "Sample Audio Mag", "Music & Audio", "Life", 12],
  ];
  return {
    generatedAt: now.toISOString(),
    categories: [
      { name: "AI Tools & Agents", group: "Work" }, { name: "Full-Stack Development", group: "Work" }, { name: "Cloud & DevOps", group: "Work" },
      { name: "Software Careers", group: "Work" }, { name: "Gaming & Technology", group: "Life" }, { name: "Photography", group: "Life" },
      { name: "Music & Audio", group: "Life" },
    ],
    items: rows.map(([title, source, category, group, h], i) => ({ title, url: `https://example.com/demo-news-${i + 1}`, source, category, group, publishedAt: ago(h) }))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    failed: [{ category: "Cloud & DevOps", feed: "example.org" }],
    homeGroups: ["Work"],
  };
}
