import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { NavRail } from "./NavRail";
import { SettingsPage } from "./SettingsPage";

describe("Settings", () => {
  beforeEach(() => {
    resetViewer();
    history.replaceState(null, "", "/maps");
    useViewer.setState({ route: { screen: "maps" }, device: { name: "Riki's iPad", appVersion: "0.31.0", maps: [] },
      connected: true });
  });

  // 103 the rail's gear opens Settings at its own address
  it("opens from the gear at the rail's foot", () => {
    render(<><NavRail /><SettingsPage /></>);
    act(() => fireEvent.click(screen.getByRole("link", { name: "Settings" })));
    expect(location.pathname).toBe("/settings");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  // 2800 the owner's light and dark switch; 103 as Settings' three choices, kept for the next visit
  it("picks the appearance", () => {
    useViewer.setState({ route: { screen: "settings" } });
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "Automatic" }).getAttribute("aria-checked")).toBe("true");
    act(() => fireEvent.click(screen.getByRole("radio", { name: "Dark" })));
    expect(useViewer.getState().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("riki-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  });

  // 103 which phone shares the maps, whether it answers, and its app's version
  it("names the phone and its app", () => {
    useViewer.setState({ route: { screen: "settings" } });
    render(<SettingsPage />);
    expect(screen.getByText("Riki's iPad")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Connected" })).toBeTruthy();
    expect(screen.getByText("Riki Maps 0.31.0")).toBeTruthy();
  });

  // 103 how tiles load is there only where the phone allows the choice
  it("offers how tiles load where the phone allows it", () => {
    useViewer.setState({ route: { screen: "settings" } });
    const { rerender } = render(<SettingsPage />);
    expect(screen.queryByRole("radiogroup", { name: "Load tiles" })).toBeNull();
    act(() => useViewer.setState({ directAllowed: true }));
    rerender(<SettingsPage />);
    expect(screen.getByRole("radiogroup", { name: "Load tiles" })).toBeTruthy();
  });
});

const ID = "a1".repeat(16);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

/** A phone that hands out one ask and answers its polls in turn. */
function phone(polls: Response[]) {
  const asked = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return json({ id: ID, code: "A1A1", expiresIn: 300 });
    return polls.shift() ?? json({ waiting: true }, 202);
  });
  vi.stubGlobal("fetch", asked);
  return asked;
}

describe("Settings' editing from this browser", () => {
  // 103 the pairing is a section of the gear's Settings page
  beforeEach(() => {
    resetViewer();
    useViewer.setState({ route: { screen: "settings" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 92 the phone's QR code and the letters it asks to check, then editing once it says yes
  it("shows the phone's code and lets the browser edit once the phone says yes", async () => {
    phone([json({ waiting: true }, 202), json({ token: "t", expiresIn: 43200 })]);
    render(<SettingsPage />);
    const picture = await screen.findByRole("img", { name: /Scan this code/ });
    expect(picture.getAttribute("style")).toContain(`/web/pair/${ID}.png`);
    expect(screen.getByText("A1A1")).toBeTruthy();
    expect(screen.getByLabelText("Edit password")).toBeTruthy();
    await waitFor(() => expect(useViewer.getState().editToken).toBe("t"), { timeout: 6000 });
    expect(await screen.findByText("This browser can edit")).toBeTruthy();
  });

  // 92 a no from the phone is said, and a new code takes the old one's place
  it("says the phone refused and asks for a new code", async () => {
    const asked = phone([new Response("no", { status: 403 })]);
    render(<SettingsPage />);
    expect(await screen.findByRole("alert", undefined, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(asked.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
    expect(useViewer.getState().editToken).toBeNull();
  });

  // 92 a browser that may edit already is told so, with no code to scan
  it("tells an editing browser it can edit", () => {
    phone([]);
    useViewer.setState({ editToken: "t" });
    render(<SettingsPage />);
    expect(screen.getByText("This browser can edit")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
