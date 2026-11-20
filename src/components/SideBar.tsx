"use client";

import { go, openServer, showEdit, shownMapOf, useViewer } from "@/store/viewer";
import { EditPage, EditTabs } from "./edit/EditPage";
import { MapMark } from "./MapShelf";
import { MapsPage } from "./MapsPage";
import { ServerPage } from "./Servers";
import { SettingsPage } from "./SettingsPage";
import { Sym } from "./ui/Sym";

export function SideBar() {
  const words = useViewer((state) => state.words);
  const editing = useViewer((state) => state.editing);
  const portableName = useViewer((state) => state.portable?.name);
  const shown = useViewer(shownMapOf);
  const server = useViewer((state) => state.servers?.servers.find((each) => each.id === state.serverID));
  const settings = useViewer((state) => state.route.screen === "settings");
  const away = editing || server != null || settings;
  return (
    <aside id="side">
      <section id="mapsPage" className={away ? "page behind" : "page"}><MapsPage /></section>
      <section id="editPage" className={editing ? "page" : "page ahead"}>
        <div className="edit-head">
          <div className="bar">
            <button className="tool round" type="button" id="back" aria-label={words.done} onClick={() => showEdit(false)}>
              <Sym name="chevron.backward" />
            </button>
            {shown ? <MapMark shared={shown} /> : null}
            <h1><small id="editTitle">{editing ? words.edit : ""}</small><span id="editSub">{editing ? portableName : ""}</span></h1>
            <button type="button" className="done" id="editDone" onClick={() => showEdit(false)}>{words.done}</button>
          </div>
          {editing ? <EditTabs /> : null}
        </div>
        <div id="editBody" role="tabpanel">{editing ? <EditPage /> : null}</div>
      </section>
      <section id="serverPage" className={server && !editing ? "page" : "page ahead"}>
        <div className="bar">
          <button className="tool" type="button" id="serverBack" aria-label={words.done} onClick={() => openServer(null)}>
            <Sym name="chevron.backward" />
          </button>
          <h1><span id="serverTitle">{server?.name ?? ""}</span><small>{server?.line ?? ""}</small></h1>
        </div>
        <div id="serverBody">{server && !editing ? <ServerPage /> : null}</div>
      </section>
      <section id="settingsPage" className={settings ? "page" : "page ahead"}>
        <div className="bar">
          <button className="tool" type="button" id="settingsBack" aria-label={words.done}
            onClick={() => go({ screen: "maps" })}>
            <Sym name="chevron.backward" />
          </button>
          <h1><span id="settingsTitle">{words.settings}</span></h1>
        </div>
        <div id="settingsBody">{settings ? <SettingsPage /> : null}</div>
      </section>
    </aside>
  );
}
