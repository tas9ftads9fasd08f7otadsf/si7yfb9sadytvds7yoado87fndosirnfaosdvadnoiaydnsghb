import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Traffic } from "./Traffic";

describe("Traffic", () => {
  beforeEach(resetViewer);

  // 46 nothing until measured, then the phone's speed and the other sources', named for a reader
  it("shows the speed from the phone and from other sources", () => {
    render(<Traffic />);
    expect(screen.queryByRole("group")).toBeNull();
    act(() => useViewer.setState({ traffic: { phone: 120_000, other: 2_400_000 } }));
    const chip = screen.getByRole("group", { name: "From the phone: 120 KB/s · From other sources: 2.4 MB/s" });
    expect(chip.textContent).toBe("120 KB/s2.4 MB/s");
  });
});
