"use client";

import { useEffect, useRef, useState } from "react";
import type { DXFReading, FoundServer, FoundServers, OtherMap, PackageRow, Server, ServerRow } from "@/lib/types";
import { FILE_KINDS, SERVER_KINDS, addCopies, addFile, isDXF, readDXF, addPackages, addServer, addServerLayers, addServiceLayers, addTiles,
  exportServers, findServers, importServers, loadOtherLayers, loadPackages, loadServers, offers, tickCopy, tickPackage, tickServerRow, tickServiceLayer,
  tuneServerRow, useViewer } from "@/store/viewer";
import { mapControl } from "@/map/control";
import { filledIn } from "@/lib/words";
import { Skeleton } from "../Overlays";
import { APILayer } from "./APILayer";
import { ServerLayerPage } from "./ServerLayerPage";
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

const SLOTS = ["{z}", "{x}", "{y}", "{s}", "{r}", "{quadkey}"];

/** 111 W11: a tile address with its slots, and one tile of it where the map looks, at zoom 14. */
function TileAddress() {
  const words = useViewer((state) => state.words);
  const [address, setAddress] = useState("");
  const [works, setWorks] = useState<string | null>(null);
  const camera = mapControl()?.camera();
  const preview = camera ? tileAt(address.trim(), camera.lng, camera.lat, 14) : null;
  useEffect(() => {
    if (!preview) return;
    let current = true;
    const probe = new Image();
    probe.onload = () => current && setWorks(preview);
    probe.src = preview;
    return () => { current = false; };
  }, [preview]);
  return (
    <>
      <h2 className="title">{`${words.tileURL} · TileJSON`}</h2>
      <div className="card tile-address"><div className="field">
        <input type="url" id="tileAddress" autoComplete="off" spellCheck={false} placeholder="https://…/{z}/{x}/{y}.png"
          aria-label={words.tileURL} value={address} onChange={(event) => setAddress(event.target.value)} />
        {preview && works === preview ? <span className="pill-tag on" id="tileWorks">{words.works}</span> : null}
      </div></div>
      <div className="chips slots" role="group" aria-label={words.tileURL}>
        {SLOTS.map((slot) => (
          <button type="button" key={slot} onClick={() => setAddress(address + slot)}>{slot}</button>
        ))}
      </div>
      {preview ? (
        <div className="tile-preview">
          <span className="tile-image" role="img" aria-label={words.sheetPreview}
            style={{ backgroundImage: `url(${JSON.stringify(preview)})` }} />
          <span>{filledIn(words.previewZoom, "zoom", "14")}</span>
        </div>
      ) : null}
      <button type="button" className="action" id="addTiles" disabled={!address.trim()}
        onClick={() => addTiles(address.trim())}><Sym name="plus" />{words.add}</button>
    </>
  );
}

/** 111 One tile's address where the map looks, for an XYZ template; none for anything else. */
export function tileAt(template: string, lng: number, lat: number, zoom: number): string | null {
  if (!/^https?:\/\//.test(template) || !template.includes("{z}") || !template.includes("{x}")) return null;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  let quadkey = "";
  for (let level = zoom; level > 0; level -= 1) {
    const bit = 1 << (level - 1);
    quadkey += String((x & bit ? 1 : 0) + (y & bit ? 2 : 0));
  }
  return template.replaceAll("{z}", String(zoom)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y))
    .replaceAll("{s}", "a").replaceAll("{r}", "").replaceAll("{quadkey}", quadkey);
}

/** 3409 A DXF waits for its coordinate system, picked from the phone's own list. */
function DrawingSystem({ drawing, onDone }: { drawing: Drawing; onDone: () => void }) {
  const words = useViewer((state) => state.words);
  const [system, setSystem] = useState(drawing.reading.system ?? "");
  return (
    <>
      <div className="card" id="dxfCard" data-file={drawing.reading.fileName}>
        <div className="field"><label htmlFor="dxfSystem">{words.dxfCoordinates}</label>
          <select id="dxfSystem" value={system} onChange={(event) => setSystem(event.target.value)}>
            {system ? null : <option value="">{words.dxfChoose}</option>}
            {drawing.reading.systems.map((each) => <option key={each.value} value={each.value}>{each.title}</option>)}
          </select>
          <small id="dxfSaid">{system === (drawing.reading.system ?? "") ? drawing.reading.said : ""}</small>
        </div>
      </div>
      <button type="button" className="action" id="addDXF" disabled={!system}
        onClick={async () => {
          if (await addFile(drawing.file, system)) onDone();
        }}><Sym name="plus" />{words.add}</button>
    </>
  );
}

