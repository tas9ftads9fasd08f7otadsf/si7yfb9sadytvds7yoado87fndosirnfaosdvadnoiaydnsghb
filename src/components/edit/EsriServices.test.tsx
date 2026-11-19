import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EsriListing } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { EsriServices } from "./EsriServices";

const listing: EsriListing = { services: [{ id: "G", name: "Geology", subtitle: "gis.example.org · 2 layers · Features",
  detail: "1 of 2 in this map · Features", url: "https://gis.example.org/Geology/MapServer", take: "Features",
  readAgain: "Read what it publishes", footnote: "A layer ticked here is added and its features are downloaded in the queue.",
  style: "S", layers: [{ id: 0, name: "Rocks", symbol: "mappin", subtitle: "Areas · 40", layer: "L" },
    { id: 1, name: "Shading", symbol: "mappin", subtitle: "The service does not let this one be asked",
      refusal: "The service does not let this one be asked" }] }] };

const sent = () => {
  const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", asked);
  return () => asked.mock.calls.map((call) => String(call[0]));
};

describe("EsriServices", () => {
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ mapID: "a", editToken: "t", esri: listing });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 67 each service as Edit map rows it; its page opens under it
  it("lists the services and opens one's page", () => {
    sent();
    render(<EsriServices />);
    expect(screen.getByText("1 of 2 in this map · Features")).toBeTruthy();
    expect(screen.queryByText("Taken as")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Geology/ }));
    expect(screen.getByText("https://gis.example.org/Geology/MapServer")).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Draw Rocks on this map" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("switch", { name: "Draw Shading on this map" }) as HTMLInputElement).disabled).toBe(true);
  });

  // 67 taking a layer off asks first in the phone's words; a no sends nothing
  it("asks before taking a layer off", () => {
    const urls = sent();
    const confirming = vi.fn(() => false);
    vi.stubGlobal("confirm", confirming);
    useViewer.setState({ esriOpen: "G" });
    render(<EsriServices />);
    fireEvent.click(screen.getByRole("switch", { name: "Draw Rocks on this map" }));
    expect(confirming).toHaveBeenCalledWith(expect.stringContaining("Take Rocks off the map?"));
    expect(urls().some((url) => url.includes("/esri-service?"))).toBe(false);
  });

  // 67 Read again and Forget each name the service
  it("reads the service again and forgets it", () => {
    const urls = sent();
    useViewer.setState({ esriOpen: "G" });
    render(<EsriServices />);
    fireEvent.click(screen.getByRole("button", { name: "Read what it publishes" }));
    fireEvent.click(screen.getByRole("button", { name: "Forget this service" }));
    const changes = urls().filter((url) => url.includes("/esri-service?"));
    expect(changes[0]).toContain("service=G&read=1");
    expect(changes[1]).toContain("service=G&forget=1");
  });

  // 67 a map with no service drawn on shows no card
  it("shows nothing without a service", () => {
    sent();
    useViewer.setState({ esri: { services: [] } });
    const { container } = render(<EsriServices />);
    expect(container.textContent).toBe("");
  });
});
