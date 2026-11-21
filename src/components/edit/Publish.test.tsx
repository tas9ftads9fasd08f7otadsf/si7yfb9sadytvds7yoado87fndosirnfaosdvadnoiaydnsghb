import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formOf } from "@/lib/publish";
import type { PublishOffer } from "@/lib/types";
import { resetPublish, usePublish } from "@/store/publish";
import { resetViewer, useViewer } from "@/store/viewer";
import { Publish } from "./Publish";

const fake = vi.hoisted(() => ({ offer: vi.fn(), send: vi.fn() }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => true, publishOffer: fake.offer, publishSend: fake.send } };
});

const offer: PublishOffer = { language: "en", isUpdate: false, texts: { en: { title: "High Tatras", body: "Hiking maps" } },
  categories: [{ id: "hiking", name: "Hiking", symbol: "figure.hiking" }, { id: "city", name: "City", symbol: "building.2" }],
  coverage: { countries: ["SK"] }, coverageLine: "Slovakia", places: ["Slovakia", "Poland"], leftOut: [], keysNote: "",
  manualURL: "", hasPreview: true, publicName: "", needsPublicName: false };

const seed = (made: PublishOffer = offer) => {
  fake.offer.mockResolvedValue({ ok: true, value: made });
  useViewer.setState({ mapID: "M", editToken: "t", words: { ...useViewer.getState().words, languages: "de,sk",
    "language.de": "Deutsch", "language.sk": "Slovenčina", "language.en": "English" } });
  usePublish.setState({ mapID: "M", offer: made, form: formOf(made), step: "form" });
};

const send = () => screen.getByRole("button", { name: /Publish to the gallery|Update in the gallery|Choose|Say|Add a name|Agree|Tap Publish|Fix/ });

