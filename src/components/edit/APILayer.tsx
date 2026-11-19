"use client";

import { useState } from "react";
import { NO_COOKIES, newDetailRow, rowChanged, shows, shownSwitched } from "@/lib/api";
import type { APIChoice, APIDetailRow, APIRead, APIReading, CookiePreflight } from "@/lib/types";
import { addAPI, readAPI, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";
import { Switch } from "../ui/Switch";

const PARTS = ["source", "details", "styling"] as const;
type Part = typeof PARTS[number];
const PART_WORDS = { source: "apiSource", details: "apiDetails", styling: "apiStyling" } as const;

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

function ChoicePicker({ id, label, value, choices, onPick }: { id: string; label: string; value: string;
  choices: APIChoice[]; onPick: (value: string) => void }) {
  const detail = choices.find((choice) => choice.value === value)?.detail;
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onPick(event.target.value)}>
        {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.title}</option>)}
      </select>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

/** 3397 The cookie page asked before the address, and a cookie typed as the phone's header row. */
function Cookies({ cookies, onCookies, cookie, onCookie, read }: { cookies: CookiePreflight;
  onCookies: (cookies: CookiePreflight) => void; cookie: string; onCookie: (cookie: string) => void;
  read: APIRead | null }) {
  const words = useViewer((state) => state.words);
  const ages = read?.choices?.cookieAges ?? [];
  return (
    <div className="card" id="apiCookieCard">
      <div className="row"><span className="words">{words.apiCookiesFirst}<small>{words.apiCookiesWhy}</small></span>
        <Switch isOn={cookies.isOn} label={words.apiCookiesFirst}
          onChange={(isOn) => onCookies({ ...cookies, isOn })} /></div>
      {cookies.isOn ? (
        <>
          <div className="field"><label htmlFor="apiCookiePage">{words.apiCookiePage}</label>
            <input type="url" id="apiCookiePage" autoComplete="off" spellCheck={false} placeholder={words.apiSiteItself}
              value={cookies.page} onChange={(event) => onCookies({ ...cookies, page: event.target.value })} /></div>
          {ages.length ? <ChoicePicker id="apiCookieAge" label={words.apiCookieAge} value={String(cookies.seconds)}
            choices={ages} onPick={(seconds) => onCookies({ ...cookies, seconds: Number(seconds) })} /> : null}
          <div className="foot-note">{words.apiCookiesSent}</div>
        </>
      ) : null}
      <div className="field"><label htmlFor="apiCookie">Cookie</label>
        <input type="password" id="apiCookie" autoComplete="off" spellCheck={false}
          placeholder={read?.keepsCookie ? words.apiCookieKept : "name=value"} value={cookie}
          onChange={(event) => onCookie(event.target.value)} /></div>
    </div>
  );
}

/** 3397 The sheet's own Details rows, each a name and a key's value. */
function DetailRows({ rows, onRows }: { rows: APIDetailRow[]; onRows: (rows: APIDetailRow[]) => void }) {
  const words = useViewer((state) => state.words);
  return (
    <>
      <h2 className="title">{words.apiDetails}</h2>
      <div className="card" id="apiRows">
        {rows.map((row) => (
          <div className="field" key={row.id} data-row={row.id}>
            <input type="text" aria-label={words.name} placeholder={words.name} value={row.title}
              onChange={(event) => onRows(rowChanged(rows, row.id, { title: event.target.value }))} />
            <input type="text" aria-label={words.apiRowValue} placeholder="{key}" value={row.value} spellCheck={false}
              onChange={(event) => onRows(rowChanged(rows, row.id, { value: event.target.value }))} />
            <button type="button" aria-label={words.apiRemoveRow} title={words.apiRemoveRow}
              onClick={() => onRows(rows.filter((each) => each.id !== row.id))}><Sym name="minus.circle" /></button>
          </div>
        ))}
        <button type="button" className="row add" id="apiAddRow" onClick={() => onRows([...rows, newDetailRow()])}>
          <Sym name="plus" />{words.apiAddRow}
        </button>
      </div>
    </>
  );
}

