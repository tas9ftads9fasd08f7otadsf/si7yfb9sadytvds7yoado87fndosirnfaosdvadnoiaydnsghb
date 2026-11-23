/** Header values by host, which the map's requests carry; set from what the site could open. */
let byHost = new Map<string, Record<string, string>>();

export function setRequestHeaders(headers: Record<string, Record<string, string>>): void {
  byHost = new Map(Object.entries(headers).map(([host, values]) => [host.toLowerCase(), values]));
}

export function requestHeaders(url: string): Record<string, string> | undefined {
  try {
    return byHost.get(new URL(url).host.toLowerCase());
  } catch {
    return undefined;
  }
}
