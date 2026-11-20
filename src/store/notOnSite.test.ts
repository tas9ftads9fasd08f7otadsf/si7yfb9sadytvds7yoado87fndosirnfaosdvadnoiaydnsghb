import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreNotReady, NotOnSite } from "@/backend/types";
import { failed, loadCoverage, loadServers, makeMap, resetViewer, useViewer } from "./viewer";

const fake = vi.hoisted(() => ({
  offered: false,
  newMap: vi.fn(),
  servers: vi.fn(),
  coverage: vi.fn(),
  coveragePlaces: vi.fn()
}));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => fake.offered, newMap: fake.newMap, servers: fake.servers,
    coverage: fake.coverage, coveragePlaces: fake.coveragePlaces } };
});

const get = useViewer.getState;

describe("a call the site does not do yet", () => {
  beforeEach(() => {
    resetViewer();
    vi.clearAllMocks();
    fake.offered = false;
    useViewer.setState({ connected: true, editToken: "t", mapID: "M" });
  });

  // 82 the page said "Not connected" for a write the site refuses as not done yet
  it("is said in a notice and does not make the page lose its connection", async () => {
    fake.newMap.mockRejectedValue(new NotOnSite("step 5"));
    expect(await makeMap("Alps")).toBe(false);
    expect(get().connected).toBe(true);
    expect(get().notice).toBe("The site cannot do this yet.");
  });

  // 82 a phone that cannot be reached is still a lost connection
  it("leaves a call that cannot reach the place a lost connection", async () => {
    fake.newMap.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await makeMap("Alps")).toBe(false);
    expect(get().connected).toBe(false);
  });

  // 82 a part the target does not offer is not asked for at all
  it("asks for servers and coverage only where the target offers them", async () => {
    await loadServers();
    await loadCoverage();
    expect(fake.servers).not.toHaveBeenCalled();
    expect(fake.coverage).not.toHaveBeenCalled();
    expect(get().connected).toBe(true);
  });

  it("asks for servers and coverage where the target offers them", async () => {
    fake.offered = true;
    fake.servers.mockResolvedValue({ ok: true, value: { servers: [] } });
    fake.coverage.mockResolvedValue({ ok: false, status: 404, said: "" });
    fake.coveragePlaces.mockResolvedValue({ ok: false, status: 404, said: "" });
    await loadServers();
    await loadCoverage();
    expect(fake.servers).toHaveBeenCalledTimes(1);
    expect(fake.coverage).toHaveBeenCalledTimes(1);
  });
});

describe("a core whose rules are not all in yet", () => {
  beforeEach(() => {
    resetViewer();
    vi.clearAllMocks();
    fake.offered = false;
    useViewer.setState({ connected: true, editToken: "t", mapID: "M" });
  });

  // 88 the page said "Not connected" while riki-core.wasm answered coreNotReady
  it("is said in the notice's own words on a write, and the connection stays", async () => {
    fake.newMap.mockRejectedValue(new CoreNotReady("riki-core.wasm cannot answer riki_apply yet"));
    expect(await makeMap("Alps")).toBe(false);
    expect(get().connected).toBe(true);
    expect(get().notice).toBe("The site's map rules are not ready yet.");
  });

  it("is said so by a read that failed, which is not a lost connection either", () => {
    expect(failed(new CoreNotReady("x"))).toBe(true);
    expect(get().connected).toBe(true);
    expect(get().notice).toBe("The site's map rules are not ready yet.");
    expect(failed(new TypeError("Failed to fetch"))).toBe(false);
    expect(get().connected).toBe(false);
  });
});
