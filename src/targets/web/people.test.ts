import { describe, expect, it } from "vitest";
import { ENGLISH } from "@/lib/words";
import type { PeopleRead } from "./core";
import { peopleOf, sortedPeople } from "./people";

const say = (key: keyof typeof ENGLISH) => ENGLISH[key];

const read: PeopleRead = { shared: true, role: "admin", linkRole: null, people: [
  { id: "o", name: "Friki", role: "owner", hasAccepted: true, isYou: false },
  { id: "a", name: "Ada", role: "admin", hasAccepted: true, isYou: true },
  { id: "e", name: "Eva", role: "editor", hasAccepted: false, isYou: false },
  { id: "n", name: null, role: "reader", hasAccepted: true, isYou: false }] };

describe("the card made of what the core read", () => {
  // 108 invited and joined are told apart, the owner needs neither, you are marked and a nameless one is someone
  it("tells owner, joined and invited people, marks the one who is you and names the nameless", () => {
    const { people } = peopleOf(read, say);
    expect(people.map((each) => [each.name, each.line])).toEqual([
      ["Friki", "Owner"], ["Ada (you)", "Admin · Joined"], ["Eva", "Can edit · Invited"], ["Someone", "View only · Joined"]]);
    expect(people.map((each) => each.hasAccepted)).toEqual([true, true, false, true]);
  });

  // 108 the site reads: no role, removal, invitation or link is offered to anyone, whatever role the person has
  it("offers no change whatever the person's own role", () => {
    const card = peopleOf(read, say);
    expect(card).toMatchObject({ isShared: true, role: "admin", readOnly: true, mayInvite: false, invitesDirectly: false,
      mayChangeLink: false, link: null, heldBy: null, tally: "", caveat: "" });
    expect(card.people.some((each) => each.mayChangeRole || each.mayRemove)).toBe(false);
  });

  it("carries the link's role, and none while only invited people join", () => {
    expect(peopleOf(read, say).linkRole).toBeNull();
    expect(peopleOf({ ...read, linkRole: "reader" }, say).linkRole).toBe("reader");
  });

  it("answers a map nobody shares with no people", () => {
    expect(peopleOf({ shared: false, role: "owner", people: [], linkRole: null }, say))
      .toMatchObject({ isShared: false, people: [], readOnly: true });
  });

  // 160 the core orders by code point, where Č comes after Z; Slovak puts it between C and D
  it("sorts names by the reader's language, the owner first and the nameless by the word for them", () => {
    const people: PeopleRead["people"] = [
      { id: "d", name: "Dana", role: "editor", hasAccepted: true, isYou: false },
      { id: "c2", name: "Čestmír", role: "reader", hasAccepted: true, isYou: false },
      { id: "z", name: "Zuzana", role: "owner", hasAccepted: true, isYou: false },
      { id: "c1", name: "cyril", role: "reader", hasAccepted: true, isYou: false },
      { id: "n", name: null, role: "reader", hasAccepted: false, isYou: false }];
    expect(sortedPeople(people, "sk", say).map((each) => each.id)).toEqual(["z", "c1", "c2", "d", "n"]);
    expect(peopleOf({ ...read, people }, say, "sk").people.map((each) => each.id)).toEqual(["z", "c1", "c2", "d", "n"]);
    expect(sortedPeople(people, "en", say).map((each) => each.id).slice(0, 3)).toEqual(["z", "c2", "c1"]);
  });
});
