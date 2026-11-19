import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { Gate } from "./Overlays";
import { TopBar } from "./TopBar";

const { mountAccount } = vi.hoisted(() => ({ mountAccount: vi.fn() }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, mountAccount } };
});

describe("signing in on the site", () => {
  beforeEach(() => {
    resetViewer();
    mountAccount.mockClear();
  });

  // 76 signed out, the gate asks for an Apple Account and hands the backend the place for its button
  it("shows the sign-in sheet and mounts the Sign in with Apple button in it", () => {
    useViewer.setState({ standing: "signedOut" });
    const { container } = render(<Gate />);
    expect(screen.getByRole("heading").textContent).toBe("Sign in to iCloud");
    expect(container.querySelector("#askToJoin")).toBeNull();
    expect(mountAccount).toHaveBeenCalledWith("in", container.querySelector("#signIn"));
  });

  it("mounts the button again only when the person is signed out", () => {
    useViewer.setState({ standing: "waiting" });
    render(<Gate />);
    expect(mountAccount).not.toHaveBeenCalled();
    act(() => useViewer.setState({ standing: "signedOut" }));
    expect(mountAccount).toHaveBeenCalledTimes(1);
  });

  it("gives the top bar a place for the sign-out button", () => {
    const { container } = render(<TopBar />);
    expect(mountAccount).toHaveBeenCalledWith("out", container.querySelector("#account"));
  });
});
