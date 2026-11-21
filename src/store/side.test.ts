import { beforeEach, describe, expect, it } from "vitest";
import { resetViewer, restoreKept, showSide, toggleSide, useViewer } from "./viewer";

const shown = () => useViewer.getState().sideShown;

beforeEach(() => {
  resetViewer();
  localStorage.clear();
});

describe("the side bar", () => {
  // 150 bug: the side bar opened again on every reload, whatever the viewer had left it
  it("is kept as the viewer left it, and comes back so on the next visit", () => {
    toggleSide();
    expect(shown()).toBe(false);
    expect(localStorage.getItem("riki-sidebar")).toBe("0");
    resetViewer();
    restoreKept();
    expect(shown()).toBe(false);

    showSide(true);
    expect(localStorage.getItem("riki-sidebar")).toBe("1");
    resetViewer();
    restoreKept();
    expect(shown()).toBe(true);
  });

  // 150 a first visit, or a browser that keeps nothing, opens it, as the design draws W1
  it("opens on a first visit", () => {
    restoreKept();
    expect(shown()).toBe(true);
  });
});
