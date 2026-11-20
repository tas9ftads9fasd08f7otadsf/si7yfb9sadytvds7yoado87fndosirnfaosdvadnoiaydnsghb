import type { SharePeople, ShareRole } from "@/lib/types";
import type { PeopleRead } from "./core";

/** The sentences a read share is put in, from the page's words. */
export type Say = (key: "someone" | "you" | "joined" | "invited" | `role.${ShareRole}`) => string;

/** 108 What the core read of a map's share, as the People card shows it: read only, nothing offered to change. */
export function peopleOf(read: PeopleRead, say: Say): SharePeople {
  return {
    isShared: read.shared,
    role: read.role,
    mayInvite: false,
    invitesDirectly: false,
    people: read.people.map((person) => {
      const name = person.name || say("someone");
      const stands = person.role === "owner" ? "" : ` · ${say(person.hasAccepted ? "joined" : "invited")}`;
      return { id: person.id, name: person.isYou ? `${name} (${say("you")})` : name, role: person.role,
        line: `${say(`role.${person.role}`)}${stands}`, hasAccepted: person.hasAccepted, isYou: person.isYou,
        mayChangeRole: false, mayRemove: false };
    }),
    tally: "",
    link: null,
    linkRole: read.linkRole,
    mayChangeLink: false,
    heldBy: null,
    caveat: "",
    readOnly: true
  };
}
