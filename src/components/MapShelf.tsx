"use client";

import { type FormEvent, useState } from "react";
import { movedInFolder, movedOrder, type ShelfItem, shelfOf } from "@/lib/shelf";
import type { SharedMap } from "@/lib/types";
import { openMap, shelve, useViewer } from "@/store/viewer";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";

export function useLayerCount() {
  const words = useViewer((state) => state.words);
  return (count: number) => words[`layers.${count}`] ?? String(count);
}

export function MapMark({ shared }: { shared: SharedMap }) {
  const icon = useViewer((state) => state.pictures.get(shared.id)?.icon);
  const pending = useViewer((state) => !state.pictures.has(shared.id));
  return <MarkTile symbol={shared.symbol} tint={shared.iconTintHex} picture={icon} pending={pending} />;
}

function MapRow({ shared }: { shared: SharedMap }) {
  const isShown = useViewer((state) => state.mapID === shared.id);
  const layerCount = useLayerCount();
  return (
    <button type="button" className={isShown ? "row picked" : "row"} aria-current={isShown ? "true" : undefined}
      onClick={() => openMap(shared.id)}>
      <MapMark shared={shared} />
      <span className="words">{shared.name}<small>{layerCount(shared.layers.length)}</small></span>
    </button>
  );
}

/** Up and down, named after what they move so a reader of the page hears which. */
function MoveButtons({ name, place, count, move }:
  { name: string; place: number; count: number; move: (by: number) => void }) {
  const words = useViewer((state) => state.words);
  return (
    <>
      <button type="button" className="icon-button" aria-label={`${words.moveUp} ${name}`} title={words.moveUp}
        disabled={place === 0} onClick={() => move(-1)}><Sym name="chevron.up" /></button>
      <button type="button" className="icon-button" aria-label={`${words.moveDown} ${name}`} title={words.moveDown}
        disabled={place === count - 1} onClick={() => move(1)}><Sym name="chevron.down" /></button>
    </>
  );
}

function IntoFolder({ shared, folders }: { shared: SharedMap; folders: ShelfItem[] }) {
  const words = useViewer((state) => state.words);
  if (!folders.length) return null;
  return (
    <select aria-label={`${words.into} · ${shared.name}`} value=""
      onChange={(event) => event.target.value && shelve({ kind: "join", folder: event.target.value, map: shared.id })}>
      <option value="">{words.into}</option>
      {folders.map((folder) => folder.kind === "folder"
        ? <option key={folder.id} value={folder.id}>{folder.name}</option> : null)}
    </select>
  );
}

function FolderName({ id, name }: { id: string; name: string }) {
  const words = useViewer((state) => state.words);
  const [typed, setTyped] = useState(name);
  const commit = () => {
    const trimmed = typed.trim();
    if (trimmed && trimmed !== name) void shelve({ kind: "renameFolder", folder: id, name: trimmed });
    else setTyped(name);
  };
  return (
    <input type="text" className="folder-name" aria-label={`${words.rename} · ${name}`} value={typed}
      onChange={(event) => setTyped(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  );
}

function NewFolder({ loose }: { loose: SharedMap[] }) {
  const words = useViewer((state) => state.words);
  const [isMaking, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  if (loose.length < 2) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || picked.length < 2) return;
    if (!(await shelve({ kind: "makeFolder", name: name.trim(), maps: picked }))) return;
    setMaking(false);
    setName("");
    setPicked([]);
  };
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((each) => each !== id) : [...picked, id]);
  if (!isMaking) {
    return (
      <button type="button" className="row add" id="newFolderButton" onClick={() => setMaking(true)}>
        <Sym name="folder" />{words.newFolder}
      </button>
    );
  }
  return (
    <form id="newFolder" className="list" onSubmit={submit}>
      <input id="newFolderName" type="text" aria-label={words.name} placeholder={words.name} autoFocus
        value={name} onChange={(event) => setName(event.target.value)} />
      {loose.map((map) => (
        <label className="row" key={map.id}>
          <input type="checkbox" checked={picked.includes(map.id)} onChange={() => toggle(map.id)} />
          <span className="words">{map.name}</span>
        </label>
      ))}
      <div className="row">
        <button type="button" className="action" onClick={() => setMaking(false)}>{words.cancel}</button>
        <button type="submit" className="action" id="newFolderSave" disabled={!name.trim() || picked.length < 2}>
          {words.save}</button>
      </div>
    </form>
  );
}

/** 52 The phone's maps in their folders and order; a browser allowed to edit arranges them. */
export function MapShelf({ maps }: { maps: SharedMap[] }) {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  const shelf = shelfOf(maps, words.folder);
  const folders = shelf.filter((item) => item.kind === "folder");
  const moveItem = (place: number, by: number) => {
    const order = movedOrder(shelf, place, by);
    if (order) void shelve({ kind: "order", maps: order });
  };
  const moveInFolder = (folder: string, place: number, by: number) => {
    const order = movedInFolder(shelf, folder, place, by);
    if (order) void shelve({ kind: "order", maps: order });
  };
  if (!canEdit) {
    return <div className="list" id="mapList">{maps.map((each) => <MapRow key={each.id} shared={each} />)}</div>;
  }
  return (
    <>
      <div className="chips" role="group" aria-label={words.sort}>
        <button type="button" id="sortAZ" onClick={() => shelve({ kind: "sort", sort: "nameAscending" })}>
          {words.nameAZ}</button>
        <button type="button" id="sortZA" onClick={() => shelve({ kind: "sort", sort: "nameDescending" })}>
          {words.nameZA}</button>
      </div>
      <div className="list" id="mapList">
        {shelf.map((item, place) => item.kind === "map" ? (
          <div className="shelf-row" key={item.id} data-map={item.id}>
            <MapRow shared={item.map} />
            <IntoFolder shared={item.map} folders={folders} />
            <MoveButtons name={item.map.name} place={place} count={shelf.length} move={(by) => moveItem(place, by)} />
          </div>
        ) : (
          <div className="folder" key={item.id} data-folder={item.id}>
            <div className="shelf-row">
              <Sym name="folder" />
              <FolderName key={item.name} id={item.id} name={item.name} />
              <MoveButtons name={item.name} place={place} count={shelf.length} move={(by) => moveItem(place, by)} />
            </div>
            {item.maps.map((map, inner) => (
              <div className="shelf-row inside" key={map.id} data-map={map.id}>
                <MapRow shared={map} />
                <button type="button" className="icon-button" aria-label={`${words.outOfFolder} · ${map.name}`}
                  title={words.outOfFolder} onClick={() => shelve({ kind: "leave", map: map.id })}>
                  <Sym name="arrow.uturn.backward" /></button>
                <MoveButtons name={map.name} place={inner} count={item.maps.length}
                  move={(by) => moveInFolder(item.id, inner, by)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <NewFolder loose={shelf.flatMap((item) => (item.kind === "map" ? [item.map] : []))} />
    </>
  );
}