function Details({ read, reading, pick, amend }: { read: APIRead; reading: APIReading;
  pick: (change: Partial<APIReading>) => void; amend: (change: Partial<APIReading>) => void }) {
  const words = useViewer((state) => state.words);
  const keys = read.keys;
  const choices = read.choices;
  return (
    <>
      <h2 className="title">{words.apiAnswers}</h2>
      <div className="card">
        <KeyPicker id="apiItemsPath" label={words.itemsPath} value={reading.itemsPath} keys={read.paths}
          onPick={(itemsPath) => pick({ itemsPath, latitudeKey: "", longitudeKey: "", positionKey: "", shownKeys: [] })} />
        {choices ? <ChoicePicker id="apiSpelling" label={words.coordinates} value={reading.spelling}
          choices={choices.spellings} onPick={(spelling) => pick({ spelling })} /> : null}
        {reading.spelling === "position"
          ? <>
            <KeyPicker id="apiPosition" label={words.bothIn} value={reading.positionKey} keys={keys}
              onPick={(positionKey) => pick({ positionKey, positionOrder: null })} />
            {choices ? <ChoicePicker id="apiOrder" label={words.apiOrder} value={reading.positionOrder ?? ""}
              choices={choices.orders} onPick={(positionOrder) => pick({ positionOrder })} /> : null}
          </>
          : <>
            <KeyPicker id="apiLatitude" label={words.latitude} value={reading.latitudeKey} keys={keys}
              onPick={(latitudeKey) => pick({ latitudeKey })} />
            <KeyPicker id="apiLongitude" label={words.longitude} value={reading.longitudeKey} keys={keys}
              onPick={(longitudeKey) => pick({ longitudeKey })} />
          </>}
        <KeyPicker id="apiName" label={words.name} value={reading.nameKey ?? ""} keys={keys} offersNone
          onPick={(nameKey) => pick({ nameKey: nameKey || null })} />
        <KeyPicker id="apiColourKey" label={words.apiColour} value={reading.colourKey ?? ""} keys={keys} offersNone
          onPick={(colourKey) => pick({ colourKey: colourKey || null })} />
        <KeyPicker id="apiImageKey" label={words.apiPicture} value={reading.imageKey ?? ""} keys={keys} offersNone
          onPick={(imageKey) => pick({ imageKey: imageKey || null })} />
      </div>
      <h2 className="title">{words.apiTapShows}</h2>
      <div className="card" id="apiShown">
        {keys.map((key) => (
          <div className="row" key={key} data-shown-key={key}>
            <span className="words">{key}{read.samples?.[key] ? <small>{read.samples[key]}</small> : null}</span>
            <Switch isOn={shows(reading, key)} label={key}
              onChange={(isOn) => pick({ shownKeys: shownSwitched(reading, keys, key, isOn) })} />
          </div>
        ))}
      </div>
      <DetailRows rows={reading.detailRows ?? []} onRows={(detailRows) => amend({ detailRows })} />
      {choices ? (
        <>
          <h2 className="title">{words.apiAsksAgain}</h2>
          <div className="card">
            <ChoicePicker id="apiRefresh" label={words.apiRefresh} value={String(reading.refreshSeconds ?? 0)}
              choices={choices.refresh} onPick={(seconds) => amend({ refreshSeconds: Number(seconds) || null })} />
          </div>
        </>
      ) : null}
    </>
  );
}

/** 3003: an API read on the phone, its keys guessed there and picked here; 3397 in the phone's three parts. */
export function APILayer() {
  const words = useViewer((state) => state.words);
  const [part, setPart] = useState<Part>("source");
  const [address, setAddress] = useState("");
  const [cookies, setCookies] = useState<CookiePreflight>(NO_COOKIES);
  const [cookie, setCookie] = useState("");
  const [name, setName] = useState("");
  const [tint, setTint] = useState<string | null>(null);
  const [read, setRead] = useState<APIRead | null>(null);
  const ask = { cookies, cookie };
  const reading = read?.reading;
  const askAgain = async (asked?: APIReading | null) => {
    const answer = await readAPI(address.trim(), asked, ask);
    setRead(answer);
    return answer;
  };
  const pick = (change: Partial<APIReading>) => {
    if (reading) void askAgain({ ...reading, ...change });
  };
  const amend = (change: Partial<APIReading>) => {
    if (read && reading) setRead({ ...read, reading: { ...reading, ...change } });
  };
  return (
    <>
      <h2 className="title">{words.apiLayers}</h2>
      <div className="chips" role="tablist" aria-label={words.apiLayers} id="apiParts">
        {PARTS.map((each) => (
          <button key={each} type="button" role="tab" aria-selected={each === part} data-part={each}
            className={each === part ? "picked" : undefined} onClick={() => setPart(each)}>{words[PART_WORDS[each]]}</button>
        ))}
      </div>
      {part === "source" ? (
        <>
          <div className="card" id="apiCard"><div className="field">
            <input type="url" id="apiAddress" autoComplete="off" spellCheck={false} placeholder="https://…"
              aria-label={words.apiAddress} value={address} onChange={(event) => {
                setAddress(event.target.value);
                setRead(null);
              }} />
          </div></div>
          <Cookies cookies={cookies} onCookies={setCookies} cookie={cookie} onCookie={setCookie} read={read} />
          <button type="button" className="action" id="readAPI" disabled={!address.trim()}
            onClick={async () => {
              if (await askAgain(reading)) setPart("details");
            }}>{words.apiRead}</button>
        </>
      ) : null}
      {part === "details" ? (read && reading
        ? <Details read={read} reading={reading} pick={pick} amend={amend} />
        : <div className="foot-note">{words.apiReadFirst}</div>) : null}
      {part === "styling" ? (
        <div className="card">
          <div className="field"><label htmlFor="apiLayerName">{words.name}</label>
            <input type="text" id="apiLayerName" autoComplete="off" placeholder={read?.name ?? ""} value={name}
              onChange={(event) => setName(event.target.value)} /></div>
          <div className="row value">
            <span className="swatches">
              <input type="color" id="apiTint" aria-label={words.apiColour} title={words.pickColour}
                value={(tint ?? "#8E8E93").toLowerCase()} onChange={(event) => setTint(event.target.value.toUpperCase())} />
              {tint ? <button type="button" id="apiTintAuto" aria-label={words["theme.auto"]} title={words["theme.auto"]}
                onClick={() => setTint(null)}><Sym name="wand.and.stars" /></button> : null}
            </span>
            <span className="words">{words.apiColour}</span>
          </div>
        </div>
      ) : null}
      {read && reading ? (
        <>
          <div className="foot-note" id="apiSaid">{read.said}</div>
          <button type="button" className="action" id="addAPI" disabled={!read.points}
            onClick={() => void addAPI(address.trim(), reading, name.trim() || read.name, { ...ask, tint })}>
            <Sym name="plus" />{words.add}
          </button>
        </>
      ) : null}
    </>
  );
}
