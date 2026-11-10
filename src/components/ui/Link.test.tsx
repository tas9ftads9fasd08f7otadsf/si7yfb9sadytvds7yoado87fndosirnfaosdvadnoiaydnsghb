import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Link } from "./Link";

describe("Link", () => {
  beforeEach(() => {
    resetViewer();
    history.replaceState(null, "", "/maps");
  });

  // 31 a real address, so it can open in a new tab
  it("carries the route's address", () => {
    render(<Link to={{ screen: "data", tab: "servers" }}>Data</Link>);
    expect(screen.getByRole("link", { name: "Data" }).getAttribute("href")).toBe("/data/servers");
  });

  // 31 a plain click moves inside the page, with no page asked for
  it("moves on a plain click", () => {
    render(<Link to={{ screen: "settings" }}>Settings</Link>);
    const clicked = fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(clicked).toBe(false);
    expect(location.pathname).toBe("/settings");
    expect(useViewer.getState().route).toEqual({ screen: "settings" });
  });

  // 31 a modified or middle click is left to the browser
  it("leaves ⌘, Ctrl, Shift and middle clicks to the browser", () => {
    render(<Link to={{ screen: "settings" }}>Settings</Link>);
    const link = screen.getByRole("link", { name: "Settings" });
    link.addEventListener("click", (event) => event.preventDefault());
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      fireEvent.click(link, modifier);
    }
    expect(location.pathname).toBe("/maps");
  });

  // 31 a link that does more than move says what instead
  it("calls its own follow in place of moving", () => {
    const onFollow = vi.fn();
    render(<Link to={{ screen: "settings" }} onFollow={onFollow} current>Settings</Link>);
    const link = screen.getByRole("link", { name: "Settings" });
    fireEvent.click(link);
    expect(onFollow).toHaveBeenCalledOnce();
    expect(location.pathname).toBe("/maps");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
