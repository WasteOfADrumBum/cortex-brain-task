// Constant-time check of the dashboard key sent in x-dash-key. Both values are hashed first, so the
// comparison takes the same time whatever their lengths. Files starting with "_" are not Vercel functions.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(String(value ?? '')).digest();

/**
 * @param {string | null | undefined} given the key from the request
 * @param {string | undefined} expected the key configured in Vercel
 */
export function keyMatches(given, expected) {
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
