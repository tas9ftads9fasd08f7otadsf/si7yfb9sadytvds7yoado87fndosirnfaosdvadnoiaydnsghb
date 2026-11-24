"use client";

import { useState } from "react";
import type { Server, ServerRow, ServerTune } from "@/lib/types";
import { listed } from "@/lib/words";
import { addTunedServerLayer, offers, tuneServerRow, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";
import { Switch } from "../ui/Switch";
import { Swatch } from "./Styling";

/** 182 An Esri layer taken as features is told apart by feature inks, as the app's form does. */
export function tintsFor(take: string | undefined, words: Record<string, string>): string[] {
  const features = take !== undefined && take !== "image";
  return listed(features ? words.featureTints : words.layerTints);
}

/** 182 Only what was changed goes to the phone, so its own choices stand for the rest. */
export function tuneOf(row: ServerRow, server: Server, picked: Required<ServerTune>): ServerTune {
  const tune: ServerTune = {};
  if (picked.name.trim() && picked.name.trim() !== row.title) tune.name = picked.name.trim();
  if (picked.symbol) tune.symbol = picked.symbol;
  if (picked.tintHex) tune.tintHex = picked.tintHex;
  if (picked.allowsOffline !== (server.allowsOffline ?? false)) tune.allowsOffline = picked.allowsOffline;
  if (row.takes && picked.take && picked.take !== row.takes[0]?.id) tune.take = picked.take;
  return tune;
}

/** 182 As the app's server layer page: Source, Layer and Details, then Add for this one layer. */
export function ServerLayerPage({ server, row }: { server: Server; row: ServerRow }) {
  const words = useViewer((state) => state.words);
  const [picked, setPicked] = useState<Required<ServerTune>>({
    name: row.title, symbol: "", tintHex: "", allowsOffline: server.allowsOffline ?? false,
    take: row.takes?.[0]?.id ?? "" });
  const [adding, setAdding] = useState(false);
  const pick = (part: Partial<ServerTune>) => setPicked((was) => ({ ...was, ...part }));
  const back = () => tuneServerRow(null);
  const take = row.takes?.find((offer) => offer.id === picked.take);
  const symbols = listed(words.layerSymbols);
  const add = async () => {
    setAdding(true);
    await addTunedServerLayer(tuneOf(row, server, picked));
    setAdding(false);
  };
  return (
    <div className="server-layer-page" data-server={server.id} data-layer={row.pick.layer}>
      <button type="button" className="servers-chip" id="serverLayerBack" onClick={back}>
        <Sym name="server.rack" />{words.servers}<Sym name="chevron.down" />
      </button>

      <h2 className="title">{words.apiSource}</h2>
      <div className="card">
        <div className="row source-row">
          <Sym name="server.rack" />
          <span className="words">{server.name} › {row.title}<small>{words.addressLogin}</small></span>
          <button type="button" className="text-button" id="serverLayerChange" onClick={back}>{words.changeSource}</button>
        </div>
      </div>

      <h2 className="title">{words.layerPart}</h2>
      <div className="card">
        <div className="field">
          <label htmlFor="serverLayerName">{words.name}</label>
          <input type="text" id="serverLayerName" autoComplete="off" placeholder={row.title} value={picked.name}
            onChange={(event) => pick({ name: event.target.value })} />
        </div>
        {symbols.length ? (
          <>
            <div className="field"><label>{words.icon}</label></div>
            <div className="swatches" role="group" id="serverLayerSymbols" aria-label={words.icon}>
              {symbols.map((name) => (
                <Swatch key={name} label={name} isPicked={name === picked.symbol} data={{ "data-symbol": name }}
                  onPick={() => pick({ symbol: name })}><Sym name={name} /></Swatch>
              ))}
            </div>
          </>
        ) : null}
        <div className="field"><label>{words.apiColour}</label></div>
        <div className="swatches" role="group" id="serverLayerTints" aria-label={words.apiColour}>
          <Swatch label={words["theme.auto"]} isPicked={!picked.tintHex} onPick={() => pick({ tintHex: "" })}>
            <Sym name="wand.and.stars" />
          </Swatch>
          {tintsFor(row.takes ? picked.take : undefined, words).map((hex) => (
            <Swatch key={hex} label={hex} isPicked={hex === picked.tintHex} tint={hex} data={{ "data-hex": hex }}
              onPick={() => pick({ tintHex: hex })} />
          ))}
        </div>
      </div>

      <h2 className="title">{words.details}</h2>
      <div className="card">
        {row.takes ? (
          <div className="field take">
            <label id="serverLayerTakeLabel">{words.takeItAs}</label>
            <div className="chips" role="radiogroup" aria-labelledby="serverLayerTakeLabel" id="serverLayerTake">
              {row.takes.map((offer) => (
                <button key={offer.id} type="button" role="radio" aria-checked={offer.id === picked.take}
                  className={offer.id === picked.take ? "picked" : undefined} data-take={offer.id}
                  onClick={() => pick({ take: offer.id })}>{offer.title}</button>
              ))}
            </div>
            {take?.explains ? <small>{take.explains}</small> : null}
          </div>
        ) : null}
        {offers("offline") ? (
          <div className="row" id="serverLayerOffline">
            <span className="words">{words.allowOffline}<small>{words.checkTerms}</small></span>
            <Switch isOn={picked.allowsOffline} label={words.allowOffline}
              onChange={(isOn) => pick({ allowsOffline: isOn })} />
          </div>
        ) : null}
      </div>

      <div className="source-foot">
        <span />
        <button type="button" className="action" id="addTunedServerLayer" disabled={adding} onClick={() => void add()}>
          <Sym name="plus" />{words.add}
        </button>
      </div>
    </div>
  );
}
