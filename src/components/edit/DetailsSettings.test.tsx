import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailsLayout } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { DetailsLayoutPanel } from "./DetailsLayoutPanel";

const words = { addContent: "Add content", addSection: "Add section", removeSection: "Remove section",
  sectionTitle: "Title", fromTheApp: "From the app", name: "Name", value: "Value", label: "Label",
  link: "Link", heading: "Title", plain: "Plain", box: "Box", warning: "Warning", used: "3 of 10", full: "Full",
  header: "Header", icon: "Icon", layerIcon: "As the app shows it", headerTitleNote: "Left empty…",
  actions: "Action buttons", addActions: "Add action buttons", removeActions: "Remove from Details",
  addButton: "Add custom button", buttonsShow: "Buttons show", highlight: "Highlight the first one",
  look: "Look", whenTapped: "When tapped", subject: "Subject", body: "Message",
  hidesButton: "Hide when a key is empty", textIcon: "A note icon before the text", hidesText: "Hide when empty",
  nameAndValue: "Name and value", rowIcons: "A small icon before each row", hidesRows: "Hide empty rows",
  addRow: "Add a row", liveFor: "Live for", card: "What the card shows" };

const button = { id: "b1", label: "Timetable", look: "tinted", action: "link", template: "https://t.test/{id}",
  hides: false };

const layout = (actions: DetailsLayout["actions"] = null): DetailsLayout => ({
  sections: [{ name: "Section 1", blocks: [
    { handle: "c1", kind: "connectionCard", name: "Connection card", counts: true,
      settings: { card: { delay: "{delay}" }, live: null } },
    { handle: "r1", kind: "rows", name: "Info rows", counts: true,
      settings: { look: "nameAboveValue", icons: true, hidesEmpty: true,
        rows: [{ index: 0, title: "Speed", value: "{speed}" }] } },
    { handle: "t1", kind: "text", name: "Text", value: "{note}", style: "box", counts: true,
      settings: { icon: false, hides: true } }] }],
  used: 3, limit: 10, parts: [], keys: ["speed"], offers: [], words,
  header: { title: null, symbol: null, layerSymbol: "tram" },
  actions,
  symbols: ["tram.fill", "star.fill"],
  choices: { labels: [{ id: "iconAndLabel", title: "Icon and label" }, { id: "iconOnly", title: "Icon only" }],
    buttonKinds: [{ id: "link", title: "Open link", detail: "Link" }, { id: "email", title: "Email", detail: "Address" }],
    buttonLooks: [{ id: "filled", title: "Filled" }, { id: "tinted", title: "Tinted" }],
    rowLooks: [{ id: "nameAboveValue", title: "Name above value" }, { id: "sideBySide", title: "Side by side" }],
    cardParts: [{ id: "delay", title: "Delay in minutes" }, { id: "station", title: "Station" }] },
});

const row = {
  items: [{ id: "directions", name: "Directions", note: "Route here", isOn: true },
    { id: "b1", name: "Timetable", note: "Open link", isOn: true, button },
    { id: "copy", name: "Copy", note: "Copy the coordinates", isOn: false }],
  labels: "iconAndLabel", highlightsFirst: false,
};

const asked = () => {
  const ask = vi.fn((input: RequestInfo | URL) => new Promise<Response>(() => void input));
  vi.stubGlobal("fetch", ask);
  return () => Object.fromEntries(new URLSearchParams(String(ask.mock.calls[0]?.[0]).split("?")[1]));
};

const show = (shown = layout()) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<DetailsLayoutPanel layout={shown} scoped={(query) => ({ layer: "L", ...query })} />);
};

describe("Details settings", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 55: the header's icon is sent with its title, as the phone stores both.
  it("sets the header's icon", () => {
    const query = asked();
    show();
    fireEvent.change(screen.getByRole("combobox", { name: "Header Icon" }), { target: { value: "tram.fill" } });
    expect(query()).toMatchObject({ layer: "L", details: "header", symbol: "tram.fill", title: "" });
  });

  // 55: a layout without action buttons offers to add them, and nothing else of them.
  it("adds the action buttons", () => {
    const query = asked();
    show();
    expect(screen.queryByRole("checkbox", { name: "Copy" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add action buttons" }));
    expect(query()).toMatchObject({ details: "addActions" });
  });

  // 55: a built-in is switched by its name; one left off cannot be moved.
  it("switches a built-in on", () => {
    const query = asked();
    show(layout(row));
    expect(screen.queryByRole("button", { name: "Move up Copy" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Copy" }));
    expect(query()).toMatchObject({ details: "action", name: "copy", on: "1" });
  });

  // 55: a placed button moves to the place above it in the listed row.
  it("moves a custom button up", () => {
    const query = asked();
    show(layout(row));
    expect((screen.getByRole("button", { name: "Move down Timetable" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move up Timetable" }));
    expect(query()).toMatchObject({ details: "moveAction", item: "b1", to: "0" });
  });

  // 55: a custom button's kind is sent with every field it holds, by its id.
  it("edits a custom button", () => {
    const query = asked();
    show(layout(row));
    fireEvent.change(screen.getByRole("combobox", { name: "When tapped" }), { target: { value: "email" } });
    expect(query()).toMatchObject({ details: "button", button: "b1", action: "email", label: "Timetable",
      template: "https://t.test/{id}", look: "tinted", hides: "0" });
  });

  // 55
  it("highlights the first action button", () => {
    const query = asked();
    show(layout(row));
    fireEvent.click(screen.getByRole("checkbox", { name: "Highlight the first one" }));
    expect(query()).toMatchObject({ details: "actionsLook", labels: "iconAndLabel", highlight: "1" });
  });

  // 55: a block's settings go with its place and handle.
  it("sets a text block's icon", () => {
    const query = asked();
    show();
    fireEvent.click(screen.getByRole("checkbox", { name: "A note icon before the text" }));
    expect(query()).toMatchObject({ details: "blockSettings", section: "0", block: "2", was: "t1", icon: "1" });
  });

  // 55
  it("sets a rows block's look", () => {
    const query = asked();
    show();
    fireEvent.change(screen.getByRole("combobox", { name: "Name and value" }), { target: { value: "sideBySide" } });
    expect(query()).toMatchObject({ details: "blockSettings", block: "1", was: "r1", look: "sideBySide" });
  });

  // 55: a row is added only with a name and a value.
  it("adds a row to a rows block", () => {
    const query = asked();
    show();
    fireEvent.change(screen.getByRole("textbox", { name: "Add a row Name" }), { target: { value: "Line" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Add a row Value" }), { target: { value: "{line}" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a row" }));
    expect(query()).toMatchObject({ details: "addRow", was: "r1", title: "Line", value: "{line}" });
  });

  // 55
  it("removes a row by its place", () => {
    const query = asked();
    show();
    fireEvent.click(screen.getByRole("button", { name: "Remove Speed" }));
    expect(query()).toMatchObject({ details: "removeRow", was: "r1", row: "0" });
  });

  // 55: a card's part is sent by its name, once typed.
  it("sets a connection card's key", () => {
    const query = asked();
    show();
    const station = screen.getByRole("textbox", { name: "Station" });
    fireEvent.change(station, { target: { value: "{stop}" } });
    expect(query()).toMatchObject({ details: "blockSettings", was: "c1", station: "{stop}" });
  });
});
