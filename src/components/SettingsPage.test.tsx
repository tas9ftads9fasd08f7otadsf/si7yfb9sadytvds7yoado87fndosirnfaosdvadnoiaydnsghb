import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
