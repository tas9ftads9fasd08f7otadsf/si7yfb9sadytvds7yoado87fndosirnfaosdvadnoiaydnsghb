import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
