"use client";

import type { AvailabilitySwitch } from "@/lib/edit";
import type { MapSwitches } from "@/lib/types";
import { change, useViewer } from "@/store/viewer";
import { Switch } from "../ui/Switch";

interface Row {
  key: AvailabilitySwitch;
  title: string;
  note: string;
  isOn: boolean;
  isLocked: boolean;
}

/** 50 Where the map is offered and what it shows, as Edit map's Availability sets them. */
export function Availability({ switches }: { switches: MapSwitches }) {
  const words = useViewer((state) => state.words);
  const empty = switches.hasNothingToDraw;
  const owns = switches.ownsSettings;
  const rows: Row[] = [
    { key: "picker", title: words.inPicker, note: empty ? words.nothingToDraw : words.inPickerNote,
      isOn: switches.picker && !empty, isLocked: empty },
    { key: "carPlay", title: words.inCarPlay, note: words.inCarPlayNote, isOn: switches.carPlay && !empty,
      isLocked: empty },
    { key: "legend", title: words.showLegend,
      note: switches.legendEverywhere ? words.showLegendNote : words.hiddenEverywhere,
      isOn: switches.legend && switches.legendEverywhere, isLocked: !switches.legendEverywhere || !owns },
    { key: "world", title: words.showWorld, note: switches.worldEverywhere ? words.showWorldNote : words.hiddenEverywhere,
      isOn: switches.world && switches.worldEverywhere, isLocked: !switches.worldEverywhere || !owns }
  ];
  return (
    <>
      <h2 className="title">{words.availability}</h2>
      <div className="list" id="availability">
        {rows.map((row) => (
          <div className="row" key={row.key} data-switch={row.key}>
            <div className="words">{row.title}<small>{row.note}</small></div>
            <Switch isOn={row.isOn} label={row.title} isLocked={row.isLocked}
              onChange={(shown) => change({ kind: "availability", switch: row.key, shown })} />
          </div>
        ))}
      </div>
      {owns ? null : <div className="foot-note">{words.ownerSets}</div>}
    </>
  );
}
