import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Category } from "./Category";

const fake = vi.hoisted(() => ({ offered: true }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => fake.offered } };
});

const portable: Portable = { id: "a", name: "Tatras", category: "Hiking" };
const device: Device = { name: "iPad", maps: [
  { id: "a", name: "Tatras", layers: [], category: "Hiking" }, { id: "b", name: "Fatra", layers: [], category: "hiking" },
  { id: "c", name: "Office", layers: [], category: "Work" }, { id: "d", name: "Spare", layers: [] }] };

const field = () => screen.getByLabelText("Category") as HTMLInputElement;
const sent = (fetcher: ReturnType<typeof vi.fn>) => new URL(
  String(fetcher.mock.calls.map((call) => call[0]).find((url) => String(url).includes("/edit?"))), "http://phone");
const typeIn = (text: string) => {
  fireEvent.input(field(), { target: { value: text } });
  fireEvent.change(field(), { target: { value: text } });
};

describe("Edit map's Category", () => {
  beforeEach(() => {
    resetViewer();
    fake.offered = true;
    useViewer.setState({ mapID: "a", editToken: "t", device, portable });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 142 a text input of at most 40 characters, "None" until set, the maps' categories offered once each
  it("is a short text field that offers the maps' own categories once each", () => {
    render(<Category portable={portable} />);
    expect(screen.getByRole("heading", { name: "Category" })).toBeTruthy();
    expect(field().value).toBe("Hiking");
    expect(field().maxLength).toBe(40);
    expect(field().placeholder).toBe("None");
    expect([...document.querySelectorAll("#categoryList option")].map((each) => (each as HTMLOptionElement).value))
      .toEqual(["Hiking", "Work"]);
    expect(field().getAttribute("list")).toBe("categoryList");
  });

  // 142 saved on change (blur or Enter), cleaned as the app cleans it; the phone's map redraws the field
  it("saves the cleaned text as category= and shows what the phone answers", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).includes("/edit?") ? { id: "a", name: "Tatras", category: "Day trips" } : { name: "iPad", maps: [] })));
    vi.stubGlobal("fetch", fetcher);
    render(<Category portable={portable} />);
    typeIn("  Day   trips ");
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(sent(fetcher).pathname).toBe("/riki/v1/maps/a/edit");
    expect(sent(fetcher).searchParams.get("category")).toBe("Day trips");
    await waitFor(() => expect(useViewer.getState().portable?.category).toBe("Day trips"));
  });

  // 142 a blank value clears the category
  it("clears the category when the field is left blank", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).includes("/edit?") ? { id: "a", name: "Tatras" } : { name: "iPad", maps: [] })));
    vi.stubGlobal("fetch", fetcher);
    render(<Category portable={portable} />);
    typeIn("   ");
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(sent(fetcher).searchParams.get("category")).toBe("");
  });

  // 142 nothing is sent for what is already the category
  it("sends nothing when the text is the category already", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Category portable={portable} />);
    typeIn(" Hiking ");
    expect(fetcher).not.toHaveBeenCalled();
  });

  // 142 the phone's refusal is shown under the field, in its words, and the typed text stays
  it("shows the phone's words under the field on a 409 and keeps the text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("A category is at most 40 characters", { status: 409 })));
    render(<Category portable={portable} />);
    typeIn("x".repeat(41));
    expect((await screen.findByRole("alert")).textContent).toBe("A category is at most 40 characters");
    expect(field().value).toBe("x".repeat(41));
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(useViewer.getState().notice).toBeNull();
    expect(useViewer.getState().portable?.category).toBe("Hiking");
  });

  // 142 a map shared to look at, or edit, is not the owner's: the label is read only
  it("is read only where the map is not the owner's", () => {
    useViewer.setState({ switches: { ownsSettings: false } as never });
    const { unmount } = render(<Category portable={portable} />);
    expect(field().disabled).toBe(true);
    unmount();
    useViewer.setState({ switches: null, device: { name: "iPad", maps: [{ ...device.maps[0]!, role: "view" }] } });
    const view = render(<Category portable={portable} />);
    expect(field().disabled).toBe(true);
    view.unmount();
    useViewer.setState({ device: { name: "iPad", maps: [{ ...device.maps[0]!, role: "own" }] } });
    render(<Category portable={portable} />);
    expect(field().disabled).toBe(false);
  });

  // 142 the site has no categories to set
  it("draws nothing where the target does not offer it", () => {
    fake.offered = false;
    const { container } = render(<Category portable={portable} />);
    expect(container.innerHTML).toBe("");
  });
});