interface Drawing {
  file: File;
  reading: DXFReading;
}

/** 2995 A file picked here or dropped on the map while Add layer is open. */
function FileLayer() {
  const words = useViewer((state) => state.words);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const take = useRef(async (file: File) => {
    setDrawing(null);
    if (!isDXF(file)) {
      await addFile(file);
      return;
    }
    const reading = await readDXF(file);
    if (reading) setDrawing({ file, reading });
  });
  useEffect(() => {
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      event.preventDefault();
      void take.current(file);
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
        if (file) void take.current(file);
      }} />
      {drawing ? <DrawingSystem key={drawing.reading.fileName} drawing={drawing} onDone={() => setDrawing(null)} /> : null}
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

function ServerLine({ row, server }: { row: ServerRow; server: Server }) {
  const words = useViewer((state) => state.words);
  const key = JSON.stringify(row.pick);
  const isTicked = useViewer((state) => state.serverPicks.has(key));
  const style = { paddingLeft: 14 + row.depth * 14 };
  const lines = <span className="words">{row.title}{row.subtitle ? <small>{row.subtitle}</small> : null}</span>;
  if (row.kind === "note") return <div className="row dimmed server-note" style={style}>{lines}</div>;
  if (row.kind !== "layer") return <div className="row server-heading" style={style}><Sym name="folder" />{lines}</div>;
  const pickButton = (
    <button type="button" className={isTicked ? "row server-pick picked" : "row server-pick"} style={style}
      aria-pressed={isTicked} data-layer={row.pick.layer} onClick={() => tickServerRow(key, row.pick)}>
      <span className="tick" aria-hidden="true">{isTicked ? <Sym name="checkmark" /> : null}</span>{lines}
    </button>
  );
  if (!isTicked) return pickButton;
  return (
    <div className="server-pick-line">
      {pickButton}
      <button type="button" className="tune" aria-label={words.adjustBeforeAdding} title={words.adjustBeforeAdding}
        data-tune={row.pick.layer} onClick={() => tuneServerRow({ server, row })}>
        <Sym name="slider.horizontal.3" />
      </button>
    </div>
  );
}

/** 180 A server whose name or address matches keeps every row; else only the rows that match. */
export function matchingServers(servers: Server[], query: string): Server[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return servers;
  const names = (...texts: (string | null | undefined)[]) => texts.some((text) => text?.toLowerCase().includes(needle));
  return servers.flatMap((server) => {
    if (names(server.name, server.line, server.address)) return [server];
    const rows = server.rows.filter((row) => row.kind === "layer" && names(row.title, row.subtitle));
    return rows.length ? [{ ...server, rows }] : [];
  });
}

/** 180 As the app's Servers page: the server's tile and lines, its rows folding away under them. */
function ServerCard({ server, isOpen, onFold }: { server: Server; isOpen: boolean; onFold: () => void }) {
  return (
    <div className="card server-card" data-server={server.id}>
      <button type="button" className="row server-head" aria-expanded={isOpen} onClick={onFold}>
        <MarkTile symbol={server.symbol ?? "server.rack"} tint={server.iconTintHex} small />
        <span className="words">{server.name}<small>{server.line}</small></span>
        <Sym name={isOpen ? "chevron.up" : "chevron.down"} />
      </button>
      {isOpen ? server.rows.map((row, index) => <ServerLine key={index} row={row} server={server} />) : null}
    </div>
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

/** 189 The server form's From a website: a page read for the servers it uses, one picked into the form. */
export function FromWebsite({ onPick }: { onPick: (found: FoundServer, page: string) => void }) {
  const words = useViewer((state) => state.words);
  const [page, setPage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<FoundServers | null>(null);
  const scan = async () => {
    setScanning(true);
    setResult(null);
    setResult(await findServers(page.trim()));
    setScanning(false);
  };
  return (
    <div className="card" id="serverWebsite">
      <div className="row"><span className="words">{words.fromWebsite}<small>{words.fromWebsiteNote}</small></span></div>
      <div className="field">
        <input type="url" id="serverWebsiteAddress" autoComplete="off" spellCheck={false} placeholder="https://mapy.tuzvo.sk/hofm/"
          aria-label={words.fromWebsite} value={page} onChange={(event) => setPage(event.target.value)} />
      </div>
      <button type="button" className="row add" id="serverWebsiteScan" disabled={!page.trim() || scanning}
        onClick={() => void scan()}><Sym name="magnifyingglass" />{scanning ? words.readingPage : words.findServers}</button>
      <div className="foot-note">{words.onlyPageFiles}</div>
      {result ? (
        <div className="list" id="serverWebsiteFound" aria-label={words.serversItUses}>
          {result.found.length === 0 ? <div className="foot-note">{words.noServerOnPage}</div> : result.found.map((found) => (
            <button type="button" className="row add" key={found.id} data-found={found.id}
              aria-label={`${found.title}, ${found.kindTitle}`} onClick={() => onPick(found, result.page)}>
              <Sym name={found.symbol} />
              <span className="words">{found.title}<small>{found.kindTitle} · {found.host}</small></span>
              <Sym name="plus.circle.fill" />
            </button>
          ))}
        </div>
      ) : null}
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
  const [found, setFound] = useState<{ id: string; page: string; address: string } | null>(null);
  const submit = async () => {
    setReading(true);
    const picked = found && found.address === address.trim() ? { id: found.id, page: found.page } : undefined;
    if (await addServer(kind, address.trim(), name.trim(), picked)) {
      setAddress("");
      setName("");
      setFound(null);
    }
    setReading(false);
  };
  const pick = (server: FoundServer, page: string) => {
    if ((SERVER_KINDS as readonly string[]).includes(server.kind)) setKind(server.kind);
    setAddress(server.address);
    if (server.title.trim()) setName(server.title);
    setFound({ id: server.id, page, address: server.address });
  };
  return (
    <>
      <h2 className="title">{words.newServer}</h2>
      <FromWebsite onPick={pick} />
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
  const ticked = useViewer((state) => state.serverPicks.size);
  const tuning = useViewer((state) => state.serverTuning);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!servers) void loadServers();
  }, [servers]);
  if (!servers) return <Skeleton />;
  if (tuning) return <ServerLayerPage server={tuning.server} row={tuning.row} />;
  const shown = matchingServers(servers.servers, query);
  const fold = (id: string) => setFolded((was) => {
    const next = new Set(was);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return (
    <>
      <div className="card search"><div className="field">
        <input type="search" id="serverSearch" autoComplete="off" spellCheck={false} placeholder={words.searchServers}
          aria-label={words.searchServers} value={query} onChange={(event) => setQuery(event.target.value)} />
      </div></div>
      <div className="title-row">
        <h2 className="title">{words.yourServers}</h2>
        <button type="button" className="text-button" id="serverNew"
          onClick={() => document.getElementById("serverAddress")?.focus()}>
          <Sym name="plus" />{words.newServer}
        </button>
      </div>
      {servers.servers.length === 0 ? <div className="foot-note">{words.noServers}</div> : (
        <>
          {shown.length === 0 ? (
            <div className="foot-note" id="serverNoMatch">{filledIn(words.noLayerMatches, "query", query.trim())}</div>
          ) : shown.map((server) => (
            <ServerCard key={server.id} server={server} isOpen={query.trim() !== "" || !folded.has(server.id)}
              onFold={() => fold(server.id)} />
          ))}
          <div className="source-foot">
            <span className="foot-note" id="serverTicked">
              {ticked ? filledIn(words.layersSelected, "count", String(ticked)) : words.nothingSelected}
            </span>
            <button type="button" className="action" id="addServerLayers" disabled={ticked === 0}
              onClick={addServerLayers}>
              <Sym name="plus" />{ticked ? filledIn(words.addCount, "count", String(ticked)) : words.add}
            </button>
          </div>
        </>
      )}
      <ServerFiles />
    </>
  );
}

/** 119 A map's name keeps all its layers; a layer's words keep only that layer. */
export function matchingLayers(groups: OtherMap[], query: string): OtherMap[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  const names = (...texts: (string | null | undefined)[]) => texts.some((text) => text?.toLowerCase().includes(needle));
  return groups.flatMap((group) => {
    if (names(group.name)) return [group];
    const rows = group.rows.filter((row) => names(row.title, row.subtitle));
    return rows.length ? [{ ...group, rows }] : [];
  });
}

function CopyLine({ layer }: { layer: OtherMap["rows"][number] }) {
  const isTicked = useViewer((state) => state.copyTicks.has(layer.layer));
  const lines = <span className="words">{layer.title}<small>{layer.blocked || layer.subtitle}</small></span>;
  if (layer.blocked) return <div className="row dimmed" data-copy-layer={layer.layer}><MarkTile symbol={layer.symbol} small />{lines}</div>;
  return (
    <button type="button" className={isTicked ? "row picked" : "row"} aria-pressed={isTicked}
      data-copy-layer={layer.layer} onClick={() => tickCopy(layer.layer)}>
      <MarkTile symbol={layer.symbol} small />{lines}<Sym name={tickName(isTicked)} />
    </button>
  );
}

/** 119 W11's From another map: a card for each other map, its layers ticked. */
function FromMaps() {
  const words = useViewer((state) => state.words);
  const other = useViewer((state) => state.otherLayers);
  const ticked = useViewer((state) => state.copyTicks.size);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!other) void loadOtherLayers();
  }, [other]);
  if (!other) return <Skeleton />;
  const shown = matchingLayers(other.groups, query);
  return (
    <>
      <h2 className="title">{words.anotherMap}</h2>
      {other.groups.length === 0 ? <div className="foot-note" id="copyNone">{words.noOtherLayers}</div> : (
        <>
          <div className="card"><div className="field">
            <input type="search" id="copySearch" autoComplete="off" spellCheck={false} placeholder={words.searchMapsLayers}
              aria-label={words.searchMapsLayers} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div></div>
          {shown.length === 0 ? (
            <div className="foot-note" id="copyNoMatch">{filledIn(words.noLayerMatches, "query", query.trim())}</div>
          ) : shown.map((group) => (
            <div className="card" data-copy-map={group.map} key={group.map}>
              <div className="row"><MarkTile symbol={group.symbol} tint={group.iconTintHex} small />
                <span className="words">{group.name}</span></div>
              {group.rows.map((row) => <CopyLine key={row.layer} layer={row} />)}
            </div>
          ))}
          <div className="foot-note" id="copyTicked">{ticked ? "" : words.nothingSelected}</div>
          <button type="button" className="action" id="addCopies" disabled={ticked === 0} onClick={addCopies}>
            <Sym name="plus" />{ticked ? filledIn(words.addCount, "count", String(ticked)) : words.add}
          </button>
        </>
      )}
    </>
  );
}

export type AddSource = "builtin" | "tile" | "file" | "api" | "server" | "copy";

/** 97 The sources this phone or site adds from, in the order Add layer lists them. */
export function addSources(): AddSource[] {
  return [...(offers("addPackages") ? ["builtin" as const] : []), "tile" as const,
    ...(offers("addFile") ? ["file" as const] : []), ...(offers("addAPI") ? ["api" as const] : []),
    ...(offers("servers") ? ["server" as const] : []), ...(offers("fromMaps") ? ["copy" as const] : [])];
}

function Packages() {
  const words = useViewer((state) => state.words);
  const packages = useViewer((state) => state.packages);
  const ticks = useViewer((state) => state.packageTicks);
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
    </>
  );
}

/** Add layer's part for one source: packages, tiles, a file, an API, a server, a map. */
/** 182 The layer page stands alone, as the app's does; the new-server form waits under the list. */
function ServersPart() {
  const isTuning = useViewer((state) => state.serverTuning != null);
  return isTuning ? <Servers /> : <><Servers /><NewServer /></>;
}

export function AddLayer({ source }: { source: AddSource }) {
  const hasRead = useViewer((state) => state.serviceRead != null);
  switch (source) {
    case "builtin":
      return <Packages />;
    case "tile":
      return <><TileAddress />{hasRead ? <ServiceLayers /> : null}</>;
    case "file":
      return <FileLayer />;
    case "api":
      return <APILayer />;
    case "server":
      return <ServersPart />;
    case "copy":
      return <FromMaps />;
  }
}
