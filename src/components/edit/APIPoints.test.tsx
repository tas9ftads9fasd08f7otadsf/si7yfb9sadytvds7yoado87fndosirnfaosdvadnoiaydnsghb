import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COFFEE_TRIP } from "@/lib/coffee-trip.fixture";
import type { APIRead, APIReading } from "@/lib/types";
import { resetViewer } from "@/store/viewer";
import { APIKeys } from "./APIKeys";
import { APIPoints } from "./APIPoints";

const start: APIReading = { itemsPath: "", spelling: "decimal", latitudeKey: "", longitudeKey: "", positionKey: "" };

beforeEach(() => resetViewer());
afterEach(cleanup);

describe("Points page", () => {
  // 171 walk into cafes and read the points from it, then Up goes back
  it("walks into a list, reads the points from it and goes Up", () => {
    const pick = vi.fn();
    render(<APIPoints answer={COFFEE_TRIP} reading={start} pick={pick} onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "Up" })).toBeNull();
    expect(document.querySelector("#apiReadFrom")).toBeNull();
    fireEvent.click(within(document.querySelector("[data-node='cafes']") as HTMLElement).getByRole("button"));
    expect(document.querySelector("[data-step='cafes']")?.getAttribute("aria-current")).toBe("location");
    expect(document.querySelector("[data-node='cafes.city'] small")?.textContent).toBe("2 keys");
    fireEvent.click(screen.getByRole("button", { name: "Read the points from this list" }));
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ itemsPath: "cafes", shownKeys: [], filter: null }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    expect(document.querySelector("[data-node='cafes']")).toBeTruthy();
  });

  // 171 a list that is already the source says so instead of offering to read from it
  it("says the points are read from the list it is on", () => {
    render(<APIPoints answer={COFFEE_TRIP} reading={{ ...start, itemsPath: "cafes" }} pick={() => {}} onDone={() => {}} />);
    expect(document.querySelector("[data-node='cafes']")).toBeTruthy();
    fireEvent.click(within(document.querySelector("[data-node='cafes']") as HTMLElement).getByRole("button"));
    expect(screen.getByText("The points are read from this list")).toBeTruthy();
    expect(document.querySelector("#apiReadFrom")).toBeNull();
  });

  // 171 a key is used as the name, and one already used shows its role
  it("uses a key as a role, and shows the role a key has", () => {
    const pick = vi.fn();
    const reading = { ...start, itemsPath: "cafes", nameKey: "name" };
    render(<APIPoints answer={COFFEE_TRIP} reading={reading} pick={pick} onDone={() => {}} />);
    fireEvent.click(within(document.querySelector("[data-node='cafes']") as HTMLElement).getByRole("button"));
    expect((screen.getByLabelText("Use as · name") as HTMLSelectElement).value).toBe("name");
    fireEvent.change(screen.getByLabelText("Use as · latLng"), { target: { value: "place" } });
    expect(pick).toHaveBeenCalledWith({ spelling: "position", positionKey: "latLng", positionOrder: null });
    expect(screen.queryByLabelText("Use as · city")).toBeNull();
  });

  // 171 a list of lists and an empty list are walked, or not
  it("opens a list of lists and does not open an empty list", () => {
    render(<APIPoints answer={COFFEE_TRIP} reading={start} pick={() => {}} onDone={() => {}} />);
    expect((within(document.querySelector("[data-node='giveaways']") as HTMLElement).getByRole("button") as HTMLButtonElement).disabled)
      .toBe(true);
    fireEvent.click(within(document.querySelector("[data-node='grid']") as HTMLElement).getByRole("button"));
    expect(document.querySelectorAll("[data-node^='grid.']")).toHaveLength(2);
    expect(document.querySelector("#apiReadFrom")).toBeNull();
  });
});

describe("Keys and filter page", () => {
  const read = { reading: null, paths: [], keys: [], points: 3, name: "x", said: "", answer: COFFEE_TRIP } as APIRead;
  const cafes: APIReading = { ...start, itemsPath: "cafes", spelling: "position", positionKey: "latLng", nameKey: "name" };

  // 171 All keys, What's used, Picked
  it("lists the keys of the points by path and narrows them to what is used", () => {
    render(<APIKeys read={read} reading={cafes} pick={() => {}} onDone={() => {}} />);
    expect(document.querySelectorAll("#apiKeyList [data-key]")).toHaveLength(8);
    expect(document.querySelector("[data-key='owner.contact.email']")).toBeTruthy();
    expect(document.querySelector("[data-key='latLng'] small")?.textContent).toBe("Place · 47.49, 19.05");
    fireEvent.click(screen.getByRole("tab", { name: "What's used" }));
    expect([...document.querySelectorAll("#apiKeyList [data-key]")].map((row) => row.getAttribute("data-key")))
      .toEqual(["latLng", "name"]);
  });

  // 171 a switch hides a key from a tap
  it("switches a key off for a tap", () => {
    const pick = vi.fn();
    render(<APIKeys read={read} reading={cafes} pick={pick} onDone={() => {}} />);
    fireEvent.click(within(document.querySelector("[data-key='note']") as HTMLElement).getByRole("switch"));
    expect((pick.mock.calls[0]![0] as APIReading).shownKeys).toHaveLength(7);
    expect((pick.mock.calls[0]![0] as APIReading).shownKeys).not.toContain("note");
  });

  // 171 only points where a key is, isn't, contains or is not empty
  it("writes a rule and says how many points it keeps", () => {
    const pick = vi.fn();
    const { rerender } = render(<APIKeys read={read} reading={cafes} pick={pick} onDone={() => {}} />);
    expect(document.querySelector("#apiKept")?.textContent).toBe("Points are drawn only where every rule holds.");
    fireEvent.click(document.querySelector("#apiAddRule") as HTMLElement);
    expect(pick).toHaveBeenLastCalledWith({ filter: [{ key: "", op: "is", value: "" }] });
    const filtered = { ...cafes, filter: [{ key: "tags", op: "contains" as const, value: "wifi" }] };
    rerender(<APIKeys read={read} reading={filtered} pick={pick} onDone={() => {}} />);
    expect(document.querySelector("#apiKept")?.textContent).toBe("2 of 3 points");
    fireEvent.change(within(document.querySelector("[data-rule='0']") as HTMLElement).getByLabelText("Only some points"),
      { target: { value: "notEmpty" } });
    expect(pick).toHaveBeenLastCalledWith({ filter: [{ key: "tags", op: "notEmpty", value: "wifi" }] });
    fireEvent.click(within(document.querySelector("[data-rule='0']") as HTMLElement).getByRole("button", { name: "Remove the rule" }));
    expect(pick).toHaveBeenLastCalledWith({ filter: null });
  });
});
