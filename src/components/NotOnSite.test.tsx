import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "@/backend/types";
import type { SharedMap } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Layers } from "./edit/Layers";
import { Styling } from "./edit/Styling";
import { MapShelf } from "./MapShelf";
import { MapsPage } from "./MapsPage";
import { NavRail } from "./NavRail";

const fake = vi.hoisted(() => ({ offered: new Set<string>() }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: (feature: Feature) => fake.offered.has(feature) } };
});

const maps: SharedMap[] = [
  { id: "a", name: "Alps", layers: [] },
  { id: "b", name: "Bükk", layers: [], stackID: "F", stackName: "Hills" },
  { id: "c", name: "Cerová", layers: [], stackID: "F", stackName: "Hills" }
];

describe("the parts a target does not answer", () => {
  beforeEach(() => {
    resetViewer();
    fake.offered = new Set();
    useViewer.setState({ editToken: "t", mapID: "a", route: { screen: "maps" }, device: { name: "iCloud", maps } });
  });

  // 82 each of these called a write the site refuses, so the page said "Not connected"
  it("leaves out New map and Import", () => {
    render(<MapsPage />);
    expect(screen.queryByRole("button", { name: /New map/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();
  });

  it("shows the maps as a plain list with nothing to arrange", () => {
    render(<MapShelf maps={maps} />);
    expect(screen.queryByText("Name A–Z")).toBeNull();
    expect(screen.queryByRole("button", { name: /New folder/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("leaves out Servers in the rail", () => {
    render(<NavRail />);
    expect(screen.queryByRole("link", { name: "Servers" })).toBeNull();
  });

  it("leaves out Add layer", () => {
    render(<Layers portable={{ id: "a", name: "Alps", stack: [] }} />);
    expect(screen.queryByRole("button", { name: /Add layer/ })).toBeNull();
  });

  it("leaves out the pictures", () => {
    render(<Styling portable={{ id: "a", name: "Alps" }} />);
    expect(screen.queryByText("Choose a picture for this icon")).toBeNull();
    expect(screen.queryByRole("button", { name: /preview/i })).toBeNull();
  });

  it("offers them all where the target answers them", () => {
    fake.offered = new Set(["newMap", "shelf", "servers", "addLayer", "pictures"]);
    render(<><MapsPage /><NavRail /><Layers portable={{ id: "a", name: "Alps", stack: [] }} />
      <Styling portable={{ id: "a", name: "Alps" }} /></>);
    expect(screen.getByRole("button", { name: /New map/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Servers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add layer/ })).toBeTruthy();
    expect(screen.getByText("Choose a picture for this icon")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Name A–Z/ })).toBeTruthy();
  });
});
