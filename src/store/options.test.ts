import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerOptions, Portable } from "@/lib/types";
import { resetViewer, setDrawn, useViewer } from "./viewer";

const get = useViewer.getState;
const portable: Portable = { id: "a", name: "Tatras", styles: [{ id: "s", name: "Summer" }], selectedStyleID: "s" };
const device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }] };
const options = (label: string) => ({ layers: [{ id: "L", sections: [{ label }] }] }) as unknown as LayerOptions;
const json = (body: unknown) => new Response(JSON.stringify(body));

beforeEach(() => {
  resetViewer();
  vi.unstubAllGlobals();
  useViewer.setState({ editToken: "t", mapID: "a", styleID: "s", portable, device, layerOptions: options("before") });
});

describe("a layer's options after a change", () => {
  // 48 bug: every change emptied the options, so an open panel blinked out and a click on it was lost
  it("stay on screen while the phone's list is read again", async () => {
    const seen: (LayerOptions | null)[] = [];
    const stop = useViewer.subscribe((state) => seen.push(state.layerOptions));
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/layer-options") ? json(options("after")) : url.includes("/edit") ? json(portable) : json(device)));
    await setDrawn({ layer: "L", grouping: "1" });
    stop();
    expect(seen).not.toContain(null);
    expect(get().layerOptions).toEqual(options("after"));
  });

  // 48 two changes in a row: the list asked for last is the one kept, whichever answers first
  it("keep the answer to the latest ask when an earlier one comes late", async () => {
    const waiting: ((response: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("/layer-options")
      ? new Promise<Response>((resolve) => { waiting.push(resolve); })
      : Promise.resolve(url.includes("/edit") ? json(portable) : json(device))));
    const first = setDrawn({ layer: "L", grouping: "1" });
    const second = setDrawn({ layer: "L", grouping: "0" });
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    waiting[1]!(json(options("second")));
    waiting[0]!(json(options("first")));
    await Promise.all([first, second]);
    expect(get().layerOptions).toEqual(options("second"));
  });

  // 48 a refused change leaves the options as they were
  it("are left alone when the phone refuses the change", async () => {
    const fetcher = vi.fn(async () => new Response("No such layer", { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    await setDrawn({ layer: "X", grouping: "1" });
    expect(get().layerOptions).toEqual(options("before"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
