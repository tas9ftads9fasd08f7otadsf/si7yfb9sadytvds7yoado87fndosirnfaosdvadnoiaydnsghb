import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Boot, Gate, Offline, StatusBar, UndrawnNote } from "./Overlays";

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

  // 169 bug #166: the sign-in card showed a person's icon under the app's own
  it("shows the app's icon on the sign-in card and no person's", () => {
    act(() => useViewer.setState({ standing: "signedOut" }));
    render(<Gate />);
    expect(document.querySelector("#gate .gate-icon")).not.toBeNull();
    expect(document.querySelector("#gateMark")).toBeNull();
  });
});

describe("Boot", () => {
  beforeEach(resetViewer);

  // 137 bug: the loading screen said only that it loads, however long the first read took
  it("says each part of the first read with how much is done, a finished part marked", () => {
    act(() => useViewer.setState({ loading: { engine: { done: 7_277_739, total: 7_277_739 },
      zones: { done: 1, total: 3 }, records: 412, files: 12 } }));
    render(<Boot />);
    const steps = [...document.querySelectorAll("#bootSteps li")];
    expect(steps.map((each) => each.textContent)).toEqual(["Map engine: 7.3 of 7.3 MB", "iCloud zones: 1 of 3",
      "Records read: 412", "Files downloaded: 12"]);
    expect(steps.map((each) => each.className)).toEqual(["done", "", "", ""]);
  });

  // 137 a server that does not say the size still has the megabytes counted
  it("counts the engine's megabytes where the size is not known", () => {
    act(() => useViewer.setState({ loading: { engine: { done: 2_500_000, total: null }, records: 0, files: 0 } }));
    render(<Boot />);
    expect(document.querySelector("#bootSteps")?.textContent).toBe("Map engine: 2.5 MB");
  });

  // 137 bug: a read that failed was tried again in silence, so the page seemed stuck
  it("says why the read stopped", () => {
    act(() => useViewer.setState({ loadFailed: "An asset of own-tatras answered 403" }));
    render(<Boot />);
    expect(screen.getByRole("alert").textContent)
      .toBe("Loading stopped: An asset of own-tatras answered 403. Trying again…");
  });
});
