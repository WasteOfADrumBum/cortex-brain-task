// Everything /demo shows, in one place. Loaded with import() by src/demo/mode.js only on /demo pages.
// Each export has the same type as the real data it stands in for (src/types.d.ts).
import { notes, storage } from "./notes.js";
import { tasks } from "./tasks.js";
import { checks } from "./checks.js";
import { calendar } from "./calendar.js";
import { weather } from "./weather.js";
import { finances } from "./finances.js";
import { news } from "./news.js";

/** @type {import("../types").DemoTrack[]} */
const playlist = [
  { title: "Night Drive", artist: "Sample Band", length: "3:42" },
  { title: "Low Orbit", artist: "Placeholder Trio", length: "4:05" },
  { title: "Quiet Hours", artist: "Demo Ensemble", length: "2:58" },
];

/** @type {import("../types").DemoData} */
const demo = { notes, storage, tasks, checks, calendar, weather, finances, news, playlist };
export default demo;
