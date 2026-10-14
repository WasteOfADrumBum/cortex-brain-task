// Checks for the desktop Home HUD markup and layout rules. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const html = read("index.html");
const css = read("styles.css");
const desk = html.slice(html.indexOf('class="home-desk'));

test("desktop Home uses one grid with a panel per area", () => {
  const areas = ["sched", "clock", "fc", "top3", "brain", "brief", "ops", "money", "music", "links"];
  assert.equal((desk.match(/class="hd-grid"/g) || []).length, 1);
  for (const a of areas) assert.match(desk, new RegExp(`hd-a-${a}\\b`), `missing hd-a-${a}`);
  assert.match(css, /grid-template-areas:\s*"sched clock fc"\s*"top3\s+clock brain"\s*"top3\s+brief ops"\s*"money music links"/);
  assert.match(css, /grid-template-rows:\s*\d+px \d+px \d+px \d+px/);
});

test("clock is 24-hour HH:MM:SS with no AM/PM or seconds pill", () => {
  assert.match(desk, /id="d-hms"/);
  assert.doesNotMatch(desk, /d-ampm|d-secs|hd-ampm/);
  assert.match(read("home-desk.js"), /\$\{pad\(h\)\}:\$\{pad\(m\)\}:\$\{pad\(s\)\}/);
});

test("every ring legend item has a live percentage", () => {
  for (const id of ["year", "month", "hour", "min", "sec"]) assert.match(desk, new RegExp(`id="d-${id}-pct"`));
});

test("weather bubble connects right, date bubble connects left", () => {
  assert.match(desk, /hd-line hd-line-wx/);
  assert.match(desk, /hd-line hd-line-date/);
  assert.match(css, /\.hd-wx\s*\{[^}]*right:\s*0[^}]*top:\s*0/);
  assert.match(css, /\.hd-date\s*\{[^}]*left:\s*0[^}]*bottom:/);
});

test("panel content scrolls inside a fixed body", () => {
  const panels = desk.match(/<(section|nav)[^>]*hd-a-(?!clock)[a-z0-9]+/g) || [];
  assert.equal(panels.length, 9);
  assert.ok((desk.match(/class="hd-body"/g) || []).length >= 9);
  assert.match(css, /\.hd-body\s*\{[^}]*overflow-y:\s*auto/);
});
