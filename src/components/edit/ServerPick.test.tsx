import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ServerList } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { AddLayer, matchingServers } from "./AddLayer";

const listing: ServerList = { servers: [
  { id: "G", name: "Geofond", line: "ags.geology.sk · Esri / ArcGIS", symbol: "server.rack", rows: [
    { kind: "heading", title: "Atlasy", subtitle: "Folder · 12 services", depth: 0, pick: { layer: "" } },
    { kind: "layer", title: "III-1 Plochy", subtitle: "Map service · one layer", depth: 1, pick: { layer: "0" } }] },
  { id: "L", name: "Lavínová mapa", line: "proxy.geo.hiking.sk · MapProxy", rows: [
    { kind: "layer", title: "Snow depth", depth: 0, pick: { layer: "snow" } }] }] };

const seed = () => useViewer.setState({ mapID: "M", editToken: "t",
  portable: { id: "M", name: "Historická 2" }, servers: listing });

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
});
