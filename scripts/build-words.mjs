// Makes the site's words files from rikimaps' tables at the pinned commit (rikiCore.ref), as the contract in
// rikimaps' .planning/web-icloud.md §2 says: `words/<lang>.json` for English and every language of the app, and
// `words/languages.json`, written to dist/words/ (`<lang>.json` and `languages.json` in it).
//
//     RIKIMAPS_DIR=/path/to/rikimaps npm run build:words      # a checkout at rikiCore.ref; read only
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the key list, the tables and the app's name are in a rikimaps checkout. */
export const PLACES = {
  list: ["Riki Maps", "Riki Maps", "Resources", "web-words.json"],
  tables: { Localizable: ["Riki Maps", "Riki Maps"], Shared: ["Riki Maps", "Riki Maps Shared"] },
  project: ["Riki Maps", "Riki Maps.xcodeproj", "project.pbxproj"]
};
export const SOURCE = "en";

const SLOT = /\{([A-Za-z]+)\}/g;
const SPECIFIER = /%(?:([0-9]+)\$)?(?:ll|l|h|q|z|t|j)?([@diuxXo%])/g;
const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "'": "'", 0: "\0" };

/** `"key" = "value";` pairs as Apple's parser takes them: comments, escapes and `\uXXXX`, an unquoted key. */
export function parseStrings(text) {
  const out = {};
  const n = text.length;
  let i = 0;
  const skip = () => {
    while (i < n) {
      if (/\s/.test(text[i])) i += 1;
      else if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i);
        if (end < 0) throw new Error("a comment is not closed");
        i = end + 2;
      } else if (text.startsWith("//", i)) {
        const end = text.indexOf("\n", i);
        i = end < 0 ? n : end + 1;
      } else break;
    }
  };
  const token = () => {
    if (text[i] !== '"') {
      const found = /[A-Za-z0-9_.$:/-]+/y;
      found.lastIndex = i;
      const m = found.exec(text);
      if (!m) throw new Error(`expected a key at ${i}`);
      i = found.lastIndex;
      return m[0];
    }
    let buf = "";
    i += 1;
    while (text[i] !== '"') {
      if (i >= n) throw new Error("a string is not closed");
      const c = text[i];
      if (c === "\\") {
        const e = text[i + 1];
        if (e === "u" || e === "U") {
          buf += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          buf += ESCAPES[e] ?? e;
          i += 2;
        }
      } else {
        buf += c;
        i += 1;
      }
    }
    i += 1;
    return buf;
  };
  skip();
  while (i < n) {
    const key = token();
    skip();
    let value = key;
    if (text[i] === "=") {
      i += 1;
      skip();
      value = token();
      skip();
    }
    if (text[i] !== ";") throw new Error(`expected ; after ${JSON.stringify(key)}`);
    out[key] = value;
    i += 1;
    skip();
  }
  return out;
}

/** The top-level keys of a `.stringsdict`: its plurals, which are not words for the site. */
export function pluralKeys(plist) {
  const keys = [];
  let depth = 0;
  for (const m of plist.matchAll(/<(\/?)(dict|key)(\/?)>([^<]*)/g)) {
    const [, closing, tag, , body] = m;
    if (tag === "dict") depth += closing ? -1 : 1;
    else if (!closing && depth === 1) keys.push(body.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  return keys;
}

export const slots = (english) => [...english.matchAll(SLOT)].map((m) => m[1]);

/** The English as a table writes it: `%@` for a slot, `%lld` for a number, `%` as `%%`. */
export function englishFormat(entry) {
  const numbers = entry.numbers ?? [];
  return entry.en.replaceAll("%", "%%").replace(SLOT, (_, name) => (numbers.includes(name) ? "%lld" : "%@"));
}

/** A table's format with each specifier, by position, replaced by its value; `%%` is `%`. */
export function fill(format, values) {
  let out = "";
  let last = 0;
  let following = 0;
  for (const m of format.matchAll(SPECIFIER)) {
    out += format.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[2] === "%") {
      out += "%";
      continue;
    }
    const place = m[1] ? Number(m[1]) - 1 : following;
    following = place + 1;
    if (place >= 0 && place < values.length) out += values[place];
  }
  return out + format.slice(last);
}

/** The sentence as the page gets it: slots left in, the app's name put in; `translated` is null for the English. */
export function wordOf(entry, translated, app) {
  if (!("tr" in entry)) return entry.en.replaceAll("{app}", app);
  const names = slots(entry.en);
  if (names.length === 0) return translated || entry.en;
  const values = names.map((name) => (name === "app" ? app : `{${name}}`));
  return fill(translated || englishFormat(entry), values);
}

/** The `APP_NAME` build setting every target's display name is built from. */
export function appName(pbxproj) {
  const found = /^\s*APP_NAME = ("[^"]*"|[^;]*);/m.exec(pbxproj);
  if (!found) throw new Error("the project has no APP_NAME build setting");
  return found[1].replace(/^"|"$/g, "");
}

/** A language's text for a key: nothing for a missing, empty or plural one. */
const said = (table, key, lang) => {
  const value = table[lang]?.strings[key];
  return typeof value === "string" && value && !table[lang].plurals.has(key) ? value : null;
};

/** {browser key: text} for one language, English wherever the table has nothing. */
export function wordsIn(entries, tables, lang, app) {
  const out = {};
  for (const [name, entry] of Object.entries(entries)) {
    const table = tables[entry.table || "Localizable"];
    out[name] = wordOf(entry, "tr" in entry ? said(table, entry.tr, lang) : null, app);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** As Python's `json.dumps(ensure_ascii=False, indent=1, sort_keys=True)` and a newline. */
export function dumps(value) {
  const sorted = (v) => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sorted(x)]));
    return v;
  };
  return `${JSON.stringify(sorted(value), null, 1)}\n`;
}

