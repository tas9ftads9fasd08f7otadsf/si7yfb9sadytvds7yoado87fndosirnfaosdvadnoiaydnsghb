import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

const open = (onClose = vi.fn()) => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const view = render(
    <Modal labelledBy="t" onClose={onClose}><h1 id="t">New map</h1><input aria-label="Name" /></Modal>);
  return { opener, onClose, ...view };
};

describe("Modal", () => {
  // 152 bug: the windows were divs, so Tab walked out of them into the page behind
  it("opens as a dialog named by its title, with focus inside it", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "New map" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  // 152 Escape is the dialog's cancel, and a press on the dimmed page around it closes it too
  it("closes on cancel and on a press outside its box, not inside it", () => {
    const { onClose } = open();
    const dialog = screen.getByRole("dialog", { name: "New map" });
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Name" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // 152 closing hands focus back to what opened the window
  it("gives focus back to what opened it once it closes", () => {
    const { opener, unmount } = open();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
