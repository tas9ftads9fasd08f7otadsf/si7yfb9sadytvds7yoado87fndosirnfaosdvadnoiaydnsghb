import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OptionSection } from "@/lib/types";
import { resetViewer, useViewer } from "@/store/viewer";
import { OptionsPanel } from "./OptionsPanel";

const headers: OptionSection = { kind: "headers", title: "Headers", footnote: "Values stay on the phone.",
  key: "header", label: "Add header", layerScoped: true,
  options: [{ id: "Authorization", title: "Authorization", detail: "Bearer or Basic" }],
  items: [{ id: "X-API-Key", title: "X-API-Key", light: "", dark: "", isOn: true, detail: "Saved on this device" }] };

const probe: OptionSection = { kind: "probe", title: "", footnote: "", key: "test", label: "Test", layerScoped: true };

const asked = (answer: () => Promise<Response> = () => new Promise<Response>(() => {})) => {
  const ask = vi.fn((input: RequestInfo | URL) => (void input, answer()));
  vi.stubGlobal("fetch", ask);
  return () => String(ask.mock.calls[0]?.[0]);
};

const show = (sections: OptionSection[]) => {
  useViewer.setState({ mapID: "a", editToken: "t" });
  render(<OptionsPanel id="L" sections={sections} />);
};

describe("OptionsPanel", () => {
  beforeEach(resetViewer);
  afterEach(() => vi.unstubAllGlobals());

  // 60: a set header says so and shows no value; typing one sends it, never reading it back.
  it("sets a header's value without showing the one kept", () => {
    const sent = asked();
    show([headers]);
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    const field = screen.getByLabelText("X-API-Key Value") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.type).toBe("password");
    field.value = "sk_new";
    fireEvent.change(field);
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ layer: "L", header: "X-API-Key", headerValue: "sk_new" });
  });

  // 60: a header is removed by its name.
  it("removes a header", () => {
    const sent = asked();
    show([headers]);
    fireEvent.click(screen.getByRole("button", { name: "Remove X-API-Key" }));
    expect(sent()).toContain("removeHeader=X-API-Key");
  });

  // 60: a new header goes with its name and value at once; no name, nothing to add.
  it("adds a named header with its value", () => {
    const sent = asked();
    show([headers]);
    const add = screen.getByRole("button", { name: "Add header" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Header"), { target: { value: "Authorization" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Bearer abc" } });
    fireEvent.click(add);
    const query = new URLSearchParams(sent().split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ header: "Authorization", headerValue: "Bearer abc" });
  });

  // 60: Test asks the phone and says what it answered.
  it("tests the address on the phone", async () => {
    const sent = asked(() => Promise.resolve(new Response(JSON.stringify({ reachable: false, said: "Server replied 404" }))));
    show([probe]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test" }));
    });
    expect(sent()).toContain("/maps/a/layer-test?layer=L");
    expect(await screen.findByText("Server replied 404")).toBeTruthy();
  });
});