describe("the Gallery card", () => {
  beforeEach(() => {
    resetViewer();
    resetPublish();
    vi.clearAllMocks();
  });
  afterEach(() => resetPublish());

  // 136 no offer, no card: the site and a phone that cannot publish draw nothing
  it("draws nothing until the phone has made an offer", () => {
    useViewer.setState({ mapID: "M", editToken: null });
    const { container } = render(<Publish />);
    expect(container.innerHTML).toBe("");
  });

  // 136 Send names what is still to do, in the order the sheet says it, and opens once all is written
  it("names what is missing on Send, then offers the Gallery's title", async () => {
    seed();
    render(<Publish />);
    expect(screen.getByRole("heading", { name: "Publish to the gallery" })).toBeTruthy();
    expect(screen.getByText("Layers and styles are sent")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Choose a category" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Hiking/ }));
    expect(screen.queryByText("Required")).toBeNull();
    expect((screen.getByRole("button", { name: "Tap Publish in the card above" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Publish" }));
    const ready = screen.getByRole("button", { name: "Publish to the gallery" }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    fake.send.mockResolvedValue({ ok: true, value: { ask: "A", code: "7QK2", expiresIn: 300 } });
    await act(async () => { fireEvent.click(ready); });
    expect(fake.send).toHaveBeenCalledTimes(1);
    expect(screen.getByText("7QK2")).toBeTruthy();
  });

  // 136 the name and description are written for each language, the phone's first
  it("writes the name and description for each language, the phone's first", () => {
    seed();
    render(<Publish />);
    expect(screen.getByRole("button", { name: /English · app language/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Add language"), { target: { value: "sk" } });
    expect(screen.getByRole("button", { name: /Slovenčina/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Name people will see · Slovenčina/), { target: { value: "Vysoké Tatry" } });
    expect(usePublish.getState().form?.texts.sk?.title).toBe("Vysoké Tatry");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(usePublish.getState().form?.texts.sk).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  // 136 an update says what it changed and has no replaces card; Send says Update
  it("asks an update what changed and leaves out the replaces card", () => {
    seed({ ...offer, isUpdate: true });
    render(<Publish />);
    expect(screen.getByRole("heading", { name: "Update in the gallery" })).toBeTruthy();
    expect(screen.queryByText("Your map becomes the gallery’s.")).toBeNull();
    expect(screen.getByText("Changes reach the gallery once a reviewer approves them.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Hiking/ }));
    expect((screen.getByRole("button", { name: "Say what changed" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("What changed"), { target: { value: "New huts" } });
    expect((screen.getByRole("button", { name: "Update in the gallery" }) as HTMLButtonElement).disabled).toBe(false);
  });

  // 136 keys taken out are listed, and how to get them is required; the manual must be a web address
  it("lists the keys left out and requires how to get them", () => {
    seed({ ...offer, leftOut: ["Mapy.cz key"] });
    render(<Publish />);
    expect(within(document.getElementById("publishLeftOut")!).getByText("Mapy.cz key")).toBeTruthy();
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Hiking/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Publish" }));
    expect(screen.getByRole("button", { name: "Say how to get the keys" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How to get the keys"), { target: { value: "Ask the city" } });
    fireEvent.change(screen.getByLabelText("Web page that explains the map"), { target: { value: "not a page" } });
    expect(screen.getByRole("button", { name: "Fix the web address" })).toBeTruthy();
  });

  // 136 a first publish with no name on the account asks for one, shown on the phone before it is accepted
  it("asks for a public name when the phone has none", () => {
    seed({ ...offer, needsPublicName: true });
    render(<Publish />);
    fireEvent.click(screen.getByRole("button", { name: /Hiking/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Publish" }));
    expect(screen.getByRole("button", { name: "Add a name" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your public name"), { target: { value: "Riki" } });
    expect(send().textContent).toBe("Publish to the gallery");
  });

  // 136 where the phone refuses, its reason takes the form's place and nothing can be sent
  it("shows the reason in place of the form when the phone refuses", () => {
    seed({ ...offer, refusal: "notSignedIn" });
    render(<Publish />);
    expect(screen.getByText("Not signed in to iCloud. Sign in in the Settings app.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish to the gallery/ })).toBeNull();
    act(() => usePublish.setState({ offer: { ...offer, refusal: "locked" } }));
    expect(screen.getByText("This map is locked on the phone")).toBeTruthy();
  });

  // 136 Change opens the Coverage editor, which is Edit map's Offline tab
  it("takes Change to the Offline tab, where Coverage is edited", () => {
    seed();
    useViewer.setState({ route: { screen: "edit", map: "M", tab: "sharing" } });
    render(<Publish />);
    expect(screen.getAllByText("Slovakia")).toHaveLength(2);
    expect(screen.getByText("Found from its tiles and features")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(useViewer.getState().route).toEqual({ screen: "edit", map: "M", tab: "offline" });
  });

  // 136 while the phone waits: the code, a Waiting badge and Cancel
  it("shows the code and Cancel while the phone waits", () => {
    seed();
    usePublish.setState({ step: "waiting", started: { ask: "A", code: "7QK2", expiresIn: 300 } });
    render(<Publish />);
    expect(screen.getByText("7QK2")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Confirm it is you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish to the gallery" })).toBeNull();
  });

  // 136 once sent: the three steps, then Done
  it("shows the three steps once sent, and Done", () => {
    seed();
    usePublish.setState({ step: "sent", sentAt: Date.now(), submission: "S" });
    render(<Publish />);
    expect(screen.getByText("Sent for review")).toBeTruthy();
    for (const step of ["Sent", "Reviewer checks it", "Live in the Gallery"]) expect(screen.getByText(step)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  // 136 a failure shows the phone's message
  it("shows the failure's message", () => {
    seed();
    usePublish.setState({ step: "failed", said: "iCloud is full" });
    render(<Publish />);
    expect(screen.getByRole("alert").textContent).toBe("iCloud is full");
  });
});
