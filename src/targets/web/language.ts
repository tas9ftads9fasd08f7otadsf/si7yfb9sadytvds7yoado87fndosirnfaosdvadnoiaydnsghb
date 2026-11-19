import type { Words } from "@/lib/words";

/** The language of the site's words that a browser's list of languages asks for; English where none does. */
export function chooseLanguage(available: readonly string[], preferred: readonly string[]): string {
  const have = new Map(available.map((code) => [code.toLowerCase(), code]));
  for (const asked of preferred) {
    const tag = asked.trim().replace(/_/g, "-");
    if (!tag) continue;
    const parts = tag.toLowerCase().split("-");
    const [primary = ""] = parts;
    const candidates = [tag.toLowerCase()];
    if (primary === "zh") {
      // Traditional Chinese is a script, which the Taiwan, Hong Kong and Macao regions write.
      const traditional = parts.includes("hant") || ["tw", "hk", "mo"].some((region) => parts.includes(region));
      candidates.push(traditional ? "zh-hant" : "zh-hans");
    }
    if (primary === "sr" && parts.includes("latn")) candidates.push("sr-latn");
    for (let length = parts.length - 1; length > 0; length -= 1) candidates.push(parts.slice(0, length).join("-"));
    const found = candidates.map((each) => have.get(each)).find((each) => each !== undefined);
    if (found) return found;
    // Only regional forms are there (pt-BR, pt-PT): the first of them speaks the language.
    const regional = [...have.entries()].filter(([code]) => code.startsWith(`${primary}-`)).map(([, code]) => code).sort()[0];
    if (regional) return regional;
  }
  return "en";
}

const COUNTED_LAYERS = 99;

const named = (names: Intl.DisplayNames | null, code: string) => {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * What the phone makes up from its own choices, made here: the languages a name can be written in, each one's name
 * in this language, and "14 layers". The table's plural forms are not in the words files, so a count says the
 * table's word for layers after the number, and English counts as English does.
 */
export function computedWords(language: string, codes: readonly string[], words: Words): Record<string, string> {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([language], { type: "language", languageDisplay: "standard" });
  } catch { /* the codes themselves are shown */ }
  const shown = (code: string) => {
    const said = named(names, code);
    return said.charAt(0).toLocaleUpperCase(language) + said.slice(1);
  };
  const sorted = [...codes].sort((a, b) => shown(a).localeCompare(shown(b), language));
  const out: Record<string, string> = { languages: sorted.join(",") };
  for (const code of codes) out[`language.${code}`] = shown(code);
  const plural = new Intl.PluralRules(language);
  const noun = String(words.layers ?? "").toLocaleLowerCase(language);
  for (let count = 0; count <= COUNTED_LAYERS; count += 1) {
    out[`layers.${count}`] = language === "en" ? `${count} layer${plural.select(count) === "one" ? "" : "s"}` : `${count} ${noun}`.trim();
  }
  return out;
}

/** The language codes a list of them holds, tolerating a list that is not one. */
export const codesOf = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((each): each is string => typeof each === "string") : [];
