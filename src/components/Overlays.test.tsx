import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Offline } from "./Overlays";

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
