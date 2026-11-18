import { create } from "zustand";
import { backend } from "@backend";
import type { PeopleAsk, Sharer } from "@/lib/people";
import type { SharePeople } from "@/lib/types";
import { editing, told, useViewer } from "./viewer";

/** 59 Edit map's People card, and since 68 a folder's: who the phone's share holds. */
export interface PeopleState {
  of: Sharer | null;
  people: SharePeople | null;
  /** An ask the phone is carrying out, which iCloud may take a while to answer. */
  asking: PeopleAsk["kind"] | null;
  /** The address just invited, shown with the link to send them. */
  invited: string | null;
}

const FIRST: PeopleState = { of: null, people: null, asking: null, invited: null };

export const usePeople = create<PeopleState>(() => FIRST);

const set = usePeople.setState;
const get = usePeople.getState;

export const resetPeople = () => set(FIRST, true);

export const isSharer = (one: Sharer | null, other: Sharer | null) =>
  one != null && other != null && one.kind === other.kind && one.id === other.id;

/** 59 Read again for each map or folder opened; an answer for one no longer shown is dropped. */
export async function loadPeople(of: Sharer) {
  if (!useViewer.getState().editToken) return;
  if (!isSharer(get().of, of)) set({ ...FIRST, of });
  const answer = await editing(() => backend.people(of), { quiet: true });
  if (answer?.ok && isSharer(get().of, of)) set({ people: answer.value });
}

/** 68 A folder's sharing shown no more. */
export const closePeople = () => set(FIRST, true);

/** 59 One change, as the People screen makes it; the phone answers with the people again. */
export async function askPeople(ask: PeopleAsk): Promise<boolean> {
  const { of, asking } = get();
  if (!of || asking) return false;
  set({ asking: ask.kind });
  const people = told(await editing(() => backend.askPeople(of, ask)));
  if (!isSharer(get().of, of)) return false;
  set({ asking: null });
  if (!people) return false;
  set({ people, invited: ask.kind === "invite" ? ask.address.trim() : get().invited });
  return true;
}

export const inviteAnother = () => set({ invited: null });

/** 59 Taking someone off asks first, as the person's page does. */
export function removePerson(id: string, name: string) {
  const ask = useViewer.getState().words.removePersonAsk.replace("{name}", name);
  if (confirm(ask)) void askPeople({ kind: "remove", person: id });
}
