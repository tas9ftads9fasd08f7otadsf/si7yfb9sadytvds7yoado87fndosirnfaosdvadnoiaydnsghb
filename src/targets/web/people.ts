import type { SharePeople, ShareRole } from "@/lib/types";
import type { PeopleRead } from "./core";

/** The sentences a read share is put in, from the page's words. */
export type Say = (key: "someone" | "you" | "joined" | "invited" | `role.${ShareRole}`) => string;

/** 160 Owner first, then by name in the reader's language; the core has no language's rules (rikimaps 3551). */
export function sortedPeople(people: PeopleRead["people"], language: string, say: Say): PeopleRead["people"] {
  const collator = new Intl.Collator(language, { sensitivity: "base" });
  const shown = (person: PeopleRead["people"][number]) => person.name || say("someone");
  return [...people].sort((one, other) => (one.role === "owner" ? 0 : 1) - (other.role === "owner" ? 0 : 1)
    || collator.compare(shown(one), shown(other)) || (one.id < other.id ? -1 : one.id > other.id ? 1 : 0));
}

/** 108 What the core read of a map's share, as the People card shows it: read only, nothing offered to change. */
export function peopleOf(read: PeopleRead, say: Say, language = "en"): SharePeople {
  return {
    isShared: read.shared,
    role: read.role,
    mayInvite: false,
    invitesDirectly: false,
    people: sortedPeople(read.people, language, say).map((person) => {
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
