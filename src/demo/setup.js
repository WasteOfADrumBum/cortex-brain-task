// Sample connections for /demo: everything connected except the optional finance automation, so both states show.
import { connections } from "../setup-lib.js";
/** @typedef {import("../types").Connection} Connection */

/** @returns {Connection[]} */
export function setup() {
  return connections({
    TODOIST_TOKEN: "demo", GCAL_ICS_URLS: "demo", GITHUB_TOKEN: "demo",
    GOOGLE_CLIENT_ID: "demo", GOOGLE_CLIENT_SECRET: "demo", GOOGLE_REFRESH_TOKEN: "demo",
  });
}
