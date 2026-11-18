import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflinePlan } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Offline, formatBytes } from "./Offline";

const plan: OfflinePlan = { area: "43 km²", box: [17, 48, 17.2, 48.2], minZoom: 8, maxZoom: 19, zoom: 16,
  zoomLabel: "z 16 · street level", limits: "", toFetch: "≈ 900 tiles to fetch", held: "None of it is here yet",
  free: "2 GB free", total: "≈ 9 MB", exceedsSpace: false, isQueued: false, cancel: null,
  rows: [{ id: "T", name: "Trails", isDownloadable: true, isIncluded: true, detail: "https://t/{z}", bytes: 9_000_000,
    stored: 0 },
  { id: "H", name: "Huts", isDownloadable: false, isIncluded: false, detail: "Uploaded files · nothing to download",
    bytes: 0, stored: 2000, storedLine: "2 KB stored", discard: { ask: "Delete what Huts has stored?",
      note: "This frees 2 KB. The layer stays on the map and can download again." } }] };

const never = () => new Promise<Response>(() => {});

describe("Offline", () => {
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ mapID: "a", editToken: "t", offline: plan, offlineAsk: { box: plan.box, chosen: false } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 57 the stored rows are listed at once, Download tiles folded until asked for
  it("lists what is stored and opens Download tiles on asking", () => {
    vi.stubGlobal("fetch", vi.fn(never));
    render(<Offline />);
    expect(screen.getByText("2 KB stored")).toBeTruthy();
    expect(screen.queryByText("Area to download")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Download tiles" }));
    expect(screen.getByText("43 km²")).toBeTruthy();
    expect(screen.getByText("Uploaded files · nothing to download")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  // 57 Delete asks Edit map's question first; a no sends nothing
  it("asks before deleting what a layer has stored", () => {
    const asked = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", asked);
    const confirming = vi.fn(() => false);
    vi.stubGlobal("confirm", confirming);
    render(<Offline />);
    asked.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Delete what Huts has stored?" }));
    expect(confirming).toHaveBeenCalledWith(expect.stringContaining("This frees 2 KB."));
    expect(asked).not.toHaveBeenCalled();
    confirming.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete what Huts has stored?" }));
    expect(String(asked.mock.calls[0]?.[0])).toContain("/discard-stored?layer=H");
  });

  // 57 a download that does not fit, or one already running, cannot be started again
  it("offers no Download for too little room or a running download", () => {
    vi.stubGlobal("fetch", vi.fn(never));
    useViewer.setState({ offlineOpen: true, offline: { ...plan, exceedsSpace: true } });
    const { unmount } = render(<Offline />);
    expect((document.getElementById("startOfflineDownload") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Not enough free space for this selection.")).toBeTruthy();
    unmount();
    useViewer.setState({ offline: { ...plan, isQueued: true, cancel: "Cancel this download" } });
    render(<Offline />);
    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel this download" })).toBeTruthy();
  });

  // 57 a row's own size, as short as the phone writes one
  it("writes a size short", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2000)).toBe("2.0 KB");
    expect(formatBytes(12_400_000)).toBe("12 MB");
  });
});
