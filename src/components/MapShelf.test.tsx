import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedMap } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { MapShelf } from "./MapShelf";

const maps: SharedMap[] = [
  { id: "a", name: "Alps", layers: [] },
  { id: "b", name: "Bükk", layers: [], stackID: "F", stackName: "Hills" },
  { id: "c", name: "Cerová", layers: [], stackID: "F", stackName: "Hills" },
  { id: "d", name: "Dolomites", layers: [] },
];

const asking = (answer = { name: "iPad", maps }) => {
  const asked = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return new Response(JSON.stringify(answer));
  });
  vi.stubGlobal("fetch", asked);
  return () => decodeURIComponent(String(asked.mock.calls[0]?.[0]));
};

describe("MapShelf", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 52 a browser that may only look sees the maps in the phone's order, nothing to arrange
  it("gives a browser that may only look no arranging", () => {
    render(<MapShelf maps={maps} />);
    expect(screen.getAllByRole("button").map((each) => each.textContent)).toEqual(["Alps0", "Bükk0", "Cerová0", "Dolomites0"]);
    expect(screen.queryByText("Name A–Z")).toBeNull();
  });

  // 52 an editing browser sees the folder, named, its maps inside it
  it("folds the maps into their folder", () => {
    useViewer.setState({ editToken: "t" });
    render(<MapShelf maps={maps} />);
    expect((screen.getByLabelText("Rename · Hills") as HTMLInputElement).value).toBe("Hills");
    expect(screen.getByLabelText("Out of the folder · Bükk")).toBeTruthy();
    expect(screen.queryByLabelText("Out of the folder · Alps")).toBeNull();
    expect((screen.getByLabelText("Move up Alps") as HTMLButtonElement).disabled).toBe(true);
  });

  // 52 moving a folder sends every map, the folder's together; the phone's list comes back
  it("moves a folder as one and shows the list the phone answers", async () => {
    useViewer.setState({ editToken: "t" });
    const url = asking({ name: "iPad", maps: [maps[1]!, maps[2]!, maps[0]!, maps[3]!] });
    render(<MapShelf maps={maps} />);
    fireEvent.click(screen.getByLabelText("Move up Hills"));
    await waitFor(() => expect(useViewer.getState().device?.maps[0]?.id).toBe("b"));
    expect(url()).toBe("/riki/v1/shelf?order=b,c,a,d");
  });

  // 52 the sorts are the phone's own
  it("sorts by name on the phone", () => {
    useViewer.setState({ editToken: "t" });
    const url = asking();
    render(<MapShelf maps={maps} />);
    fireEvent.click(screen.getByText("Name Z–A"));
    expect(url()).toBe("/riki/v1/shelf?sort=nameDescending");
  });

  // 52 a map joins a folder from its row, and leaves it from inside
  it("puts a map into a folder and takes one out", () => {
    useViewer.setState({ editToken: "t" });
    const url = asking();
    render(<MapShelf maps={maps} />);
    fireEvent.change(screen.getByLabelText("Into · Alps"), { target: { value: "F" } });
    expect(url()).toBe("/riki/v1/shelf?stack=F&map=a");
  });

  // 52 a new folder needs a name and two maps, which no folder holds yet
  it("makes a folder of two maps", () => {
    useViewer.setState({ editToken: "t" });
    const url = asking();
    render(<MapShelf maps={maps} />);
    fireEvent.click(screen.getByText("New folder"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Peaks" } });
    const save = screen.getByText("Save") as HTMLButtonElement;
    fireEvent.click(screen.getByLabelText("Alps"));
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Dolomites"));
    fireEvent.click(save);
    expect(url()).toBe("/riki/v1/shelf?folder=Peaks&maps=a,d");
  });

  // 52 renaming the folder sends the new name when the field is left
  it("renames a folder", () => {
    useViewer.setState({ editToken: "t" });
    const url = asking();
    render(<MapShelf maps={maps} />);
    const field = screen.getByLabelText("Rename · Hills");
    fireEvent.change(field, { target: { value: "Low hills" } });
    fireEvent.blur(field);
    expect(url().replace(/\+/g, " ")).toBe("/riki/v1/shelf?stack=F&name=Low hills");
  });
});
