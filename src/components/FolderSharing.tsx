"use client";

import { closePeople, loadPeople, usePeople } from "@/store/people";
import { useViewer } from "@/store/viewer";
import { Roster } from "./edit/People";
import { Sym } from "./ui/Sym";

const isOpen = (id: string) => (state: ReturnType<typeof usePeople.getState>) =>
  state.of?.kind === "folder" && state.of.id === id;

/** 68 A folder's Sharing, opened from its row as the phone's folder opens its Sharing page. */
export function FolderShareButton({ id, name }: { id: string; name: string }) {
  const words = useViewer((state) => state.words);
  const open = usePeople(isOpen(id));
  return (
    <button type="button" className="icon-button" aria-label={`${words.folderSharing} · ${name}`}
      title={words.folderSharing} aria-expanded={open}
      onClick={() => (open ? closePeople() : void loadPeople({ kind: "folder", id }))}>
      <Sym name="person.2" />
    </button>
  );
}

/** 68 The folder's people under its row, the map card's parts with the folder's own words. */
export function FolderPeople({ id }: { id: string }) {
  const people = usePeople((state) => (isOpen(id)(state) ? state.people : null));
  return people ? <div className="folder-people" data-folder-people={id}><Roster people={people} /></div> : null;
}
