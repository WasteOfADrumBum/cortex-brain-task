// A small per-instance rate limit: at most `max` calls per key in a rolling hour. Vercel can run several instances,
// so this is a brake on runaway scripts, not a hard guarantee. Files starting with "_" are not Vercel functions.
/** @type {Map<string, number[]>} */
const hits = new Map();
export function allow(/** @type {string} */ key, max = 20, now = Date.now()) {
  const recent = (hits.get(key) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
