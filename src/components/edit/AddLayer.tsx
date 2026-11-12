"use client";

import { useEffect, useRef, useState } from "react";
import type { APIRead, APIReading, PackageRow, ServerRow } from "@/lib/types";
import { FILE_KINDS, SERVER_KINDS, addAPI, addFile, addPackages, addServer, addServerLayers, addServiceLayers, addTiles,
  exportServers, importServers, loadPackages, loadServers, readAPI, tickPackage, tickServerRow, tickServiceLayer,
  useViewer } from "@/store/viewer";
import { Skeleton } from "../Overlays";
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

function KeyPicker({ id, label, value, keys, onPick, offersNone = false }: { id: string; label: string;
  value: string; keys: string[]; onPick: (key: string) => void; offersNone?: boolean }) {
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onPick(event.target.value)}>
        {offersNone || !keys.includes(value) ? <option value="">—</option> : null}
        {keys.map((key) => <option key={key} value={key}>{key || "·"}</option>)}
      </select>
    </div>
  );
}

/** 3003: an API read on the phone, its keys guessed there and picked here. */
function APILayer() {
  const words = useViewer((state) => state.words);
  const [address, setAddress] = useState("");
  const [read, setRead] = useState<APIRead | null>(null);
  const ask = async (reading?: APIReading | null) => setRead(await readAPI(address.trim(), reading));
  const reading = read?.reading;
  const pick = (change: Partial<APIReading>) => {
    if (reading) void ask({ ...reading, ...change });
  };
  const keys = read?.keys ?? [];
  return (
    <>
      <h2 className="title">{words.apiLayers}</h2>
      <div className="card" id="apiCard">
        <div className="field">
          <input type="url" id="apiAddress" autoComplete="off" spellCheck={false} placeholder="https://…"
            aria-label={words.apiAddress} value={address} onChange={(event) => {
              setAddress(event.target.value);
              setRead(null);
            }} />
        </div>
        {read && reading ? (
          <>
            <KeyPicker id="apiItemsPath" label={words.itemsPath} value={reading.itemsPath} keys={read.paths}
              onPick={(itemsPath) => pick({ itemsPath, latitudeKey: "", longitudeKey: "", positionKey: "" })} />
            {reading.spelling === "position"
              ? <KeyPicker id="apiPosition" label={words.bothIn} value={reading.positionKey} keys={keys}
                onPick={(positionKey) => pick({ positionKey })} />
              : <>
                <KeyPicker id="apiLatitude" label={words.latitude} value={reading.latitudeKey} keys={keys}
                  onPick={(latitudeKey) => pick({ latitudeKey })} />
                <KeyPicker id="apiLongitude" label={words.longitude} value={reading.longitudeKey} keys={keys}
                  onPick={(longitudeKey) => pick({ longitudeKey })} />
              </>}
            <KeyPicker id="apiName" label={words.name} value={reading.nameKey ?? ""} keys={keys} offersNone
              onPick={(nameKey) => pick({ nameKey: nameKey || null })} />
            <div className="foot-note" id="apiSaid">{read.said}</div>
          </>
        ) : null}
      </div>
      {read && reading
        ? <button type="button" className="action" id="addAPI" disabled={!read.points}
          onClick={() => void addAPI(address.trim(), reading, read.name)}><Sym name="plus" />{words.add}</button>
        : <button type="button" className="action" id="readAPI" disabled={!address.trim()}
          onClick={() => void ask()}>{words.apiRead}</button>}
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

/** 2996 A server named by its address; the phone reads it before saving it. */
function NewServer() {
  const words = useViewer((state) => state.words);
  const [kind, setKind] = useState<string>(SERVER_KINDS[0]);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [reading, setReading] = useState(false);
  const submit = async () => {
    setReading(true);
    if (await addServer(kind, address.trim(), name.trim())) {
      setAddress("");
      setName("");
    }
    setReading(false);
  };
  return (
    <>
      <h2 className="title">{words.newServer}</h2>
      <div className="card"><div className="field">
        <select id="serverKind" aria-label={words.newServer} value={kind} onChange={(event) => setKind(event.target.value)}>
          {SERVER_KINDS.map((each) => <option key={each} value={each}>{words[`serverKind.${each}`]}</option>)}
        </select>
        <input type="url" id="serverAddress" autoComplete="off" spellCheck={false} placeholder="https://…"
          aria-label={words.serverAddress} value={address} onChange={(event) => setAddress(event.target.value)} />
        <input type="text" id="serverName" autoComplete="off" placeholder={words.name} aria-label={words.name}
          value={name} onChange={(event) => setName(event.target.value)} />
      </div></div>
      <button type="button" className="action" id="addServer" disabled={!address.trim() || reading}
        onClick={() => void submit()}><Sym name="plus" />{words.newServer}</button>
    </>
  );
}

function Servers() {
  const words = useViewer((state) => state.words);
  const servers = useViewer((state) => state.servers);
  const hasPicks = useViewer((state) => state.serverPicks.size > 0);
  useEffect(() => {
    if (!servers) void loadServers();
  }, [servers]);
  if (!servers) return <Skeleton />;
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
  if (!packages) return <Skeleton />;
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
      <APILayer />
      {hasRead ? <ServiceLayers /> : null}
      <Servers />
      <NewServer />
    </>
  );
}
