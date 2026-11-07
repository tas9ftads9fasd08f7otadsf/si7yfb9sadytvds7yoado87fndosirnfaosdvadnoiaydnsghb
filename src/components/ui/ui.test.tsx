import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitField } from "./CommitField";
import { MarkTile } from "./MarkTile";
import { Switch } from "./Switch";
import { ground } from "./ground";

describe("CommitField", () => {
  it("sends on change, not on every key", () => {
    const onCommit = vi.fn();
    render(<CommitField aria-label="Name" value="Old" onCommit={onCommit} />);
    const field = screen.getByLabelText<HTMLInputElement>("Name");
    fireEvent.input(field, { target: { value: "New" } });
    expect(onCommit).not.toHaveBeenCalled();
    field.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("New");
  });

  it("takes the phone's value when it changes", () => {
    const { rerender } = render(<CommitField aria-label="Name" value="Old" onCommit={() => {}} />);
    rerender(<CommitField aria-label="Name" value="Saved" onCommit={() => {}} />);
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Saved");
  });

  it("calls the newest handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<CommitField aria-label="Name" value="" onCommit={first} />);
    rerender(<CommitField aria-label="Name" value="" onCommit={second} />);
    screen.getByLabelText("Name").dispatchEvent(new Event("change", { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe("Switch", () => {
  it("moves at the click, then settles on what it is told", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch isOn label="Trails" onChange={onChange} />);
    const box = screen.getByRole<HTMLInputElement>("switch", { name: "Trails" });
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(box.checked).toBe(false);
    rerender(<Switch isOn={false} label="Trails" onChange={onChange} />);
    rerender(<Switch isOn label="Trails" onChange={onChange} />);
    expect(box.checked).toBe(true);
  });
});

describe("marks", () => {
  it("wears only a real hex colour", () => {
    expect(ground("#3a7d44")?.backgroundColor).toContain("#3a7d44");
    expect(ground("red")).toBeUndefined();
    expect(ground(null)).toBeUndefined();
  });

  it("shows a picture in place of the symbol", () => {
    const { container } = render(<MarkTile symbol="map" picture="data:image/jpeg;base64,AA" />);
    expect(container.querySelector(".sym")).toBeNull();
    expect(container.querySelector<HTMLElement>(".mark")?.style.backgroundImage).toContain("data:image/jpeg");
  });
});
