import { describe, expect, it } from "vitest";
import { isAddress, peopleQueryOf } from "./people";

describe("peopleQueryOf", () => {
  // 59 each ask as `PeerWebPeople.ask` reads it
  it("writes each ask as the phone reads it", () => {
    expect(peopleQueryOf({ kind: "share" })).toEqual({ share: "1" });
    expect(peopleQueryOf({ kind: "invite", address: " eva@example.com ", role: "editor" }))
      .toEqual({ invite: "eva@example.com", role: "editor" });
    expect(peopleQueryOf({ kind: "role", person: "P", role: "admin" })).toEqual({ person: "P", role: "admin" });
    expect(peopleQueryOf({ kind: "remove", person: "P" })).toEqual({ remove: "P" });
    expect(peopleQueryOf({ kind: "link", role: "reader" })).toEqual({ link: "reader" });
    expect(peopleQueryOf({ kind: "link", role: null })).toEqual({ link: "none" });
  });
});

describe("isAddress", () => {
  // 59 the Invite button waits for what the phone would look up
  it("takes an email or a phone number, as the phone's invitation does", () => {
    expect(isAddress("eva@example.com")).toBe(true);
    expect(isAddress("+421 905 123 456")).toBe(true);
    expect(isAddress("eva")).toBe(false);
    expect(isAddress("eva@example")).toBe(false);
    expect(isAddress("eva@.com")).toBe(false);
    expect(isAddress("12345")).toBe(false);
    expect(isAddress("  ")).toBe(false);
  });
});
