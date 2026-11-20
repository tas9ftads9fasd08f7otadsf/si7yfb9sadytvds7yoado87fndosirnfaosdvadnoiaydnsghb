import { BASE } from "./base";

/** What `config.json` carries: the CloudKit container and the maptiles host, from the server's config.php. */
export interface SiteConfig {
  container: string;
  apiToken: string;
  environment: "development" | "production";
  /** Where archives, glyphs and sprites are fetched from; empty until the deploy sets it. */
  tilesBase: string;
  /** 112 The region catalog the site's server fetches; empty turns region downloads off. */
  regionsCatalog: string;
}

let kept: Promise<SiteConfig> | null = null;

/** Reads `config.json` under the site's path, once; a site without one says so. */
export function readConfig(fetcher: typeof fetch = fetch, base = BASE): Promise<SiteConfig> {
  kept ??= (async () => {
    const answer = await fetcher(`${base}/config.json`, { cache: "no-store" });
    if (!answer.ok) throw new Error(`The site has no config.json (${answer.status})`);
    const read = await answer.json() as Partial<SiteConfig>;
    if (typeof read.container !== "string" || !read.container) throw new Error("config.json names no container");
    return {
      container: read.container,
      apiToken: read.apiToken ?? "",
      environment: read.environment === "production" ? "production" : "development",
      tilesBase: (read.tilesBase ?? "").replace(/\/+$/, ""),
      regionsCatalog: read.regionsCatalog ?? ""
    };
  })();
  kept.catch(() => { kept = null; });
  return kept;
}

/** Forgets what was read, so a test can read again. */
export function forgetConfig() {
  kept = null;
}
