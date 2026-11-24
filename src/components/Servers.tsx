"use client";

import { useEffect, useState } from "react";
import { NO_COOKIES } from "@/lib/api";
import type { CookiePreflight, Server, ServerForm, ServerRow } from "@/lib/types";
import { listed } from "@/lib/words";
import {
  SERVER_KINDS, SERVER_PARTS, addServerLayer, deleteServer, duplicateServer, editServer, exportServer, loadServers, openServer,
  removeServerLayer, saveServerForm, showServerPart, useViewer,
} from "@/store/viewer";
import { Swatch } from "./edit/Styling";
import { CommitField } from "./ui/CommitField";
import { MarkTile } from "./ui/MarkTile";
import { Switch } from "./ui/Switch";
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

function RowLine({ row, server }: { row: ServerRow; server: Server }) {
  const words = useViewer((state) => state.words);
  const style = { paddingLeft: 14 + row.depth * 14 };
  return (
    <div className={row.kind === "note" ? "row dimmed" : "row"} style={style} data-row-kind={row.kind}
      data-layer={row.pick?.layer}>
      <span className="words">{row.title}{row.subtitle ? <small>{row.subtitle}</small> : null}
        {row.endpoint ? <small className="endpoint">{row.endpoint}</small> : null}</span>
      {row.byHand ? (
        <button type="button" className="icon-button danger" aria-label={`${words.removeFromServer} ${row.title}`}
          title={words.keptLayers} onClick={() => void removeServerLayer(server.id, row.pick.layer)}>
          <Sym name="trash" />
        </button>
      ) : null}
    </div>
  );
}

