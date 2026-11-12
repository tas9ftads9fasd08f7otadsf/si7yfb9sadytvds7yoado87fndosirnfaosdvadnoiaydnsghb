import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Device } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapsPage } from "./MapsPage";
import { Boot, LoadingBar, Skeleton } from "./Overlays";

const device: Device = { name: "iPad", maps: [{ id: "a", name: "Tatras", layers: [] }] };

describe("loading", () => {
  beforeEach(resetViewer);

  // 42 the page says it is loading until the phone's maps are read
  it("says the app is loading until the maps arrive", () => {
    render(<Boot />);
    expect(screen.getByRole("status").textContent).toBe("Loading Riki Maps…");
    act(() => useViewer.setState({ device }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  // 42 the gate and the offline banner are not hidden behind it
  it.each([{ standing: "waiting" }, { standing: "removed" }, { connected: false }])("steps aside for %o", (state) => {
    useViewer.setState(state as never);
    render(<Boot />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // 42 a bar runs while a map is read or its style and tiles are on their way
  it.each([{ picking: true }, { mapBusy: true }])("shows the loading bar while %o", (state) => {
    render(<LoadingBar />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => useViewer.setState(state));
    expect(screen.getByRole("progressbar", { name: "Loading…" })).toBeTruthy();
    act(() => useViewer.setState({ picking: false, mapBusy: false }));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  // 42 rows pulse where a list is still to come
  it("draws pulsing rows for a list not yet read", () => {
    render(<Skeleton rows={2} />);
    const rows = screen.getByRole("status", { name: "Loading…" }).querySelectorAll(".row.pending");
    expect(rows).toHaveLength(2);
  });

  // 42 the map's card pulses while the map is read, and its picture's place until the picture is
  it("pulses the map's card while it is read and its picture until it arrives", () => {
    useViewer.setState({ device, mapID: "a", picking: true, route: { screen: "map", map: "a" } });
    const { container } = render(<MapsPage />);
    expect(container.querySelector(".hero")?.className).toBe("hero pending");
    expect(container.querySelector(".hero .picture.pending")).toBeTruthy();
    expect(container.querySelector(".hero .mark.pending")).toBeTruthy();
    act(() => useViewer.setState({ picking: false, pictures: new Map([["a", {}]]) }));
    expect(container.querySelector(".hero")?.className).toBe("hero");
    expect(container.querySelector(".pending")).toBeNull();
  });
});
