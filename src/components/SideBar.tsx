"use client";

import { showEdit, useViewer } from "@/store/viewer";
import { EditPage } from "./edit/EditPage";
import { MapsPage } from "./MapsPage";
import { Sym } from "./ui/Sym";

export function SideBar() {
  const words = useViewer((state) => state.words);
  const editing = useViewer((state) => state.editing);
  const portableName = useViewer((state) => state.portable?.name);
  return (
    <aside id="side">
      <section id="mapsPage" className={editing ? "page behind" : "page"}><MapsPage /></section>
      <section id="editPage" className={editing ? "page" : "page ahead"}>
        <div className="bar">
          <button className="tool" type="button" id="back" aria-label={words.done} onClick={() => showEdit(false)}>
            <Sym name="chevron.backward" />
          </button>
          <h1><span id="editTitle">{editing ? words.edit : ""}</span><small id="editSub">{editing ? portableName : ""}</small></h1>
        </div>
        <div id="editBody">{editing ? <EditPage /> : null}</div>
      </section>
    </aside>
  );
}
