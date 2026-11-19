import { fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsLayout } from "@/lib/types";
import { ENGLISH, type Words } from "@/lib/words";
import { resetViewer, useViewer } from "@/store/viewer";
import { DetailsLayoutPanel } from "./DetailsLayoutPanel";

const words = { addContent: "Add content", addSection: "Add section", removeSection: "Remove section",
  sectionTitle: "Title", fromTheApp: "From the app", name: "Name", value: "Value", label: "Label",
  link: "Link", heading: "Title", plain: "Plain", box: "Box", warning: "Warning", used: "3 of 10", full: "Full",
  header: "Header", icon: "Icon", layerIcon: "As the app shows it", headerTitleNote: "Left empty…",
  actions: "Action buttons", addActions: "Add action buttons", removeActions: "Remove from Details",
  addButton: "Add custom button", buttonsShow: "Buttons show", highlight: "Highlight the first one",
  look: "Look", whenTapped: "When tapped", subject: "Subject", body: "Message", place: "Place",
  withActions: "With action buttons", belowRows: "Below the rows" };

const button = { id: "b1", label: "Timetable", look: "tinted", action: "link", template: "https://t.test/{id}",
  hides: false, labelTranslations: { sk: "Cestovný poriadok" } };

const layout = (over: Partial<DetailsLayout> = {}): DetailsLayout => ({
  sections: [
    { title: "Facts", titleTranslations: { de: "Fakten" }, name: "Facts", blocks: [
      { handle: "t1", kind: "text", name: "Text", value: "{note}", heading: "About", style: "box", counts: true,
        headingTranslations: { sk: "O mieste" }, settings: { icon: false, hides: true } },
      { handle: "k1", kind: "button", name: "Button", counts: true,
        settings: { button: { ...button, id: "b2", label: "Tickets", labelTranslations: undefined } } }] },
    { title: null, name: "Section 2", blocks: [] }],
  used: 2, limit: 10, parts: [], keys: [], offers: [], words,
  header: { title: "{line}", symbol: null, layerSymbol: "tram", titleTranslations: { de: "Linie" } },
  actions: { items: [{ id: "b1", name: "Timetable", note: "Open link", isOn: true, button }], labels: "iconAndLabel",
    highlightsFirst: false },
  choices: { labels: [{ id: "iconAndLabel", title: "Icon and label" }],
    buttonKinds: [{ id: "link", title: "Open link", detail: "Link" }], buttonLooks: [{ id: "tinted", title: "Tinted" }] },
  ...over,
});

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", ask);
  return () => Object.fromEntries(new URLSearchParams(String(ask.mock.calls[0]?.[0]).split("?")[1]));
};

const speak = (languages = "de,sk") => useViewer.setState({ mapID: "a", editToken: "t",
  words: { ...ENGLISH, languages, "language.de": "German", "language.sk": "Slovak", "language.cs": "Czech" } as Words });

const show = (shown = layout(), languages = "de,sk") => {
  speak(languages);
  render(<DetailsLayoutPanel layout={shown} scoped={(query) => ({ layer: "L", ...query })} />);
};

const part = (label: string) => within(document.querySelector<HTMLElement>(`[data-translations="${label}"]`)!);

