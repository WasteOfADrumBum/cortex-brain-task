// Sample headlines for the News tab (phase 5). Made up: titles and sources are invented and link to example.com.
// The News view arrives in phase 5; this data is typed now so the demo has it ready.
/** @typedef {import("../types").NewsItem} NewsItem */

/**
 * @param {Date} now
 * @returns {NewsItem[]}
 */
export function news(now) {
  /** @param {number} h */
  const ago = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  /** @type {[string, string, string, NewsItem["group"], number][]} */
  const rows = [
    ["A practical guide to writing smaller pull requests", "Sample Dev Weekly", "Full-stack development", "Work", 2],
    ["What changed in browser accessibility tools this year", "Sample Web Journal", "Full-stack development", "Work", 5],
    ["Three ways teams are using AI assistants for code review", "Sample AI Digest", "AI tools", "Work", 8],
    ["Serverless cold starts, measured", "Sample Cloud Notes", "Cloud", "Work", 20],
    ["The best budget lenses for street photography", "Sample Photo Blog", "Photography", "Life", 6],
    ["Indie games worth a weekend", "Sample Game Review", "Gaming", "Life", 30],
  ];
  return rows.map(([title, source, category, group, h], i) => ({ title, url: `https://example.com/demo-news-${i + 1}`, source, category, group, publishedAt: ago(h) }));
}
