import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetViewer, useViewer } from "@/store/viewer";
import { SettingsPage } from "./SettingsPage";

const fake = vi.hoisted(() => ({ typed: "", keep: vi.fn(), withAuthor: true }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, mountAccount: () => {},
    get author() {
      return fake.withAuthor ? { read: () => fake.typed, keep: (name: string) => { fake.typed = name.trim(); fake.keep(name); } } : undefined;
    } } };
});

// 83 the site's account part holds the name a change is made under; 103 it is in Settings
describe("the account part's name", () => {
  beforeEach(() => {
    resetViewer();
    fake.typed = "";
    fake.withAuthor = true;
    vi.clearAllMocks();
    useViewer.setState({ standing: "admitted", gateDevice: "Riki Tester", route: { screen: "settings" } });
  });

  it("is a field with the Apple Account's name to show for none typed", () => {
    render(<SettingsPage />);
    const field = screen.getByRole("textbox", { name: "Your name" }) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.placeholder).toBe("Riki Tester");
  });

  it("shows the name kept in the browser", () => {
    fake.typed = "Friki";
    render(<SettingsPage />);
    expect((screen.getByRole("textbox", { name: "Your name" }) as HTMLInputElement).value).toBe("Friki");
  });

  it("keeps the name once typing is over", () => {
    render(<SettingsPage />);
    const field = screen.getByRole("textbox", { name: "Your name" });
    fireEvent.change(field, { target: { value: " Friki " } });
    expect(fake.keep).toHaveBeenCalledWith(" Friki ");
    expect(fake.typed).toBe("Friki");
  });

  it("is not there until the person is signed in", () => {
    useViewer.setState({ standing: "signedOut" });
    render(<SettingsPage />);
    expect(screen.queryByRole("textbox", { name: "Your name" })).toBeNull();
  });

  it("is not there on a target with no author, as the phone's", () => {
    fake.withAuthor = false;
    render(<SettingsPage />);
    expect(screen.queryByRole("textbox", { name: "Your name" })).toBeNull();
  });
});
