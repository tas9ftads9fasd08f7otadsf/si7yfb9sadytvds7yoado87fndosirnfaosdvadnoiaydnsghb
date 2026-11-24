"use client";

import { useEffect, useState } from "react";
import type { Server, ServerRow } from "@/lib/types";
import { listed } from "@/lib/words";
import {
  SERVER_PARTS, deleteServer, duplicateServer, editServer, exportServer, loadServers, openServer, showServerPart,
  useViewer,
} from "@/store/viewer";
import { Swatch } from "./edit/Styling";
import { CommitField } from "./ui/CommitField";
import { MarkTile } from "./ui/MarkTile";
import { Sym } from "./ui/Sym";

/** 27 TestFlight AApG: each saved server a card with a blue View, as a map's card has. */
export function ServerCards() {
  const words = useViewer((state) => state.words);
  const canEdit = useViewer((state) => state.editToken != null);
  const servers = useViewer((state) => state.servers?.servers);
  useEffect(() => {
    if (canEdit && !servers) void loadServers();
  }, [canEdit, servers]);
  if (!canEdit || !servers?.length) return null;
  return (
    <div id="serverCards">
      <h2 className="title">{words.servers}</h2>
      <div className="list">
        {servers.map((server) => (
          <div className="row" key={server.id} data-server-card={server.id}>
            <MarkTile symbol={server.symbol || "server.rack"} tint={server.iconTintHex} />
            <span className="words">{server.name}<small>{server.line}</small></span>
            <button type="button" className="capsule" id={`viewServer_${server.id}`}
              aria-label={`${words.view} ${server.name}`} onClick={() => openServer(server.id)}>{words.view}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 27 TestFlight AL9n: the server's page in the parts the phone's has, Layers first. */
export function ServerPage() {
  const words = useViewer((state) => state.words);
  const part = useViewer((state) => state.serverPart);
  const server = useViewer((state) => state.servers?.servers.find((each) => each.id === state.serverID));
  if (!server) return null;
  return (
    <>
      <div className="chips" role="tablist" aria-label={server.name} id="serverParts">
        {SERVER_PARTS.map((each) => (
          <button key={each} type="button" role="tab" aria-selected={each === part}
            className={each === part ? "picked" : undefined} onClick={() => showServerPart(each)}>{words[each]}</button>
        ))}
      </div>
      {part === "layers" ? <LayersPart server={server} /> : null}
      {part === "general" ? <GeneralPart server={server} /> : null}
      {part === "sharing" ? <SharingPart server={server} /> : null}
    </>
  );
}

function RowLine({ row }: { row: ServerRow }) {
  const style = { paddingLeft: 14 + row.depth * 14 };
  return (
    <div className={row.kind === "note" ? "row dimmed" : "row"} style={style} data-row-kind={row.kind}>
      <span className="words">{row.title}{row.subtitle ? <small>{row.subtitle}</small> : null}</span>
    </div>
  );
}

function LayersPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverLayers">
      <h2 className="title">{words.whatServerHas}</h2>
      <div className="list">{server.rows.map((row, index) => <RowLine key={index} row={row} />)}</div>
    </div>
  );
}

function Fact({ name, value }: { name: string; value?: string }) {
  if (!value) return null;
  return <div className="row"><span className="words"><small>{name}</small>{value}</span></div>;
}

/** 183 As the phone's Look: a name, a mark and its background, each saved as it is picked. */
function LookCard({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  const symbol = server.symbol || "server.rack";
  const tint = (server.iconTintHex ?? "").toUpperCase() || null;
  const symbols = [...new Set([symbol, ...listed(words.serverSymbols)])];
  const tints = listed(words.iconTints);
  if (tint && !tints.includes(tint)) tints.push(tint);
  return (
    <>
      <h2 className="title">{words.look}</h2>
      <div className="card" id="serverLook">
        <div className="field">
          <label htmlFor="serverName">{words.name}</label>
          <CommitField type="text" id="serverName" autoComplete="off" value={server.name} placeholder={server.name}
            onCommit={(name) => { if (name.trim()) void editServer(server.id, { name: name.trim() }); }} />
        </div>
        <div className="field"><label>{words.icon}</label></div>
        <div className="swatches" role="group" id="serverSymbols" aria-label={words.icon}>
          {symbols.map((name) => (
            <Swatch key={name} label={name} isPicked={name === symbol} tint={tint} data={{ "data-symbol": name }}
              onPick={() => void editServer(server.id, { symbol: name })}><Sym name={name} /></Swatch>
          ))}
        </div>
        <div className="field"><label>{words.background}</label></div>
        <div className="swatches" role="group" id="serverTints" aria-label={words.background}>
          <CommitField type="color" value={(tint ?? "#8E8E93").toLowerCase()} aria-label={words.pickColour}
            title={words.pickColour} onCommit={(hex) => void editServer(server.id, { tintHex: hex.toUpperCase() })} />
          <Swatch label={words["theme.auto"]} isPicked={!tint} onPick={() => void editServer(server.id, { tintHex: "" })}>
            <Sym name="wand.and.stars" />
          </Swatch>
          {tints.map((hex) => (
            <Swatch key={hex} label={hex} isPicked={hex === tint} tint={hex} data={{ "data-hex": hex }}
              onPick={() => void editServer(server.id, { tintHex: hex })} />
          ))}
        </div>
      </div>
    </>
  );
}

/** 183 The phone's Duplicate and Delete server; a second press deletes, as its row asks. */
function ServerActions({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  const [asked, setAsked] = useState<string | null>(null);
  const isAsked = asked === server.id;
  return (
    <div className="list map-actions" id="serverActions">
      <button type="button" className="row add" id="duplicateServer" onClick={() => void duplicateServer(server.id)}>
        <span className="tile"><Sym name="plus.square.on.square" /></span>{words.duplicateServer}
      </button>
      <button type="button" className="row add danger" id="deleteServer" title={words.keptLayers}
        aria-label={`${isAsked ? words.tapAgainDelete : words.deleteServer} ${server.name}`}
        onClick={() => (isAsked ? void deleteServer(server.id) : setAsked(server.id))}>
        <span className="tile"><Sym name="trash" /></span>{isAsked ? words.tapAgainDelete : words.deleteServer}
        {isAsked ? <small>{words.keptLayers}</small> : null}
      </button>
    </div>
  );
}

function GeneralPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverGeneral">
      <LookCard server={server} />
      <h2 className="title">{words.address}</h2>
      <div className="list">
        <Fact name={words.address} value={server.address} />
        <Fact name={words.kind} value={server.kind} />
      </div>
      {server.facts?.length ? <>
        <h2 className="title">{words.whatItSupports}</h2>
        <div className="list" id="serverFacts">
          {server.facts.map((fact) => <Fact key={fact.name} name={fact.name} value={fact.value} />)}
        </div>
      </> : null}
      <ServerActions server={server} />
    </div>
  );
}

function SharingPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverSharing">
      <button type="button" className="action" id="exportServer" onClick={() => void exportServer(server.id)}>
        <Sym name="square.and.arrow.up" />{words.export}
      </button>
    </div>
  );
}
