import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "@backend";
import type { ServerList } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { AddLayer, matchingServers } from "./AddLayer";
import { tintsFor, tuneOf } from "./ServerLayerPage";

const listing: ServerList = { servers: [
  { id: "G", name: "Geofond", line: "ags.geology.sk · Esri / ArcGIS", symbol: "server.rack", rows: [
    { kind: "heading", title: "Atlasy", subtitle: "Folder · 12 services", depth: 0, pick: { layer: "" } },
    { kind: "layer", title: "III-1 Plochy", subtitle: "Map service · one layer", depth: 1, pick: { layer: "0" },
      takes: [{ id: "live", title: "Live", explains: "Fetched as you pan." },
        { id: "features", title: "Features", explains: "Downloaded in full." },
        { id: "image", title: "Image", explains: "A picture." }] }] },
  { id: "L", name: "Lavínová mapa", line: "proxy.geo.hiking.sk · MapProxy", rows: [
    { kind: "layer", title: "Snow depth", depth: 0, pick: { layer: "snow" } }] }] };

const seed = () => useViewer.setState({ mapID: "M", editToken: "t",
  portable: { id: "M", name: "Historická 2" }, servers: listing,
  words: { ...useViewer.getState().words, layerSymbols: "map,mountain.2", layerTints: "#111111", featureTints: "#222222" } });

describe("Add layer's Servers", () => {
  beforeEach(() => resetViewer());

  // 180 a server's name or address keeps all its rows; a layer's words keep only that layer
  it("narrows by a server's name or a layer's words, as the app's list does", () => {
    expect(matchingServers(listing.servers, "")).toEqual(listing.servers);
    expect(matchingServers(listing.servers, "geology")[0]?.rows).toHaveLength(2);
    expect(matchingServers(listing.servers, "snow").map((server) => server.id)).toEqual(["L"]);
    expect(matchingServers(listing.servers, "plochy")[0]?.rows.map((row) => row.title)).toEqual(["III-1 Plochy"]);
    expect(matchingServers(listing.servers, "nothing")).toEqual([]);
  });

  // 180 a card per server that folds its rows away; a tick counts at the foot and arms Add
  it("draws a card per server, folding, with the ticked count and Add at the foot", () => {
    seed();
    render(<AddLayer source="server" />);
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    const head = screen.getByRole("button", { name: /Geofond/ });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /III-1 Plochy/ }));
    expect(screen.getByRole("button", { name: /III-1 Plochy/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 layers selected")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add 1" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /III-1 Plochy/ })).toBeNull();
  });

  // 182 only what was changed is sent, so the phone's own choices stand for the rest
  it("sends only the tuning that differs from the phone's own choices", () => {
    const server = listing.servers[0]!;
    const row = server.rows[1]!;
    const untouched = { name: row.title, symbol: "", tintHex: "", allowsOffline: false, take: "live" };
    expect(tuneOf(row, server, untouched)).toEqual({});
    expect(tuneOf(row, server, { name: " Plochy ", symbol: "map", tintHex: "#222222", allowsOffline: true,
      take: "features" })).toEqual({ name: "Plochy", symbol: "map", tintHex: "#222222", allowsOffline: true,
      take: "features" });
    expect(tuneOf(row, server, { ...untouched, name: "  " })).toEqual({});
  });

  // 182 an Esri layer taken as features gets the feature inks, a picture the map's
  it("offers feature colours unless the layer is taken as a picture", () => {
    const words = { layerTints: "#111111", featureTints: "#222222" };
    expect(tintsFor("features", words)).toEqual(["#222222"]);
    expect(tintsFor("image", words)).toEqual(["#111111"]);
    expect(tintsFor(undefined, words)).toEqual(["#111111"]);
  });

  // 182 a ticked row's sliders open its page; Add sends that layer alone, tuned
  it("opens a ticked layer's page and adds it tuned", async () => {
    seed();
    const device = { name: "iPad", maps: [{ id: "M", name: "Historická 2", layers: [] }] };
    useViewer.setState({ device });
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("add-server-layers") ? { id: "M", name: "Historická 2" } : device)));
    vi.stubGlobal("fetch", fetcher);
    render(<AddLayer source="server" />);
    expect(screen.queryByRole("button", { name: "Adjust before adding" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /III-1 Plochy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adjust before adding" }));
    expect(screen.getByText("Address and login come from the server")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Plochy" } });
    fireEvent.click(screen.getByRole("radio", { name: "Features" }));
    expect(screen.getByText("Downloaded in full.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "#222222" }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/ }));
    await waitFor(() => expect(useViewer.getState().serverTuning).toBeNull());
    const asked = decodeURIComponent(String(fetcher.mock.calls.find(([url]) => url.includes("add-server-layers"))?.[0]));
    expect(JSON.parse(asked.split("picks=")[1]!)).toEqual([{ layer: "0", name: "Plochy", tintHex: "#222222",
      take: "features" }]);
    expect(useViewer.getState().serverPicks.size).toBe(0);
    vi.unstubAllGlobals();
  });

  // 182 Change goes back to the servers, the tick kept
  it("goes back to the servers from the layer page, the tick kept", () => {
    seed();
    render(<AddLayer source="server" />);
    fireEvent.click(screen.getByRole("button", { name: /III-1 Plochy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adjust before adding" }));
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("1 layers selected")).toBeTruthy();
  });

  // 3701 the site offers no offline download, so a layer's page has no switch for it
  it("leaves out Allow offline download where the target offers none", () => {
    seed();
    const offers = vi.spyOn(backend, "offers").mockImplementation((feature) => feature !== "offline");
    render(<AddLayer source="server" />);
    fireEvent.click(screen.getByRole("button", { name: /III-1 Plochy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Adjust before adding" }));
    expect(screen.getByText("Address and login come from the server")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Allow offline download" })).toBeNull();
    offers.mockRestore();
  });
});
