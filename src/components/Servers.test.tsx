import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerList } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { ServerCards, ServerPage } from "./Servers";

const servers: ServerList = { servers: [{
  id: "s", name: "ZBGIS", line: "Esri / ArcGIS · 1 service", address: "https://zbgis.test/arcgis/rest/services",
  kind: "Esri / ArcGIS", facts: [{ name: "Version", value: "11.1" }],
  rows: [{ kind: "heading", title: "Base", depth: 0, pick: { layer: "" } },
    { kind: "layer", title: "Parcels", depth: 1, pick: { layer: "0" } }] }] };

describe("Servers", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 27 TestFlight AApG: the card offers View, not its layers
  it("lists each server as a card with View, only to a browser that may edit", () => {
    useViewer.setState({ servers });
    const { rerender } = render(<ServerCards />);
    expect(screen.queryByText("ZBGIS")).toBeNull();
    useViewer.setState({ editToken: "t" });
    rerender(<ServerCards />);
    expect(screen.getByText("ZBGIS")).toBeTruthy();
    expect(screen.queryByText("Parcels")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View ZBGIS" }));
    expect(useViewer.getState().serverID).toBe("s");
    expect(useViewer.getState().serverPart).toBe("layers");
  });

  // 27 TestFlight AL9n: the page in the phone's parts, Layers first
  it("opens on Layers, and General and Sharing show what the phone's do", () => {
    useViewer.setState({ servers, editToken: "t", serverID: "s" });
    render(<ServerPage />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Layers", "General", "Sharing"]);
    expect(screen.getByText("Parcels")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "General" }));
    expect(screen.getByText("https://zbgis.test/arcgis/rest/services")).toBeTruthy();
    expect(screen.getByText("11.1")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Sharing" }));
    expect(screen.getByRole("button", { name: /Export/ })).toBeTruthy();
  });

  // 183 the name, mark and background go to the phone as picked, its answer redrawing the page
  it("changes the server's look on General, as the phone's Look does", async () => {
    const renamed: ServerList = { servers: [{ ...servers.servers[0]!, name: "ZBGIS SK", symbol: "globe", iconTintHex: "#B5D8F2" }] };
    const fetcher = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(renamed)));
    vi.stubGlobal("fetch", fetcher);
    useViewer.setState({ servers, editToken: "t", serverID: "s", serverPart: "general",
      words: { ...useViewer.getState().words, serverSymbols: "server.rack,globe", iconTints: "#B5D8F2" } });
    render(<ServerPage />);
    fireEvent.click(screen.getByRole("button", { name: "globe" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "globe" }).getAttribute("aria-pressed")).toBe("true"));
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("/riki/v1/servers/s/edit?symbol=globe");
    fireEvent.click(screen.getByRole("button", { name: "Automatic" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(String(fetcher.mock.calls[1]?.[0])).toBe("/riki/v1/servers/s/edit?tint=");
  });

  // 183 Duplicate opens the copy; Delete server asks a second press, then leaves the page
  it("duplicates into the copy, and deletes only on a second press", async () => {
    const copy = { ...servers.servers[0]!, id: "c", name: "ZBGIS copy" };
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/duplicate")
      ? { servers: [...servers.servers, copy], opened: "c" } : { servers: [copy] })));
    vi.stubGlobal("fetch", fetcher);
    useViewer.setState({ servers, editToken: "t", serverID: "s", serverPart: "general" });
    render(<ServerPage />);
    fireEvent.click(screen.getByRole("button", { name: /Duplicate/ }));
    await waitFor(() => expect(useViewer.getState().serverID).toBe("c"));
    expect(useViewer.getState().serverPart).toBe("general");
    fireEvent.click(screen.getByRole("button", { name: "Delete server ZBGIS copy" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Layers already taken from it stay on the maps that took them")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to delete ZBGIS copy" }));
    await waitFor(() => expect(useViewer.getState().serverID).toBeNull());
    expect(String(fetcher.mock.calls[1]?.[0])).toBe("/riki/v1/servers/c/delete");
  });
});
