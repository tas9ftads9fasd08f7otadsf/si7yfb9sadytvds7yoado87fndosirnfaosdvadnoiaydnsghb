import { create } from "zustand";
import { backend } from "@backend";
import type { PeopleAsk } from "@/lib/people";
import type { SharePeople } from "@/lib/types";
import { editing, told, useViewer } from "./viewer";

/** 59 Edit map's People card: who the phone's share holds, for the map on screen. */
export interface PeopleState {
  mapID: string | null;
  people: SharePeople | null;
  /** An ask the phone is carrying out, which iCloud may take a while to answer. */
  asking: PeopleAsk["kind"] | null;
  /** The address just invited, shown with the link to send them. */
  invited: string | null;
}

export const usePeople = create<PeopleState>(() => ({ mapID: null, people: null, asking: null, invited: null }));

const set = usePeople.setState;

export const resetPeople = () => set({ mapID: null, people: null, asking: null, invited: null }, true);

/** 59 Read again for each map opened; an answer for a map no longer on screen is dropped. */
export async function loadPeople() {
  const { mapID, editToken } = useViewer.getState();
  if (!mapID || !editToken) return;
  if (usePeople.getState().mapID !== mapID) set({ mapID, people: null, asking: null, invited: null });
  const answer = await editing(() => backend.people(mapID), { quiet: true });
  if (answer?.ok && usePeople.getState().mapID === mapID) set({ people: answer.value });
}

/** 59 One change, as the People screen makes it; the phone answers with the people again. */
export async function askPeople(ask: PeopleAsk): Promise<boolean> {
  const { mapID } = useViewer.getState();
  if (!mapID || usePeople.getState().asking) return false;
  set({ asking: ask.kind });
  const people = told(await editing(() => backend.askPeople(mapID, ask)));
  if (usePeople.getState().mapID !== mapID) return false;
  set({ asking: null });
  if (!people) return false;
  set({ people, invited: ask.kind === "invite" ? ask.address.trim() : usePeople.getState().invited });
  return true;
}

export const inviteAnother = () => set({ invited: null });

/** 59 Taking someone off asks first, as the person's page does. */
export function removePerson(id: string, name: string) {
  const ask = useViewer.getState().words.removePersonAsk.replace("{name}", name);
  if (confirm(ask)) void askPeople({ kind: "remove", person: id });
}
