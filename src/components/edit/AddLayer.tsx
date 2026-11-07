"use client";

import { useEffect, useRef, useState } from "react";
import type { PackageRow, ServerRow } from "@/lib/types";
import { FILE_KINDS, addFile, addPackages, exportServers, importServers, addServerLayers, addServiceLayers, addTiles, loadPackages, loadServers, tickPackage,
  tickServerRow, tickServiceLayer, useViewer } from "@/store/viewer";
import { MarkTile } from "../ui/MarkTile";
import { Sym } from "../ui/Sym";

const tickName = (isTicked: boolean) => isTicked ? "checkmark.circle.fill" : "circle";

function PackageLine({ row }: { row: PackageRow }) {
  const isTicked = useViewer((state) => row.overlay != null && state.packageTicks.has(row.overlay) && !row.isDrawn);
  const words = <span className="words">{row.name}<small>{row.detail}</small>{row.note ? <small>{row.note}</small> : null}</span>;
  if (!row.overlay) return <div className="row dimmed"><MarkTile symbol={row.symbol} small />{words}</div>;
  return (
    <button type="button" className={`row${row.isSubPackage ? " part" : ""}${isTicked ? " picked" : ""}`}
      data-overlay={row.overlay} aria-pressed={isTicked} disabled={row.isDrawn === true} onClick={() => tickPackage(row)}>
      <MarkTile symbol={row.symbol} small />{words}<Sym name={tickName(isTicked)} />
    </button>
  );
}

function TileAddress() {
  const words = useViewer((state) => state.words);
  const [address, setAddress] = useState("");
  return (
    <>
      <h2 className="title">{`${words.tileURL} · TileJSON`}</h2>
      <div className="card"><div className="field">
        <input type="url" id="tileAddress" autoComplete="off" spellCheck={false} placeholder="https://…/{z}/{x}/{y}.png"
          aria-label={words.tileURL} value={address} onChange={(event) => setAddress(event.target.value)} />
      </div></div>
      <button type="button" className="action" id="addTiles" disabled={!address.trim()}
        onClick={() => addTiles(address.trim())}><Sym name="plus" />{words.add}</button>
    </>
  );
}

/** 2995 A file picked here or dropped on the map while Add layer is open. */
function FileLayer() {
  const words = useViewer((state) => state.words);
  useEffect(() => {
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      event.preventDefault();
      void addFile(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return (
    <>
      <h2 className="title">{words.files}</h2>
      <label className="action" htmlFor="layerFile"><Sym name="folder" />{words.chooseFile}</label>
      <input type="file" id="layerFile" accept={FILE_KINDS} hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void addFile(file);
      }} />
      <div className="foot-note">{words.fileKinds}</div>
    </>
  );
}

function ServiceLayers() {
  const words = useViewer((state) => state.words);
  const read = useViewer((state) => state.serviceRead);
  if (!read) return null;
  return (
    <>
      <h2 className="title">{read.reading.title ?? ""}</h2>
      <div className="list" id="serviceLayers">
        {read.reading.rows.map((row) => {
          const lines = <span className="words">{row.title}<small>{row.refusal || row.subtitle}</small></span>;
          if (row.refusal) return <div className="row dimmed" key={row.id}>{lines}</div>;
          const isTicked = read.ticks.has(row.id);
          return (
            <button key={row.id} type="button" className={isTicked ? "row picked" : "row"} aria-pressed={isTicked}
              data-service-layer={row.id} onClick={() => tickServiceLayer(row.id)}>
              {lines}<Sym name={tickName(isTicked)} />
            </button>
          );
        })}
      </div>
      <div className="foot-note">{read.reading.footnote ?? ""}</div>
      <button type="button" className="action" id="addServiceLayers" disabled={read.ticks.size === 0}
        onClick={addServiceLayers}><Sym name="plus" />{words.add}</button>
    </>
  );
}

function ServerLine({ row }: { row: ServerRow }) {
  const key = JSON.stringify(row.pick);
  const isTicked = useViewer((state) => state.serverPicks.has(key));
  const style = { paddingLeft: 14 + row.depth * 14 };
  const lines = <span className="words">{row.title}{row.subtitle ? <small>{row.subtitle}</small> : null}</span>;
  if (row.kind !== "layer") return <div className={row.kind === "note" ? "row dimmed" : "row"} style={style}>{lines}</div>;
  return (
    <button type="button" className={isTicked ? "row picked" : "row"} style={style} aria-pressed={isTicked}
      data-layer={row.pick.layer} onClick={() => tickServerRow(key, row.pick)}>
      {lines}<Sym name={tickName(isTicked)} />
    </button>
  );
}

/** 2997 The servers as a .servson file, out to the browser or in from it. */
function ServerFiles() {
  const words = useViewer((state) => state.words);
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="list">
      <button type="button" className="row add" id="exportServers" onClick={() => void exportServers()}>
        <Sym name="square.and.arrow.up" />{words.exportServers}
      </button>
      <button type="button" className="row add" id="importServers" onClick={() => file.current?.click()}>
        <Sym name="square.and.arrow.down" />{words.importServers}
      </button>
      <input type="file" id="serversFile" accept=".servson" hidden ref={file} onChange={(event) => {
        const chosen = event.target.files?.[0];
        event.target.value = "";
        if (chosen) void importServers(chosen);
      }} />
    </div>
  );
}

function Servers() {
  const words = useViewer((state) => state.words);
  const servers = useViewer((state) => state.servers);
  const hasPicks = useViewer((state) => state.serverPicks.size > 0);
  useEffect(() => {
    if (!servers) void loadServers();
  }, [servers]);
  if (!servers) return null;
  return (
    <>
      <h2 className="title">{words.yourServers}</h2>
      {servers.servers.length === 0 ? <div className="foot-note">{words.noServers}</div> : (
        <>
          {servers.servers.map((server) => (
            <div className="card" data-server={server.id} key={server.id}>
              <div className="row"><span className="words">{server.name}<small>{server.line}</small></span></div>
              {server.rows.map((row, index) => <ServerLine key={index} row={row} />)}
            </div>
          ))}
          <button type="button" className="action" id="addServerLayers" disabled={!hasPicks} onClick={addServerLayers}>
            <Sym name="plus" />{words.add}
          </button>
        </>
      )}
      <ServerFiles />
    </>
  );
}

/** Add layer: the Riki packages, a tile address, a file, and the phone's saved servers. */
export function AddLayer() {
  const words = useViewer((state) => state.words);
  const packages = useViewer((state) => state.packages);
  const ticks = useViewer((state) => state.packageTicks);
  const hasRead = useViewer((state) => state.serviceRead != null);
  useEffect(() => {
    if (!packages) void loadPackages();
  }, [packages]);
  if (!packages) return null;
  const adding = [...ticks].filter((overlay) => !packages.rows.some((row) => row.overlay === overlay && row.isDrawn));
  return (
    <>
      <h2 className="title">{words.whichPackages}</h2>
      <div className="list" id="packages">
        {packages.rows.map((row, index) => <PackageLine key={row.overlay ?? index} row={row} />)}
      </div>
      <div className="foot-note">{words.tickPackages}</div>
      <button type="button" className="action" id="addPackages" disabled={adding.length === 0}
        onClick={() => addPackages(adding)}><Sym name="plus" />{words.add}</button>
      <TileAddress />
      <FileLayer />
      {hasRead ? <ServiceLayers /> : null}
      <Servers />
    </>
  );
}
