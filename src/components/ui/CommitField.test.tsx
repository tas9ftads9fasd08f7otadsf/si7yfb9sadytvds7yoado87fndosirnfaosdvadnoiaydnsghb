import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitField } from "./CommitField";

describe("CommitField", () => {
  // 72 the phone's answer to one edit wiped the text typed for the next, so nothing was sent
  it("keeps what is typed while the value changes under it, and takes the value once left", () => {
    const send = vi.fn();
    const { rerender } = render(<CommitField value="a" aria-label="URL" onCommit={send} />);
    const field = screen.getByLabelText("URL") as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: "typed" } });
    rerender(<CommitField value="b" aria-label="URL" onCommit={send} />);
    expect(field.value).toBe("typed");
    expect(send).toHaveBeenCalledWith("typed");
    field.blur();
    rerender(<CommitField value="c" aria-label="URL" onCommit={send} />);
    expect(field.value).toBe("c");
  });

  it("takes a new value at once while it is not being typed in", () => {
    const { rerender } = render(<CommitField value="a" aria-label="URL" onCommit={() => {}} />);
    rerender(<CommitField value="b" aria-label="URL" onCommit={() => {}} />);
    expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("b");
  });
});
