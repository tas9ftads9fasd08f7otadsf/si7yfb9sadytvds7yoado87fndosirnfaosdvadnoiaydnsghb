import type { ShareRole } from "./types";

/** 59 The roles an owner hands out, in the order the phone's pills show them. */
export const OFFERED_ROLES: ShareRole[] = ["reader", "editor", "admin"];

/** 59 What the People card asks the phone to do, one change per request. */
export type PeopleAsk =
  | { kind: "share" }
  | { kind: "invite"; address: string; role: ShareRole }
  | { kind: "role"; person: string; role: ShareRole }
  | { kind: "remove"; person: string }
  | { kind: "link"; role: ShareRole | null };

/** 59 An ask as `PeerWebPeople.ask` reads it off the query. */
export function peopleQueryOf(ask: PeopleAsk): Record<string, string> {
  switch (ask.kind) {
    case "share": return { share: "1" };
    case "invite": return { invite: ask.address.trim(), role: ask.role };
    case "role": return { person: ask.person, role: ask.role };
    case "remove": return { remove: ask.person };
    case "link": return { link: ask.role ?? "none" };
  }
}

/** 59 Worth sending: an email with a dotted domain, or six digits, as `MapInvitationAddress.parse` takes. */
export function isAddress(text: string): boolean {
  const typed = text.trim();
  if (!typed) return false;
  if (typed.includes("@")) {
    const parts = typed.split("@");
    return parts.length === 2 && parts[0] !== "" && parts[1].includes(".") && !parts[1].startsWith(".")
      && !parts[1].endsWith(".") && !/\s/.test(typed);
  }
  return /^[+0-9 ()\-./]+$/.test(typed) && typed.replace(/\D/g, "").length >= 6;
}
