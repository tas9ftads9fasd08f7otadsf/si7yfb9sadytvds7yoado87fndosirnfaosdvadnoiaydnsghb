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

  it("says so when nothing can be shared", () => {
    useViewer.setState({ device: { name: "iPad", maps: [] } });
    render(<MapsPage />);
    expect(screen.getByText("No map here can be shared.")).toBeTruthy();
  });
});
