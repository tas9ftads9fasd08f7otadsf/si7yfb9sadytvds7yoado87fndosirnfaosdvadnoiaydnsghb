"use client";

import { useEffect, useRef, useState } from "react";
import type { ServerLayerKey } from "@/lib/route";
import type { ServerPreviewRead } from "@/lib/types";
import { readServerLayer, serverPreviewTile, useViewer } from "@/store/viewer";
import { Sym } from "../ui/Sym";

type Tile = { z: number; x: number; y: number };

const COLUMNS = 5;
const ROWS = 3;

/** 190 A tile moved by whole tiles, wrapped round the world and held inside its rows. */
export function moved(tile: Tile, dx: number, dy: number): Tile {
  const count = 2 ** tile.z;
  return { z: tile.z, x: (((tile.x + dx) % count) + count) % count, y: Math.min(count - 1, Math.max(0, tile.y + dy)) };
}

/** 190 One zoom in or out over the same ground, within the zooms the layer has. */
export function zoomed(tile: Tile, by: 1 | -1, zooms: { minZoom: number; maxZoom: number }): Tile {
  const z = tile.z + by;
  if (z < zooms.minZoom || z > zooms.maxZoom) return tile;
  return by > 0 ? { z, x: tile.x * 2, y: tile.y * 2 } : { z, x: tile.x >> 1, y: tile.y >> 1 };
}

function TilePicture({ server, keyed, tile }: { server: string; keyed: ServerLayerKey; tile: Tile }) {
  const [address, setAddress] = useState<string | null>(null);
  const { z, x, y } = tile;
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    void serverPreviewTile(server, keyed, { z, x, y }).then((blob) => {
      if (!live || !blob) return;
      made = URL.createObjectURL(blob);
      setAddress(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [server, keyed, z, x, y]);
  return <span className={address ? "tile drawn" : "tile"} data-tile={`${tile.z}/${tile.x}/${tile.y}`}
    style={address ? { backgroundImage: `url(${JSON.stringify(address)})` } : undefined} />;
}

/** 190 The app's preview and Read again: the phone reads the layer, then draws its tiles as they are moved. */
export function LayerPreview({ server, keyed }: { server: string; keyed: ServerLayerKey }) {
  const words = useViewer((state) => state.words);
  const [read, setRead] = useState<ServerPreviewRead | null>(null);
  const [reading, setReading] = useState(true);
  const [centre, setCentre] = useState<Tile | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const ask = async () => {
    setReading(true);
    const found = await readServerLayer(server, keyed);
    setRead(found);
    setCentre(found.picture ? { z: found.picture.z, x: found.picture.x, y: found.picture.y } : null);
    setReading(false);
  };
  useEffect(() => {
    let live = true;
    void readServerLayer(server, keyed).then((found) => {
      if (!live) return;
      setRead(found);
      setCentre(found.picture ? { z: found.picture.z, x: found.picture.x, y: found.picture.y } : null);
      setReading(false);
    });
    return () => { live = false; };
  }, [server, keyed]);
  const picture = read?.picture;
  const state = reading ? words.readingNow : read?.works ? words.readDone : words.noReply;
  const tiles = centre ? Array.from({ length: COLUMNS * ROWS }, (_, at) =>
    moved(centre, (at % COLUMNS) - (COLUMNS >> 1), Math.floor(at / COLUMNS) - (ROWS >> 1))) : [];
  return (
    <div id="serverLayerPreview">
      {picture && centre ? (
        <div className="preview-frame">
          <div className="preview-tiles" role="img" aria-label={words.sheetPreview} ref={frame}
            onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY }; }}
            onPointerUp={(event) => {
              const from = drag.current;
              drag.current = null;
              if (!from) return;
              const side = (frame.current?.clientWidth ?? COLUMNS * 256) / COLUMNS;
              const dx = Math.round((from.x - event.clientX) / side);
              const dy = Math.round((from.y - event.clientY) / side);
              if (dx || dy) setCentre(moved(centre, dx, dy));
            }}>
            {tiles.map((tile) => <TilePicture key={`${tile.z}/${tile.x}/${tile.y}`} server={server} keyed={keyed} tile={tile} />)}
          </div>
          <div className="preview-zoom">
            <button type="button" className="icon-button" aria-label={words.previewZoomIn}
              disabled={centre.z >= picture.maxZoom} onClick={() => setCentre(zoomed(centre, 1, picture))}><Sym name="plus" /></button>
            <button type="button" className="icon-button" aria-label={words.previewZoomOut}
              disabled={centre.z <= picture.minZoom} onClick={() => setCentre(zoomed(centre, -1, picture))}><Sym name="minus" /></button>
          </div>
        </div>
      ) : !reading && read?.works ? <div className="foot-note" id="serverLayerNoPicture">{words.noPicture}</div> : null}
      <div className="card">
        <div className="row read-row" id="serverLayerRead" data-works={reading ? undefined : String(read?.works ?? false)}>
          <span className="dot" aria-hidden="true" />
          <span className="words">{state}{!reading && read?.said ? <small>{read.said}</small> : null}</span>
          <button type="button" className="capsule" id="serverLayerReadAgain" disabled={reading}
            onClick={() => void ask()}>{words.readAgain}</button>
        </div>
      </div>
    </div>
  );
}
