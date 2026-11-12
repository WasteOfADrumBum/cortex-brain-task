// Sample Ops data for /demo: four made-up projects, one of them with a failed deploy so the demo shows every state.
// Same shape as /api/ops (src/types.d.ts), built with the same helpers so the totals and chart add up.
import { weeks, totals } from "../ops-lib.js";
/** @typedef {import("../types").OpsResponse} OpsResponse */
/** @typedef {import("../types").OpsProject} OpsProject */

const DAY = 864e5;

/**
 * @param {Date} now
 * @returns {OpsResponse}
 */
export function ops(now) {
  const ago = (/** @type {number} */ days, hours = 0) => new Date(now.getTime() - days * DAY - hours * 3600e3).toISOString();
  // Merged PRs per project: days ago, spread over the last 12 weeks.
  const plan = {
    "Atlas Notes": [0.2, 1, 2, 4, 6, 9, 13, 15, 20, 27, 33, 40, 48, 55, 61, 70, 76],
    "Pixel Kit": [0.5, 3, 8, 12, 19, 26, 34, 47, 62, 74],
    "Trail Journal": [1.5, 5, 11, 18, 25, 39, 53, 68],
    "Helper CLI": [2.5, 16, 30, 44, 58, 72],
  };
  /** @type {Record<string, string[]>} */
  const merged = Object.fromEntries(Object.entries(plan).map(([n, d]) => [n, d.map((x) => ago(x))]));
  /** @type {OpsProject[]} */
  const projects = [
    {
      name: "Atlas Notes", repo: "example/atlas-notes", url: "https://example.com/atlas",
      deploy: { state: "healthy", at: ago(0, 4), message: "Add keyboard shortcuts to the reader", url: "https://example.com/atlas" },
      mergedPrs: [
        { title: "Add keyboard shortcuts to the reader", mergedAt: merged["Atlas Notes"][0], summary: "J and K move between notes; ? lists every shortcut.", url: "https://example.com/pr/1" },
        { title: "Faster search index", mergedAt: merged["Atlas Notes"][1], summary: "Builds the index once per session instead of per query.", url: "https://example.com/pr/2" },
        { title: "Fix focus ring on the dark theme", mergedAt: merged["Atlas Notes"][2], summary: "Focus outline now meets 3:1 contrast.", url: "https://example.com/pr/3" },
      ],
      openPrs: 2, failedLast7Days: 0, npm: null,
    },
    {
      name: "Pixel Kit", repo: "example/pixel-kit", url: "https://example.com/pixel-kit",
      deploy: { state: "failed", at: ago(0, 9), message: "Bump the build tooling", url: "https://example.com/pixel-kit" },
      mergedPrs: [
        { title: "Bump the build tooling", mergedAt: merged["Pixel Kit"][0], summary: "Updates the bundler and test runner.", url: "https://example.com/pr/4" },
        { title: "New Tooltip component", mergedAt: merged["Pixel Kit"][1], summary: "Accessible tooltip with Escape to dismiss.", url: "https://example.com/pr/5" },
        { title: "Docs: colour tokens", mergedAt: merged["Pixel Kit"][2], summary: "", url: "https://example.com/pr/6" },
      ],
      openPrs: 1, failedLast7Days: 1, npm: { name: "pixel-kit", version: "2.3.1" },
    },
    {
      name: "Trail Journal", repo: "example/trail-journal", url: "https://example.com/trail",
      deploy: { state: "building", at: ago(0, 0.1), message: "Photo captions on the map view", url: "https://example.com/trail" },
      mergedPrs: [
        { title: "Photo captions on the map view", mergedAt: merged["Trail Journal"][0], summary: "Captions show under each pin's photo.", url: "https://example.com/pr/7" },
        { title: "Offline mode for saved trails", mergedAt: merged["Trail Journal"][1], summary: "Saved trails open without a connection.", url: "https://example.com/pr/8" },
        { title: "Larger tap targets", mergedAt: merged["Trail Journal"][2], summary: "Every control is at least 24 by 24 pixels.", url: "https://example.com/pr/9" },
      ],
      openPrs: 0, failedLast7Days: 0, npm: null,
    },
    {
      name: "Helper CLI", repo: "example/helper-cli", url: null, deploy: null,
      mergedPrs: [
        { title: "Release 1.4.0", mergedAt: merged["Helper CLI"][0], summary: "Adds the doctor command.", url: "https://example.com/pr/10" },
        { title: "Windows path fix", mergedAt: merged["Helper CLI"][1], summary: "", url: "https://example.com/pr/11" },
        { title: "Shell completions", mergedAt: merged["Helper CLI"][2], summary: "Bash and zsh completions.", url: "https://example.com/pr/12" },
      ],
      openPrs: 3, failedLast7Days: 0, npm: { name: "helper-cli", version: "1.4.0" },
    },
  ];
  const deploys = { "Atlas Notes": [ago(0, 4), ago(1), ago(2), ago(4)], "Pixel Kit": [ago(0, 9), ago(3)], "Trail Journal": [ago(0, 0.1), ago(1.5)], "Helper CLI": [] };
  const rows = projects.map((p) => ({ merged: merged[p.name], deploys: deploys[/** @type {keyof typeof deploys} */ (p.name)], failed: p.failedLast7Days }));
  return {
    generatedAt: now.toISOString(),
    projects,
    totals: totals(rows, now),
    weeks: weeks(projects.map((p) => ({ name: p.name, merged: merged[p.name] })), now),
    warnings: [],
  };
}
