import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetConfig, readConfig } from "./config";

const answering = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));

describe("the site's config", () => {
  afterEach(forgetConfig);

  // 76 read under the site's own path, once
  it("reads config.json under the base and asks only once", async () => {
    // 147 an older config.php may still carry a tilesBase, which the page no longer reads
    const fetcher = answering({ container: "iCloud.x", apiToken: "T", environment: "production", tilesBase: "https://t.example/" });
    const first = await readConfig(fetcher, "/editor");
    await readConfig(fetcher, "/editor");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/editor/config.json");
    expect(first).toEqual({ container: "iCloud.x", apiToken: "T", environment: "production", regionsCatalog: "" });
  });

  // 112 the catalog the server fetches region packages from is in the config when the deploy set it
  it("carries the region catalog the deploy named, and none where it did not", async () => {
    expect((await readConfig(answering({ container: "iCloud.x", regionsCatalog: "https://r.example/maps.json" }), "")).regionsCatalog)
      .toBe("https://r.example/maps.json");
    forgetConfig();
    expect((await readConfig(answering({ container: "iCloud.x" }), "")).regionsCatalog).toBe("");
  });

  it("defaults to the development environment, no token and no region catalog", async () => {
    const config = await readConfig(answering({ container: "iCloud.x" }), "");
    expect(config).toEqual({ container: "iCloud.x", environment: "development", apiToken: "", regionsCatalog: "" });
  });

  it("refuses a site with no config, and asks again next time", async () => {
    await expect(readConfig(answering({}, 404), "")).rejects.toThrow("no config.json (404)");
    await expect(readConfig(answering({ container: "iCloud.x" }), "")).resolves.toMatchObject({ container: "iCloud.x" });
  });

  it("refuses a config that names no container", async () => {
    await expect(readConfig(answering({ apiToken: "T" }), "")).rejects.toThrow("no container");
  });
});
