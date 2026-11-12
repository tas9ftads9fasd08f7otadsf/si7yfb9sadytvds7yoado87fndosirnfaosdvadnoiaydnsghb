import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapsPage } from "./MapsPage";

const device = (minimumVersion: object | null): Device => ({ name: "iPad", appVersion: "0.20.0", maps: [
  { id: "a", name: "Tatras", layers: [{ id: "l", name: "Trails", kind: "Vector" }], minimumVersion }] });

const show = (state: object) => useViewer.setState({ mapID: "a", ...state });

describe("MapsPage", () => {
  beforeEach(resetViewer);

  it("names a new enough viewer quietly", () => {
    show({ device: device({ browser: "0.19.0" }) });
    render(<MapsPage />);
    expect(screen.getByText("Needs browser viewer 0.19.0 or later")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when the phone's viewer is too old", () => {
    show({ device: device({ browser: "0.30.0" }) });
    render(<MapsPage />);
    expect(screen.getByRole("alert").textContent).toContain("Update Riki Maps");
  });

  it("gives a browser that may only look no switches and no Edit map", () => {
    show({ device: device(null) });
    render(<MapsPage />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("Edit map")).toBeNull();
  });

  it("asks for the password where the phone allows editing", () => {
    show({ device: device(null), edits: true });
    render(<MapsPage />);
    expect(screen.getByLabelText("Edit password")).toBeTruthy();
  });

  it("gives an editing browser its switches", () => {
    show({ device: device(null), editToken: "t" });
    render(<MapsPage />);
    expect(screen.getByRole("switch", { name: "Trails" })).toBeTruthy();
    expect(screen.getByText("Edit map")).toBeTruthy();
  });

  // 41 an open map's side bar is the map alone
  it("leaves All maps out under an open map", () => {
    show({ device: device(null), editToken: "t", route: { screen: "map", map: "a" } });
    render(<MapsPage />);
    expect(screen.getByText("Edit map")).toBeTruthy();
    expect(screen.queryByText("All maps")).toBeNull();
    expect(screen.queryByText("New map")).toBeNull();
  });

  // 41 while the page settles on a map, and on a map's other screens too
  it.each([{ screen: "home" }, { screen: "edit", map: "a", tab: "layers" }])("leaves All maps out on $screen", (route) => {
    show({ device: device(null), route });
    render(<MapsPage />);
    expect(screen.queryByText("All maps")).toBeNull();
  });

  // 41 the Maps and Servers screens list them, with New map for an editing browser
  it.each([{ screen: "maps" }, { screen: "servers" }])("lists All maps on $screen", (route) => {
    show({ device: device(null), editToken: "t", route });
    render(<MapsPage />);
    expect(screen.getByText("All maps")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tatras/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("New map")).toBeTruthy();
  });

  // 41 with no map on screen there is nothing to hide the list behind
  it("lists All maps when no map is open", () => {
    useViewer.setState({ device: device(null), route: { screen: "home" } });
    render(<MapsPage />);
    expect(screen.getByText("All maps")).toBeTruthy();
  });

  it("says so when nothing can be shared", () => {
    useViewer.setState({ device: { name: "iPad", maps: [] } });
    render(<MapsPage />);
    expect(screen.getByText("No map here can be shared.")).toBeTruthy();
  });
});
