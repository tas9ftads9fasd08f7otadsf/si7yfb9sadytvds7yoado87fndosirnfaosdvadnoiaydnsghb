"use client";

import type { MouseEvent } from "react";
import { changedWord, heldWord, listColumns, sharingLine } from "@/lib/maps";
import type { SharedMap } from "@/lib/types";
import { openMap, useViewer } from "@/store/viewer";
import { OfflinePill } from "../MapPills";
import { MapMark, useLayerCount, useStyleCount } from "../MapShelf";
import { Link } from "../ui/Link";

/** 149 A plain click on a row opens its map; a link, or a modified click, is the browser's. */
function openFromRow(event: MouseEvent, id: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if ((event.target as HTMLElement).closest("a, button")) return;
  openMap(id);
}

/** 149 W17's list: W4's table, a row for each map, whose columns follow what the phone sent. */
export function MapsTable({ maps }: { maps: SharedMap[] }) {
  const words = useViewer((state) => state.words);
  const layerCount = useLayerCount();
  const styleCount = useStyleCount();
  const columns = listColumns(maps);
  const heads: [string, boolean, string][] = [[words.map, true, "name"], [words.styles, columns.styles, "styles"],
    [words.layers, true, "layers"], [words.shared, columns.shared, "shared"], [words.onThisPhone, columns.offline, "offline"],
    [words.size, columns.size, "size"], [words.changed, columns.changed, "changed"]];
  const shown = heads.filter(([, isShown]) => isShown);
  const template = shown.map(([, , key]) => (key === "name" ? "2.4fr" : key === "shared" ? "1.4fr" : "1fr")).join(" ");
  return (
    <div className="maps-table" id="mapsList" role="table" aria-label={words.maps}>
      <div className="data-row head" role="row" style={{ gridTemplateColumns: template }}>
        {shown.map(([name, , key]) => <span role="columnheader" key={key} data-column={key}>{name}</span>)}
      </div>
      {maps.map((map) => {
        const note = map.note?.split("\n")[0]?.trim();
        const cells: Record<string, React.ReactNode> = {
          styles: map.styles ? styleCount(map.styles.length) : "",
          layers: layerCount(map.layers.length),
          shared: sharingLine(map, words) ?? "",
          offline: <OfflinePill shared={map} />,
          size: heldWord(map) ?? "",
          changed: changedWord(map.changedAt) ?? ""
        };
        return (
          <div className="data-row" role="row" key={map.id} data-map={map.id} style={{ gridTemplateColumns: template }}
            onClick={(event) => openFromRow(event, map.id)}>
            <span role="cell" className="name-cell">
              <MapMark shared={map} />
              <span className="words">
                <Link to={{ screen: "map", map: map.id }} className="tile-name">{map.name}</Link>
                {note ? <small>{note}</small> : null}
              </span>
            </span>
            {shown.slice(1).map(([, , key]) => <span role="cell" key={key} data-column={key}>{cells[key]}</span>)}
          </div>
        );
      })}
    </div>
  );
}
