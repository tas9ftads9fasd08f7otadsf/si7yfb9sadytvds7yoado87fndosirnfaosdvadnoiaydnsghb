import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Gate, Offline, StatusBar, UndrawnNote } from "./Overlays";

describe("Offline", () => {
  beforeEach(resetViewer);

  // 45 shown only while the phone does not answer, and gone once it does
  it("stays while the phone is not connected", () => {
    render(<Offline />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => useViewer.setState({ connected: false }));
    expect(screen.getByRole("alert").textContent).toBe("Not connectedTrying to reconnect…");
    act(() => useViewer.setState({ connected: true }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("UndrawnNote", () => {
  beforeEach(resetViewer);

  // 85 the map says which layers a browser cannot draw, and why, in the app's words
  it("names each layer the style left out, and is gone when none is", () => {
    useViewer.setState({ mapID: "a", device: { name: "x", maps: [{ id: "a", name: "A", layers: [
      { id: "T1", name: "Trails", kind: "Tiles" }, { id: "H1", name: "Huts", kind: "Tiles" }] }] } });
    render(<UndrawnNote />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => useViewer.setState({ undrawn: new Set(["t1"]) }));
    expect(screen.getByRole("status").textContent).toBe("Trails This service doesn't answer browsers. The app draws it.");
    act(() => useViewer.setState({ undrawn: new Set() }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("StatusBar", () => {
  beforeEach(resetViewer);

  // 105 the pointer's place alone: no [ key hint, no second zoom
  it("writes where the pointer is and nothing else", () => {
    useViewer.setState({ pointerText: "48.14500, 17.10800" });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toBe("48.14500, 17.10800");
    expect(container.querySelector("kbd")).toBeNull();
  });
});

describe("Gate", () => {
  beforeEach(resetViewer);

  // 134 bug: a refused token left the editor up with no word of why no one could sign in
  it("says Apple refused the site, over nothing of the editor", () => {
    act(() => useViewer.setState({ standing: "refused" }));
    render(<Gate />);
    expect(screen.getByRole("dialog").className).toBe("closed");
    expect(screen.getByRole("heading").textContent).toBe("iCloud refused this site");
    expect(screen.queryByRole("button")).toBeNull();
  });

  // 134 a page that never reached its cloud has no one let in, so it shows no editor either
  it("covers the page while no one is let in and the cloud does not answer", () => {
    act(() => useViewer.setState({ standing: null, connected: false }));
    render(<Gate />);
    expect(screen.getByRole("dialog").className).toBe("closed");
    expect(screen.getByRole("heading").textContent).toBe("Not connected");
  });

  // 134 signed out, the editor is not seen behind the sign-in
  it("hides the editor behind the sign-in", () => {
    act(() => useViewer.setState({ standing: "signedOut" }));
    render(<Gate />);
    expect(screen.getByRole("dialog").className).toBe("closed");
    expect(screen.getByRole("heading").textContent).toBe("Sign in to iCloud");
  });
});
