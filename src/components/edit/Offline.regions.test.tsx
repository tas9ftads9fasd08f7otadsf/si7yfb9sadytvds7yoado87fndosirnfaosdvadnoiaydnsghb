import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Offline } from "./Offline";

describe("Offline's regions", () => {
  beforeEach(() => {
    resetViewer();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    useViewer.setState({ mapID: "a", editToken: "t", regionList: {
      drawn: [{ id: "r1", name: "Bratislavský kraj", box: [0, 0, 1, 1] }],
      downloadable: [{ id: "r2", name: "Trnavský kraj", box: [0, 0, 1, 1] }] } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 111 W9: the map's regions as a table, on the phone or with a Download
  it("lists the map's regions with a Download for those the phone lacks", () => {
    render(<Offline />);
    const table = screen.getByRole("table", { name: "Regions" });
    expect(within(table).getByText("Bratislavský kraj").closest("[role=row]")?.textContent).toContain("On the phone");
    const trnava = within(table).getByText("Trnavský kraj").closest("[role=row]") as HTMLElement;
    act(() => fireEvent.click(within(trnava).getByRole("button", { name: "Download" })));
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("download?region=r2");
  });

  // 141 W9: a drawn region says how much of it the phone holds, beside "On the phone"; one to download has no size
  it("shows a drawn region's size where the phone sent one", () => {
    useViewer.setState({ regionList: { drawn: [{ id: "r1", name: "Bratislavský kraj", box: [0, 0, 1, 1], bytes: 412_000_000 }],
      downloadable: [{ id: "r2", name: "Trnavský kraj", box: [0, 0, 1, 1] }] } });
    render(<Offline />);
    const drawn = screen.getByText("Bratislavský kraj").closest("[role=row]") as HTMLElement;
    expect(drawn.textContent).toContain("412 MB");
    expect(drawn.textContent).toContain("On the phone");
    expect((screen.getByText("Trnavský kraj").closest("[role=row]") as HTMLElement).textContent).not.toMatch(/MB/);
  });

  // 141 from an older phone the row reads "On the phone" and no size
  it("keeps On the phone and no size from an older phone", () => {
    render(<Offline />);
    const drawn = screen.getByText("Bratislavský kraj").closest("[role=row]") as HTMLElement;
    expect(drawn.textContent).toContain("On the phone");
    expect(drawn.querySelector(".region-size")).toBeNull();
  });
});
