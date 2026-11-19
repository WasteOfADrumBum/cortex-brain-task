// A small .xlsx reader with no dependencies, for the Finances tab: Google Drive exports the J&M P&L sheet as .xlsx
// with the browser's existing drive.readonly sign-in, and this turns each tab into a grid of cell values.
// Unzips with DecompressionStream (every current browser and Node 22) and reads the XML with regular expressions,
// so it runs in the page and in the tests alike. Values only: numbers stay numbers, text stays text, no styles.

/** @typedef {(string | number | boolean | null)[][]} Grid */

/** The files inside a zip archive, by name, still compressed. */
function entries(/** @type {Uint8Array} */ bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: signature 0x06054b50, searched backwards past an optional comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  /** @type {Map<string, { method: number, size: number, offset: number }>} */
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Broken zip directory");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // The data starts after the local header, whose name and extra lengths can differ from the directory's.
    const offset = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.set(name, { method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { bytes, out };
}

/** One file's text from the archive, or null when it isn't there. */
async function readEntry(/** @type {ReturnType<typeof entries>} */ zip, /** @type {string} */ name) {
  const e = zip.out.get(name);
  if (!e) return null;
  const raw = zip.bytes.subarray(e.offset, e.offset + e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error(`Unsupported zip compression (${e.method})`);
  const stream = new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (raw)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const unescapeXml = (/** @type {string} */ s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[/** @type {keyof typeof ENT} */ (e.toLowerCase())];
});
/** All <t> text inside a block (rich text has several runs), joined. Phonetic hints (<rPh>) are skipped. */
const runs = (/** @type {string} */ xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

/** "AB12" -> zero-based [row, col]. */
export function cellRef(/** @type {string} */ ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

/** A worksheet's XML -> grid of values (trailing empty rows and cells are trimmed). */
export function sheetGrid(/** @type {string} */ xml, /** @type {string[]} */ shared) {
  /** @type {Grid} */
  const grid = [];
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1];
    const body = c[2] || "";
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const at = ref && cellRef(ref);
    if (!at) continue;
    const type = /\bt="(\w+)"/.exec(attrs)?.[1] || "n";
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    /** @type {string | number | boolean | null} */
    let value = null;
    if (type === "s") value = v != null ? shared[Number(v)] ?? null : null;
    else if (type === "inlineStr") value = runs(body);
    else if (type === "str") value = v != null ? unescapeXml(v) : null;
    else if (type === "b") value = v === "1";
    else if (type === "e") value = null;
    else if (v != null && v !== "") value = Number(v);
    if (value === "" || value == null) continue;
    const [r, col] = at;
    (grid[r] ||= [])[col] = value;
  }
  for (let r = 0; r < grid.length; r++) grid[r] = Array.from(grid[r] || [], (x) => x ?? null);
  return grid;
}

/**
 * Every tab of an .xlsx file as { [tab name]: grid }. Only the tabs named in `only` are read when it is given.
 * @param {ArrayBuffer | Uint8Array} data
 * @param {string[]} [only]
 * @returns {Promise<Record<string, Grid>>}
 */
export async function readXlsx(data, only) {
  const zip = entries(data instanceof Uint8Array ? data : new Uint8Array(data));
  const book = (await readEntry(zip, "xl/workbook.xml")) || "";
  const rels = (await readEntry(zip, "xl/_rels/workbook.xml.rels")) || "";
  const sharedXml = (await readEntry(zip, "xl/sharedStrings.xml")) || "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  /** @type {Record<string, string>} */
  const targets = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets[id] = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  /** @type {Record<string, Grid>} */
  const out = {};
  for (const m of book.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] || "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    if (!name || !rid || (only && !only.includes(name))) continue;
    const xml = await readEntry(zip, targets[rid] || "");
    if (xml != null) out[name] = sheetGrid(xml, shared);
  }
  return out;
}
