const TITLE_KEYS = ["riki_name", "name", "Name", "Nazov", "title", "NAZOV", "NAME"];

export function featureTitle(properties: Record<string, unknown>): string {
  for (const key of TITLE_KEYS) {
    if (properties[key] != null && String(properties[key]).trim()) return String(properties[key]);
  }
  return "";
}

/** What a feature's card lists: at most forty, none of the app's own. */
export function featureRows(properties: Record<string, unknown>): [string, string][] {
  return Object.entries(properties)
    .filter(([key, value]) => !key.startsWith("riki_") && value != null && String(value).trim() !== "")
    .slice(0, 40)
    .map(([key, value]) => [key, String(value)]);
}