/** 188 The phone's New layer: an Esri layer by its number, any other by its address. */
function NewServerLayer({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [asking, setAsking] = useState(false);
  const byNumber = server.kindID === "arcgis";
  const number = Number.parseInt(address.trim(), 10);
  const ready = byNumber ? Number.isInteger(number) && number >= 0 : address.trim() !== "";
  const add = async () => {
    setAsking(true);
    const typed = byNumber ? { name: name.trim(), number } : { name: name.trim(), address: address.trim() };
    if (await addServerLayer(server.id, typed)) {
      setName("");
      setAddress("");
    }
    setAsking(false);
  };
  return (
    <>
      <h2 className="title">{words.newLayer}</h2>
      <div className="card" id="serverNewLayer"><div className="field">
        <input type="text" id="serverNewLayerName" autoComplete="off" placeholder={words.name} aria-label={words.name}
          value={name} onChange={(event) => setName(event.target.value)} />
        <input type={byNumber ? "number" : "url"} id="serverNewLayerAddress" autoComplete="off" spellCheck={false}
          placeholder={byNumber ? "0" : server.address} aria-label={byNumber ? words.layerNumber : words.address}
          min={byNumber ? 0 : undefined} value={address} onChange={(event) => setAddress(event.target.value)} />
      </div></div>
      <button type="button" className="action" id="serverNewLayerAdd" disabled={!ready || asking}
        onClick={() => void add()}><Sym name="plus" />{words.add}</button>
    </>
  );
}

function LayersPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverLayers">
      <h2 className="title">{words.whatServerHas}</h2>
      <div className="list">{server.rows.map((row, index) => <RowLine key={index} row={row} server={server} />)}</div>
      {server.takesLayers ? <NewServerLayer server={server} /> : null}
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

type HeaderDraft = { name: string; value: string; isSet: boolean };

function draftOf(server: Server) {
  return {
    kind: server.kindID ?? "", address: server.address ?? "", referrer: server.referrer ?? "",
    headers: (server.headers ?? []).map((header): HeaderDraft => ({ ...header, value: "" })),
    login: server.login ?? null
  };
}

/** 187 What a draft sends: a header left blank keeps the value the phone holds. */
export function formOf(draft: ReturnType<typeof draftOf>): ServerForm {
  return { kind: draft.kind, address: draft.address.trim(), referrer: draft.referrer.trim(),
    headers: draft.headers.filter((header) => header.name.trim()).map(({ name, value }) =>
      (value ? { name: name.trim(), value } : { name: name.trim() })),
    login: draft.login?.isOn ? draft.login : null };
}

/** 187 The server form's address, kind, headers and login; Save waits for the phone to read it. */
function ServerFormCard({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  const ages = useViewer((state) => state.servers?.cookieAges ?? []);
  const [draft, setDraft] = useState(() => draftOf(server));
  const [header, setHeader] = useState({ name: "", value: "" });
  const [saving, setSaving] = useState(false);
  const login: CookiePreflight = draft.login ?? NO_COOKIES;
  const changed = JSON.stringify(formOf(draft)) !== JSON.stringify(formOf(draftOf(server)));
  const setLogin = (next: CookiePreflight) => setDraft({ ...draft, login: next });
  const save = async () => {
    setSaving(true);
    await saveServerForm(server.id, formOf(draft));
    setSaving(false);
  };
  return (
    <>
      <h2 className="title">{words.serverForm}</h2>
      <div className="card" id="serverForm">
        <div className="field"><label htmlFor="serverFormKind">{words.kind}</label>
          <select id="serverFormKind" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
            {SERVER_KINDS.map((each) => <option key={each} value={each}>{words[`serverKind.${each}`]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="serverFormAddress">{words.address}</label>
          <input type="url" id="serverFormAddress" autoComplete="off" spellCheck={false} value={draft.address}
            onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></div>
        <div className="field"><label htmlFor="serverFormReferrer">{words.referrer}</label>
          <input type="url" id="serverFormReferrer" autoComplete="off" spellCheck={false} value={draft.referrer}
            onChange={(event) => setDraft({ ...draft, referrer: event.target.value })} /></div>
      </div>
      <h2 className="title">{words.headers}</h2>
      <div className="card" id="serverHeaders">
        {draft.headers.map((each, index) => (
          <div className="row header" key={each.name} data-header={each.name} data-set={each.isSet ? "" : undefined}>
            <span className="words">{each.name}<small>{each.isSet ? words.headerSaved : words.headerUnset}</small></span>
            <input type="password" autoComplete="off" placeholder={words.headerValue} aria-label={`${each.name} ${words.headerValue}`}
              value={each.value} onChange={(event) => setDraft({ ...draft, headers: draft.headers.map((one, at) =>
                (at === index ? { ...one, value: event.target.value } : one)) })} />
            <button type="button" className="link" aria-label={`${words.remove} ${each.name}`}
              onClick={() => setDraft({ ...draft, headers: draft.headers.filter((_, at) => at !== index) })}>{words.remove}</button>
          </div>
        ))}
        <div className="row header-add">
          <input id="serverHeaderName" value={header.name} placeholder={words.headerName} aria-label={words.headerName}
            autoCapitalize="off" spellCheck={false} onChange={(event) => setHeader({ ...header, name: event.target.value })} />
          <input type="password" id="serverHeaderValue" value={header.value} autoComplete="off" placeholder={words.headerValue}
            aria-label={words.headerValue} onChange={(event) => setHeader({ ...header, value: event.target.value })} />
          <button type="button" className="link" id="serverHeaderAdd"
            disabled={!header.name.trim() || draft.headers.some((one) => one.name.toLowerCase() === header.name.trim().toLowerCase())}
            onClick={() => {
              setDraft({ ...draft, headers: [...draft.headers, { name: header.name.trim(), value: header.value, isSet: false }] });
              setHeader({ name: "", value: "" });
            }}>{words.addHeader}</button>
        </div>
        <div className="foot-note">{words.valuesStayPhone}</div>
      </div>
      <div className="card" id="serverLogin">
        <div className="row"><span className="words">{words.apiCookiesFirst}<small>{words.apiCookiesWhy}</small></span>
          <Switch isOn={login.isOn} label={words.apiCookiesFirst} onChange={(isOn) => setLogin({ ...login, isOn })} /></div>
        {login.isOn ? (
          <>
            <div className="field"><label htmlFor="serverCookiePage">{words.apiCookiePage}</label>
              <input type="url" id="serverCookiePage" autoComplete="off" spellCheck={false} placeholder={words.apiSiteItself}
                value={login.page} onChange={(event) => setLogin({ ...login, page: event.target.value })} /></div>
            {ages.length ? (
              <div className="field"><label htmlFor="serverCookieAge">{words.apiCookieAge}</label>
                <select id="serverCookieAge" value={String(login.seconds)}
                  onChange={(event) => setLogin({ ...login, seconds: Number(event.target.value) })}>
                  {ages.map((age) => <option key={age.value} value={age.value}>{age.title}</option>)}
                </select></div>
            ) : null}
            <div className="foot-note">{words.apiCookiesSent}</div>
          </>
        ) : null}
      </div>
      <button type="button" className="action" id="serverFormSave" disabled={!changed || saving || !draft.address.trim()}
        onClick={() => void save()}><Sym name="checkmark" />{saving ? words.testing : words.save}</button>
    </>
  );
}

function GeneralPart({ server }: { server: Server }) {
  const words = useViewer((state) => state.words);
  return (
    <div id="serverGeneral">
      <LookCard server={server} />
      {server.kindID ? <ServerFormCard key={JSON.stringify(draftOf(server))} server={server} /> : (
        <>
          <h2 className="title">{words.address}</h2>
          <div className="list">
            <Fact name={words.address} value={server.address} />
            <Fact name={words.kind} value={server.kind} />
          </div>
        </>
      )}
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
