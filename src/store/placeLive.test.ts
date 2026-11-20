import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACE_LIVE_EVERY } from "@/lib/page";
import type { DetailsSheet } from "@/lib/types";
import { type MapControl, setMapControl } from "@/map/control";
import { type Place, resetViewer, showPlace, useViewer } from "./viewer";

const get = useViewer.getState;
const live = { isLive: true, ageSeconds: 5, windowSeconds: 120, label: "LIVE", notLiveLabel: "Not live" };
const sheet = (delay: string): DetailsSheet => ({ title: "Os 4314", keys: [], live,
  sections: [{ blocks: [{ kind: "rows", rows: [{ title: "Delay", value: delay }] }] }] });
const placeOf = (details: DetailsSheet | null = sheet("3 min late")): Place => ({ lng: 17.1, lat: 48.1,
  found: [{ properties: { Line: "4314", Delay: "3" }, layer: "Trains", layerID: "L1", details, asked: 1 }] });

function phoneSays(vehicle: object | null) {
  const fetcher = vi.fn(async (url: string) => {
    const path = new URL(url, "http://phone").pathname;
    if (path.endsWith("/live/L1")) return new Response(JSON.stringify({ type: "FeatureCollection",
      features: vehicle ? [{ type: "Feature", properties: vehicle, geometry: { type: "Point", coordinates: [17.2, 48.2] } }] : [] }));
    if (path.endsWith("/details")) return new Response(JSON.stringify(sheet("12 min late")));
    return new Response("", { status: 500 });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const paths = (fetcher: ReturnType<typeof phoneSays>) => fetcher.mock.calls.map(([url]) => new URL(String(url), "http://phone"));

describe("an open place panel of a live layer", () => {
  beforeEach(() => {
    resetViewer();
    vi.useFakeTimers();
    setMapControl({ box: () => [17, 48, 17.5, 48.5] } as unknown as MapControl);
    useViewer.setState({ mapID: "a", route: { screen: "map", map: "a" } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setMapControl(null);
  });

  // 130 the layer's live answer is read again, the vehicle found in it, and its Details asked anew
  it("reads the layer's live answer again and asks the Details for the vehicle's new values", async () => {
    const fetcher = phoneSays({ Line: "4314", Delay: "12" });
    showPlace(placeOf());
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY);
    const [live, details] = paths(fetcher);
    expect(live?.pathname).toBe("/riki/v1/maps/a/live/L1");
    expect(live?.searchParams.get("bbox")).toBe("17.00000,48.00000,17.50000,48.50000");
    expect(JSON.parse(details?.searchParams.get("values") ?? "")).toEqual({ Line: "4314", Delay: "12" });
    const [one] = get().place?.found ?? [];
    expect(one?.properties).toEqual({ Line: "4314", Delay: "12" });
    expect(one?.details?.sections[0]?.blocks[0]?.rows?.[0]?.value).toBe("12 min late");
    expect(one?.asked).toBeGreaterThan(1);
    expect(get().place).toMatchObject({ lng: 17.2, lat: 48.2 });
  });

  // 130 it goes on for as long as the panel is open
  it("keeps reading while the panel is open and stops when it is closed", async () => {
    const fetcher = phoneSays({ Line: "4314", Delay: "12" });
    showPlace(placeOf());
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY * 2);
    expect(paths(fetcher).filter((url) => url.pathname.endsWith("/details"))).toHaveLength(2);
    showPlace(null);
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY * 3);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  // 130 a vehicle the live answer no longer holds is not asked about: its pill ages out, not renewed
  it("leaves the card, and its age, alone when the live answer holds no such vehicle", async () => {
    const fetcher = phoneSays(null);
    const shown = placeOf();
    showPlace(shown);
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY);
    expect(paths(fetcher).map((url) => url.pathname)).toEqual(["/riki/v1/maps/a/live/L1"]);
    expect(get().place?.found[0]?.asked).toBe(1);
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY);
    expect(paths(fetcher)).toHaveLength(2);
  });

  // 130 only a layer that answers live, as the phone's sheet says, is read again
  it("reads nothing for a card without a live pill", async () => {
    const fetcher = phoneSays({ Line: "4314" });
    const plain = { ...sheet("3 min late"), live: null };
    showPlace(placeOf(plain));
    showPlace(placeOf(null));
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY * 2);
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 130 a panel Edit map hides is not read for
  it("does not ask while Edit map hides the panel", async () => {
    const fetcher = phoneSays({ Line: "4314", Delay: "12" });
    useViewer.setState({ editing: true });
    showPlace(placeOf());
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY * 2);
    expect(fetcher).not.toHaveBeenCalled();
    useViewer.setState({ editing: false });
    await vi.advanceTimersByTimeAsync(PLACE_LIVE_EVERY);
    expect(fetcher).toHaveBeenCalled();
  });
});
