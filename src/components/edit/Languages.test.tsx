import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Portable } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { Languages } from "./Languages";

const portable: Portable = { id: "a", name: "Tatras", nameTranslations: { sk: "Tatry", de: "Tatra" } };

describe("Languages", () => {
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ words: { ...useViewer.getState().words, languages: "de,sk,cs",
      "language.de": "German", "language.sk": "Slovak", "language.cs": "Czech" } });
  });

  // 109 W6: a chip each language written, the first one's fields shown, another picked by its chip
  it("shows one language's fields at a time, picked by its chip", () => {
    render(<Languages portable={portable} />);
    const chips = screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true }));
    expect(chips.map((chip) => chip.textContent).sort()).toEqual(["German", "Slovak"]);
    expect((screen.getByRole("textbox", { name: "Name · German" }) as HTMLInputElement).value).toBe("Tatra");
    expect(screen.queryByRole("textbox", { name: "Name · Slovak" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Slovak" }));
    expect((screen.getByRole("textbox", { name: "Name · Slovak" }) as HTMLInputElement).value).toBe("Tatry");
  });

  // 109 a language added from the picker becomes the chip shown
  it("shows a language added from the picker", () => {
    render(<Languages portable={portable} />);
    act(() => { fireEvent.change(screen.getByRole("combobox", { name: "Add a language" }), { target: { value: "cs" } }); });
    expect(screen.getByRole("button", { name: "Czech" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Note · Czech" })).toBeTruthy();
  });
});
