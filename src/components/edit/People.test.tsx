import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharePeople } from "@/lib/types";
import { resetPeople, usePeople } from "@/store/people";
import { resetViewer, useViewer } from "@/store/viewer";
import { Roster } from "./People";

const shared: SharePeople = { isShared: true, role: "owner", mayInvite: true, invitesDirectly: true, tally: "1 joined",
  link: "https://www.icloud.com/share/0abc", linkRole: null, mayChangeLink: true, heldBy: null, caveat: "Admin is a role",
  people: [
    { id: "o", name: "Olga (you)", role: "owner", line: "Owner", hasAccepted: true, isYou: true, mayChangeRole: false,
      mayRemove: false },
    { id: "r", name: "Rita", role: "reader", line: "Sees the map as it is", hasAccepted: true, isYou: false,
      mayChangeRole: true, mayRemove: true }] };

const answered = (people: SharePeople) => vi.fn(async () => new Response(JSON.stringify(people)));
const asked = (fetcher: ReturnType<typeof vi.fn>) =>
  new URL((fetcher.mock.calls.at(-1) as unknown as [string])[0], "http://phone").searchParams;

describe("People", () => {
  beforeEach(() => {
    resetViewer();
    resetPeople();
    useViewer.setState({ mapID: "M", editToken: "t" });
    usePeople.setState({ of: { kind: "map", id: "M" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  // 59 each person with their role; only those the phone allows are changed or removed
  it("lists the people and changes a role as the phone allows", async () => {
    const fetcher = answered(shared);
    vi.stubGlobal("fetch", fetcher);
    render(<Roster people={shared} />);
    expect(screen.getByText("Olga (you)")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Role · Olga (you)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Olga (you)" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Role · Rita" }), { target: { value: "editor" } });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(Object.fromEntries(asked(fetcher))).toEqual({ person: "r", role: "editor" });
  });

  // 59 taking someone off asks first, as the person's page does
  it("removes a person only once confirmed", async () => {
    const fetcher = answered(shared);
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<Roster people={shared} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Rita" }));
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", vi.fn(() => true));
    fireEvent.click(screen.getByRole("button", { name: "Remove Rita" }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(asked(fetcher).get("remove")).toBe("r");
  });

  // 59 Invite waits for an address the phone can look up, then offers the link to send
  it("invites by email with the picked role and offers the link", async () => {
    const fetcher = answered(shared);
    vi.stubGlobal("fetch", fetcher);
    render(<Roster people={shared} />);
    const invite = screen.getByRole("button", { name: "Invite" }) as HTMLButtonElement;
    fireEvent.change(screen.getByRole("textbox", { name: "Email or phone" }), { target: { value: "eva" } });
    expect(invite.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Email or phone" }), { target: { value: "eva@example.com" } });
    fireEvent.change(screen.getByRole("combobox", { name: "New people can" }), { target: { value: "admin" } });
    fireEvent.click(invite);
    await screen.findByText("Invited");
    expect(Object.fromEntries(asked(fetcher))).toEqual({ invite: "eva@example.com", role: "admin" });
    expect(document.getElementById("copyInviteLink")).toBeTruthy();
  });

  // 59 an unshared map says it is yours alone; a folder's map is managed on the folder
  it("says a map is yours alone, and sends a folder's map to its folder", () => {
    const { unmount } = render(<Roster people={{ ...shared, isShared: false, link: null, people: [], tally: "" }} />);
    expect(screen.getByText("This map is yours alone.")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    unmount();
    render(<Roster people={{ ...shared, heldBy: "Hills", mayInvite: false, link: null, people: [] }} />);
    expect(screen.getByText("Shared as part of Hills; manage people and sharing on the stack.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // 59 who can join is the owner's: anyone with the link joins as the role picked
  it("opens the link to anyone as the picked role", async () => {
    const fetcher = answered({ ...shared, linkRole: "editor" });
    vi.stubGlobal("fetch", fetcher);
    render(<Roster people={shared} />);
    fireEvent.change(screen.getByRole("combobox", { name: "New people can" }), { target: { value: "editor" } });
    fireEvent.click(screen.getByRole("radio", { name: /Anyone with the link/ }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(asked(fetcher).get("link")).toBe("editor");
  });
});
