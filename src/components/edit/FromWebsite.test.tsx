import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { FromWebsite } from "./AddLayer";

describe("From a website", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 189 the phone reads the page; a picked server hands its address and the page it came from to the form
  it("lists the servers a page uses and hands one picked to the form", async () => {
    const found = { page: "https://maps.test/", found: [{ id: "https://gis.test/MapServer/2", title: "Forest", kind: "arcgis",
      kindTitle: "Esri", host: "gis.test", symbol: "globe", address: "https://gis.test/MapServer", headerNames: [] }] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(found)));
    vi.stubGlobal("fetch", fetcher);
    useViewer.setState({ editToken: "t" });
    const onPick = vi.fn();
    render(<FromWebsite onPick={onPick} />);
    const find = screen.getByRole("button", { name: /Find servers/ }) as HTMLButtonElement;
    expect(find.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "From a website" }), { target: { value: " https://maps.test/ " } });
    fireEvent.click(find);
    await waitFor(() => expect(screen.getByRole("button", { name: "Forest, Esri" })).toBeTruthy());
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toBe("/riki/v1/find-servers?page=https%3A%2F%2Fmaps.test%2F");
    fireEvent.click(screen.getByRole("button", { name: "Forest, Esri" }));
    expect(onPick).toHaveBeenCalledWith(found.found[0], "https://maps.test/");
  });
});