/** sha256 over each file's path, a zero byte, its bytes and a zero byte, in path order: the contract's check. */
export function contentHash(files) {
  const digest = createHash("sha256");
  for (const file of Object.keys(files).sort()) digest.update(Buffer.concat([Buffer.from(file), Buffer.from([0]), Buffer.from(files[file]), Buffer.from([0])]));
  return digest.digest("hex");
}

/** {path: text} for `words/<lang>.json` of English and every language, and the list of them. */
export function build(entries, tables, languages, app) {
  const files = {};
  const all = [...new Set([SOURCE, ...languages])];
  for (const lang of all) files[`words/${lang}.json`] = dumps({ language: lang, words: wordsIn(entries, tables, lang, app) });
  files["words/languages.json"] = dumps([...all].sort());
  return files;
}

/** Every table's languages, `{lang: {strings, plurals}}`, from `<lang>.lproj/<Table>.strings` and `.stringsdict`. */
export async function readTable(folder, table) {
  const out = {};
  for (const dir of await readdir(folder, { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.endsWith(".lproj")) continue;
    const lang = dir.name.slice(0, -".lproj".length);
    const strings = path.join(folder, dir.name, `${table}.strings`);
    const plurals = path.join(folder, dir.name, `${table}.stringsdict`);
    if (!existsSync(strings) && !existsSync(plurals)) continue;
    out[lang] = {
      strings: existsSync(strings) ? parseStrings(await readFile(strings, "utf8")) : {},
      plurals: new Set(existsSync(plurals) ? pluralKeys(await readFile(plurals, "utf8")) : [])
    };
  }
  return out;
}

/** The `.lproj` folders of the app's target, less Base and English. */
export async function languagesOf(folder) {
  return (await readdir(folder, { withFileTypes: true }))
    .filter((each) => each.isDirectory() && each.name.endsWith(".lproj")).map((each) => each.name.slice(0, -".lproj".length))
    .filter((lang) => lang !== "Base" && lang !== SOURCE).sort();
}

/** The files a rikimaps checkout makes. */
export async function fromCheckout(dir) {
  const at = (parts) => path.join(dir, ...parts);
  const entries = JSON.parse(await readFile(at(PLACES.list), "utf8"));
  const tables = {};
  for (const [name, parts] of Object.entries(PLACES.tables)) tables[name] = await readTable(at(parts), name);
  const app = appName(await readFile(at(PLACES.project), "utf8"));
  return build(entries, tables, await languagesOf(at(PLACES.tables.Localizable)), app);
}

/** The files into `out`, which then holds `<lang>.json` and `languages.json`, as pack:web takes them. */
export async function write(files, out) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(out, file.replace(/^words\//, "")), text);
}

async function main() {
  const own = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const ref = process.env.RIKI_CORE_REF || own.rikiCore?.ref;
  if (!ref) {
    console.warn("the site's words are not made: rikiCore.ref in package.json pins no rikimaps commit yet");
    return;
  }
  const dir = process.env.RIKIMAPS_DIR;
  if (!dir) throw new Error("RIKIMAPS_DIR is not set: point it at a rikimaps checkout at rikiCore.ref (read only)");
  const files = await fromCheckout(dir);
  const out = process.env.RIKI_WORDS_DIR || path.join(ROOT, "dist", "words");
  await write(files, path.join(out));
  console.log(`${Object.keys(files).length - 1} languages under ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
