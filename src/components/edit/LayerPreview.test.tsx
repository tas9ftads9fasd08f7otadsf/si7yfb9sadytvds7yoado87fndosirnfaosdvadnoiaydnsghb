import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { LayerPreview, moved, zoomed } from "./LayerPreview";

describe("LayerPreview", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 190 panning wraps round the world and stops at its top and bottom rows
  it("moves by whole tiles, wrapping east and west", () => {
    expect(moved({ z: 2, x: 3, y: 1 }, 1, 0)).toEqual({ z: 2, x: 0, y: 1 });
    expect(moved({ z: 2, x: 0, y: 0 }, -1, -1)).toEqual({ z: 2, x: 3, y: 0 });
    expect(moved({ z: 2, x: 1, y: 3 }, 0, 2)).toEqual({ z: 2, x: 1, y: 3 });
  });

  // 190 zoom stays inside the zooms the layer publishes
  it("zooms over the same ground, within the layer's zooms", () => {
    const zooms = { minZoom: 6, maxZoom: 8 };
    expect(zoomed({ z: 7, x: 70, y: 44 }, 1, zooms)).toEqual({ z: 8, x: 140, y: 88 });
    expect(zoomed({ z: 7, x: 70, y: 44 }, -1, zooms)).toEqual({ z: 6, x: 35, y: 22 });
    expect(zoomed({ z: 8, x: 1, y: 1 }, 1, zooms)).toEqual({ z: 8, x: 1, y: 1 });
  });

  // 190 as the app's read row: the dot, Read or No reply, and Read again asks once more
  it("reads the layer, draws its picture, and reads it again", async () => {
    const answers = [{ works: false, said: "Server replied 404" },
      { works: true, said: "256 px", picture: { z: 7, x: 70, y: 44, minZoom: 0, maxZoom: 17 } }];
    const fetcher = vi.fn(async (url: string) => (url.includes("z=")
      ? new Response(new Uint8Array([0x89, 0x50]), { headers: { "Content-Type": "image/png" } })
      : new Response(JSON.stringify(answers.shift()))));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("URL", class extends URL {
      static override createObjectURL = () => "blob:tile";
      static override revokeObjectURL = () => undefined;
    });
    useViewer.setState({ editToken: "t" });
    const { container } = render(<LayerPreview server="s" keyed={{ layer: "0" }} />);
    await waitFor(() => expect(screen.getByText("No reply from the server")).toBeTruthy());
    expect(container.querySelectorAll(".tile")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));
    await waitFor(() => expect(screen.getByText("Read")).toBeTruthy());
    expect(container.querySelectorAll(".tile")).toHaveLength(15);
    await waitFor(() => expect(container.querySelector(".tile[data-tile='7/70/44']")?.className).toContain("drawn"));
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("/riki/v1/server-preview?server=s&layer=0");
  });
});
