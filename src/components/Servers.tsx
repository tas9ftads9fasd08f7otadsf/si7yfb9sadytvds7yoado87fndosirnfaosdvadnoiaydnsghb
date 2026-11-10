"use client";

import { useEffect } from "react";
import type { Server, ServerRow } from "@/lib/types";
import { SERVER_PARTS, exportServer, loadServers, openServer, showServerPart, useViewer } from "@/store/viewer";
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

function GeneralPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverGeneral">
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
