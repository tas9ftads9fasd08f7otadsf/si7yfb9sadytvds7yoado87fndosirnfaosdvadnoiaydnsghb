import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { TileSource } from "./TileSource";

describe("TileSource", () => {
  beforeEach(resetViewer);

  // 43 offered only where the phone allows it
  it("is not offered unless the phone allows loading from the source", () => {
    render(<TileSource />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    act(() => useViewer.setState({ directAllowed: true }));
    expect(screen.getByRole("radiogroup", { name: "Load tiles" })).toBeTruthy();
  });

  // 43 through the phone until chosen otherwise; the note says what still comes through it
  it("starts through the phone and switches to the source and back", () => {
    useViewer.setState({ directAllowed: true });
    render(<TileSource />);
    const phone = screen.getByRole("radio", { name: "Through the phone" });
    const source = screen.getByRole("radio", { name: "From their source" });
    expect(phone.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/still come through it/)).toBeNull();
    fireEvent.click(source);
    expect(useViewer.getState().tilesDirect).toBe(true);
    expect(source.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Layers that need the phone's keys still come through it.")).toBeTruthy();
    fireEvent.click(phone);
    expect(useViewer.getState().tilesDirect).toBe(false);
  });
});