describe("Details titles in other languages", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 81: the header's translations are listed by language name, with how many there are.
  it("lists the header's translations", () => {
    show();
    const header = document.querySelector<HTMLElement>("[data-translations='Header']")!;
    expect(header.querySelector("summary")?.textContent).toBe("Other languages (1)");
    expect((part("Header").getByRole("textbox", { name: "Header · German" }) as HTMLInputElement).value).toBe("Linie");
  });

  // 81: a changed text goes with the target, the language and the text as typed.
  it("changes the header's translation", () => {
    const query = asked();
    show();
    fireEvent.change(part("Header").getByRole("textbox", { name: "Header · German" }), { target: { value: "Linka" } });
    expect(query()).toEqual({ layer: "L", details: "translation", target: "header", language: "de", text: "Linka" });
  });

  // 81: a blank text takes the language away; it goes as an empty text whatever the blank was.
  it("removes a translation by blanking it", () => {
    const query = asked();
    show();
    fireEvent.change(part("Header").getByRole("textbox", { name: "Header · German" }), { target: { value: " " } });
    expect(query()).toMatchObject({ target: "header", language: "de", text: "" });
  });

  // 81
  it("removes a translation with its minus", () => {
    const query = asked();
    show();
    fireEvent.click(part("Header").getByRole("button", { name: "Remove · Header · German" }));
    expect(query()).toMatchObject({ details: "translation", target: "header", language: "de", text: "" });
  });

  // 81: a language is added from the ones the app speaks that are not written yet, and sent once typed.
  it("adds a language and sends it once typed", () => {
    const query = asked();
    show();
    const header = part("Header");
    const choices = within(header.getByRole("combobox", { name: "Add a language · Header" }));
    expect(choices.getAllByRole("option").map((option) => option.textContent)).toEqual(["Add a language", "Slovak"]);
    fireEvent.change(header.getByRole("combobox", { name: "Add a language · Header" }), { target: { value: "sk" } });
    expect(header.getByRole("textbox", { name: "Header · Slovak" })).toBeTruthy();
    fireEvent.change(header.getByRole("textbox", { name: "Header · Slovak" }), { target: { value: "Linka" } });
    expect(query()).toMatchObject({ target: "header", language: "sk", text: "Linka" });
  });

  // 81: a language added and left blank was never written, so removing it asks nothing of the phone.
  it("sends nothing for a language added and removed unwritten", () => {
    const ask = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
    vi.stubGlobal("fetch", ask);
    show();
    const header = part("Header");
    fireEvent.change(header.getByRole("combobox", { name: "Add a language · Header" }), { target: { value: "sk" } });
    fireEvent.click(header.getByRole("button", { name: "Remove · Header · Slovak" }));
    expect(header.queryByRole("textbox", { name: "Header · Slovak" })).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  // 81: a section is named by its place.
  it("sets a section title's translation", () => {
    const query = asked();
    show();
    fireEvent.change(part("Title 1").getByRole("textbox", { name: "Title 1 · German" }), { target: { value: "Daten" } });
    expect(query()).toMatchObject({ details: "translation", target: "section", section: "0", language: "de",
      text: "Daten" });
  });

  // 81: a text block is named by its place and handle, so a stale page is refused.
  it("sets a text block heading's translation", () => {
    const query = asked();
    show();
    fireEvent.change(part("Text 1.1").getByRole("textbox", { name: "Text 1.1 · Slovak" }), { target: { value: "Miesto" } });
    expect(query()).toMatchObject({ details: "translation", target: "text", section: "0", block: "0", was: "t1",
      language: "sk", text: "Miesto" });
  });

  // 81: a button among the action buttons is named by its id alone.
  it("sets an action button label's translation by its id", () => {
    const query = asked();
    show();
    fireEvent.change(part("Timetable").getByRole("textbox", { name: "Timetable · Slovak" }),
      { target: { value: "Cestovný poriadok 2" } });
    const sent = query();
    expect(sent).toMatchObject({ details: "translation", target: "button", button: "b1", language: "sk" });
    expect(sent).not.toHaveProperty("was");
  });

  // 81: a button block is named by its place and handle, as the other block settings are.
  it("sets a button block label's translation by its place", () => {
    const query = asked();
    show();
    const tickets = part("Tickets");
    fireEvent.change(tickets.getByRole("combobox", { name: "Add a language · Tickets" }), { target: { value: "de" } });
    fireEvent.change(tickets.getByRole("textbox", { name: "Tickets · German" }), { target: { value: "Karten" } });
    expect(query()).toMatchObject({ details: "translation", target: "button", section: "0", block: "1", was: "k1",
      language: "de", text: "Karten" });
  });

  // 81: a title not written yet takes no translation, so nothing is offered for it.
  it("offers no language for a title not written", () => {
    const bare = layout({ header: { title: null, symbol: null, layerSymbol: "tram" } });
    show(bare);
    expect(document.querySelector("[data-translations='Header']")).toBeNull();
    expect(document.querySelector("[data-translations='Title 2']")).toBeNull();
  });

  // 81: a title that lost its words on the phone still lists what it held, to be taken away.
  it("lists a held translation of a title no longer written, without offering more", () => {
    show(layout({ header: { title: "", symbol: null, layerSymbol: "tram", titleTranslations: { de: "Linie" } } }));
    expect(part("Header").getByRole("textbox", { name: "Header · German" })).toBeTruthy();
    expect(part("Header").queryByRole("combobox")).toBeNull();
  });

  // 81: a language the app no longer offers is listed and can be removed, but not added again.
  it("lists a held language the app no longer offers", () => {
    const query = asked();
    show(layout(), "de");
    const header = part("Header");
    expect(header.queryByRole("combobox")).toBeNull();
    fireEvent.click(part("Text 1.1").getByRole("button", { name: "Remove · Text 1.1 · Slovak" }));
    expect(query()).toMatchObject({ target: "text", language: "sk", text: "" });
  });

  // 81: a phone that names no languages and holds no translation shows no such part at all.
  it("shows no translations where there are no languages and none held", () => {
    const old = layout();
    old.header = { title: "{line}", symbol: null, layerSymbol: "tram" };
    old.sections = [{ title: "Facts", name: "Facts", blocks: [] }];
    old.actions = null;
    show(old, "");
    expect(document.querySelector("details.translations")).toBeNull();
  });
});
