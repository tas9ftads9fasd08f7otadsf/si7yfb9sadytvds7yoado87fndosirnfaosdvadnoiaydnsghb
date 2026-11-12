import maplibregl, { type MapGeoJSONFeature, type PointLike, type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { FeatureCard } from "@/components/FeatureCard";
import { leftOpening, OPENING } from "@/lib/camera";
import { drawable } from "@/lib/drawable";
import { watchTraffic, workerCounter } from "@/lib/traffic";
import { backend } from "@backend";
import { LIVE_EVERY, PHONE_EVERY, REGIONS_EVERY } from "@/lib/page";
import { regionOffer } from "@/lib/region";
import type { Box, DetailsSheet, IdentifyListing, RegionList } from "@/lib/types";
import { away, drawStyle, isDark, notice, shownMapOf, useViewer } from "@/store/viewer";
import type { MapControl } from "./control";

const PICK = 6;
const MOST_ANSWERS = 20;
const CUSTOM = "riki-custom-";

export function createMapView(container: HTMLElement): MapControl {
  const get = useViewer.getState;
  const { words } = get();
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tilev4);
  // 46: vector tiles are fetched in MapLibre's workers, so they are counted there.
  void maplibregl.importScriptInWorkers(workerCounter()).catch(() => {});
  const stopTraffic = watchTraffic((traffic) => useViewer.setState({ traffic }));

  // A camera in the address was put there by someone; framing the map would undo it.
  let framed = /^#\d/.test(location.hash);
  const map = new maplibregl.Map({
    container, style: { version: 8, sources: {}, layers: [] },
    center: OPENING.center, zoom: OPENING.zoom, hash: true, validateStyle: false, attributionControl: { compact: true },
    maxPitch: 85,
    locale: { "TerrainControl.Enable": words["TerrainControl.Enable"],
      "TerrainControl.Disable": words["TerrainControl.Disable"] }
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");
  // Among the map's own controls, where a browser's location button is looked for.
  const phoneButton = document.createElement("button");
  phoneButton.id = "phoneButton";
  phoneButton.type = "button";
  phoneButton.className = "maplibregl-ctrl-geolocate";
  phoneButton.title = words.phoneHere;
  phoneButton.setAttribute("aria-label", words.phoneHere);
  phoneButton.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>';
  phoneButton.addEventListener("click", () => {
    if (!get().sharesLocation) notice(get().words.phoneNotShared);
    else showPhone();
  });
  const phoneGroup = document.createElement("div");
  phoneGroup.className = "maplibregl-ctrl maplibregl-ctrl-group";
  phoneGroup.append(phoneButton);
  map.addControl({ onAdd: () => phoneGroup, onRemove: () => phoneGroup.remove() }, "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 140 }), "bottom-left");

  // The zoom on the map, where the app shows it.
  const badge = document.createElement("div");
  badge.id = "mapZoom";
  badge.className = "maplibregl-ctrl zoom-badge";
  badge.setAttribute("role", "status");
  map.addControl({ onAdd: () => badge, onRemove: () => badge.remove() }, "top-left");

  // The phone draws its point icons for the browser, as it does for itself.
  const drawing = new Set<string>();
  async function drawIcon(name: string) {
    let image: ImageBitmap | null = null;
    let options = {};
    try {
      const icon = await backend.icon(name);
      if (icon) {
        image = await createImageBitmap(icon.image);
        options = { sdf: icon.sdf, pixelRatio: icon.pixelRatio };
      }
    } catch { /* drawn blank, its label kept */ }
    if (map.hasImage(name)) return;
    map.addImage(name, image ?? { width: 1, height: 1, data: new Uint8Array(4) }, options);
  }
  map.on("styleimagemissing", (event) => {
    if (drawing.has(event.id) || map.hasImage(event.id)) return;
    drawing.add(event.id);
    void drawIcon(event.id).finally(() => drawing.delete(event.id));
  });

  // The status line.
  function showZoom() {
    const zoomText = `z ${map.getZoom().toFixed(1)}`;
    badge.textContent = zoomText;
    useViewer.setState({ zoomText });
  }
  map.on("move", showZoom);
  map.on("load", showZoom);
  map.on("mousemove", (event) => {
    useViewer.setState({ pointerText: `${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}` });
  });
  map.getCanvas().addEventListener("mouseleave", () => useViewer.setState({ pointerText: "" }));

  // Where the phone is, shown while it shares its location.
  const phone = { marker: null as maplibregl.Marker | null, timer: undefined as ReturnType<typeof setTimeout> | undefined,
    fix: null as { lat: number; lon: number } | null };

  async function askPhone() {
    try {
      phone.fix = await backend.phoneLocation();
      if (!phone.marker) {
        const dot = document.createElement("div");
        dot.className = "phone-dot";
        dot.setAttribute("role", "img");
        phone.marker = new maplibregl.Marker({ element: dot });
      }
      phone.marker.setLngLat([phone.fix.lon, phone.fix.lat]).addTo(map);
      // MapLibre labels every marker "Map marker" as it lays it on.
      phone.marker.getElement().setAttribute("aria-label", get().device?.name ?? "");
    } catch { /* no place yet, asked again */ }
    phone.timer = setTimeout(askPhone, PHONE_EVERY);
  }

  function showPhone() {
    if (phone.fix) map.easeTo({ center: [phone.fix.lon, phone.fix.lat], zoom: Math.max(map.getZoom(), 15) });
  }

  function watchPhone(isShared: boolean) {
    clearTimeout(phone.timer);
    if (isShared) {
      void askPhone();
      return;
    }
    phone.marker?.remove();
    phone.marker = null;
    phone.fix = null;
  }

  // A map with a height model gets the 3D button; each style starts flat.
  let terrainButton: maplibregl.TerrainControl | null = null;
  function offerTerrain() {
    const sources = map.getStyle().sources ?? {};
    const dems = Object.keys(sources).filter((id) => sources[id]?.type === "raster-dem");
    const dem = dems.find((id) => id === "terrain" || id.endsWith("__terrain")) ?? dems[0];
    map.setTerrain(null);
    if (terrainButton) {
      map.removeControl(terrainButton);
      terrainButton = null;
    }
    if (!dem) return;
    terrainButton = new maplibregl.TerrainControl({ source: dem, exaggeration: 1 });
    map.addControl(terrainButton, "top-right");
  }

  // Regions the phone lacks.
  const regions = { known: null as RegionList | null, mapID: null as string | null,
    timer: undefined as ReturnType<typeof setTimeout> | undefined };

  function showRegionOffer() {
    const known = regions.mapID === get().mapID ? regions.known : null;
    const view = map.getBounds();
    const box: Box = [view.getWest(), view.getSouth(), view.getEast(), view.getNorth()];
    useViewer.setState({ regionOffer: regionOffer(known, box, map.getCenter()) });
  }
  map.on("moveend", showRegionOffer);

  async function readRegions() {
    clearTimeout(regions.timer);
    const { mapID } = get();
    let known: RegionList | null = null;
    try {
      if (mapID) known = await backend.regions(mapID);
    } catch { /* an older phone, or none to offer */ }
    if (mapID !== get().mapID) return;
    const landed = regions.mapID === mapID
      && (regions.known?.downloading ?? []).some((each) => (known?.drawn ?? []).some((one) => one.id === each.id));
    regions.known = known;
    regions.mapID = mapID;
    showRegionOffer();
    if (landed) drawStyle();
    if (known?.downloading?.length) regions.timer = setTimeout(readRegions, REGIONS_EVERY);
  }

  /** The first map shown is framed on what it draws; later switches keep the camera. */
  async function frame() {
    if (framed) return;
    framed = true;
    const boxes: number[][] = [];
    for (const source of Object.values(map.getStyle().sources ?? {})) {
      const box = (source as { bounds?: number[] }).bounds;
      if (box?.length === 4 && box[2]! > box[0]! && box[2]! - box[0]! < 359) boxes.push(box);
    }
    for (const archive of [...protocol.tiles.values()].slice(0, 8)) {
      try {
        const header = await archive.getHeader();
        if (header.maxLon > header.minLon) boxes.push([header.minLon, header.minLat, header.maxLon, header.maxLat]);
      } catch { /* an archive that does not answer frames nothing */ }
    }
    if (boxes.length === 0 || leftOpening(map.getCenter(), map.getZoom())) return;
    const box = boxes.reduce((all, one) => [Math.min(all[0]!, one[0]!), Math.min(all[1]!, one[1]!),
      Math.max(all[2]!, one[2]!), Math.max(all[3]!, one[3]!)]) as Box;
    map.fitBounds([[box[0], box[1]], [box[2], box[3]]], { padding: 40, animate: false });
  }

  // An API's points are asked of the phone, which holds the keys, as a phone nearby asks.
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  async function askLive() {
    clearTimeout(liveTimer);
    const state = get();
    const shared = shownMapOf(state);
    if (!shared || state.standing !== "admitted") return;
    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      .map((value) => value.toFixed(5)).join(",");
    for (const layer of shared.layers) {
      if (!layer.isLive || state.hidden.has(layer.id)) continue;
      const source = map.getSource(CUSTOM + layer.id.toLowerCase());
      if (!(source instanceof maplibregl.GeoJSONSource)) continue;
      try {
        source.setData(await backend.live(shared.id, layer.id, bbox) as GeoJSON.GeoJSON);
      } catch { /* the layer keeps what it last drew */ }
    }
    liveTimer = setTimeout(askLive, LIVE_EVERY);
  }

  let moved: ReturnType<typeof setTimeout> | undefined;
  map.on("moveend", () => {
    clearTimeout(moved);
    moved = setTimeout(askLive, 800);
  });

  // Not by setStyle: it clears the map first and stops drawing after a refusal.
  let lastAsked = 0;
  let drawnMapID: string | null = null;

  // 42: busy from the style being asked for until the map has drawn every tile it wanted.
  const busy = (mapBusy: boolean) => { if (get().mapBusy !== mapBusy) useViewer.setState({ mapBusy }); };
  map.on("dataloading", () => busy(true));
  map.on("idle", () => busy(false));
  map.on("error", () => { if (map.loaded()) busy(false); });

  let lastSet = 0;

  /** Busy while the style is asked for; a draw that set none leaves nothing on its way. */
  async function drawBusy() {
    const mine = lastAsked + 1;
    const before = lastSet;
    busy(true);
    await draw();
    if (lastSet === before && lastAsked <= mine) busy(false);
  }

  async function draw() {
    const state = get();
    const shared = shownMapOf(state);
    if (!shared || state.standing !== "admitted") return;
    const asked = ++lastAsked;
    const box = container.getBoundingClientRect();
    let style: StyleSpecification;
    try {
      const answer = await backend.style({ mapID: shared.id, styleID: state.styleID, hidden: [...state.hidden],
        theme: isDark() ? "dark" : "light", tiles: Math.max(0.25, (box.width * box.height) / (512 * 512)).toFixed(2),
        revision: shared.revision, direct: state.directAllowed && state.tilesDirect });
      if (!answer.ok) {
        if (asked === lastAsked) notice(answer.said);
        return;
      }
      style = answer.value as StyleSpecification;
    } catch {
      if (asked === lastAsked) away();
      return;
    }
    if (asked !== lastAsked) return;
    const settled = () => {
      void frame();
      void askLive();
      void readRegions();
      offerTerrain();
    };
    // Same sources, so the tiles stay; the app's own properties would fail validation.
    const isSameMap = drawnMapID === shared.id;
    drawnMapID = shared.id;
    map.once("style.load", settled);
    lastSet = asked;
    map.setStyle(drawable(style), { diff: isSameMap, validate: false });
    if (isSameMap && map.getStyle()) {
      map.off("style.load", settled);
      settled();
    }
  }

  // A click shows what the feature under it carries, a layer's own first.
  function featureAt(point: { x: number; y: number }): MapGeoJSONFeature | null {
    const box: [PointLike, PointLike] = [[point.x - PICK, point.y - PICK], [point.x + PICK, point.y + PICK]];
    const found = map.queryRenderedFeatures(box).filter((feature) => Object.keys(feature.properties ?? {}).length);
    return found.find((feature) => feature.source.startsWith(CUSTOM)) ?? found[0] ?? null;
  }

  function layerName(feature: MapGeoJSONFeature) {
    const id = feature.source.startsWith(CUSTOM) ? feature.source.slice(CUSTOM.length) : null;
    return shownMapOf(get())?.layers.find((layer) => layer.id.toLowerCase() === id)?.name ?? "";
  }

  let shownFeature: maplibregl.Popup | null = null;
  type Shown = { properties: Record<string, unknown>; layer: string; details?: DetailsSheet | null };
  function showFeatures(found: Shown[], at: maplibregl.LngLat) {
    const card = document.createElement("div");
    const root = createRoot(card);
    flushSync(() => root.render(found.map((one, index) =>
      <FeatureCard key={index} properties={one.properties} layer={one.layer} details={one.details} />)));
    shownFeature = new maplibregl.Popup({ maxWidth: "360px", focusAfterOpen: false, closeButton: true })
      .setLngLat(at).setDOMContent(card).addTo(map);
    shownFeature.on("close", () => queueMicrotask(() => root.unmount()));
    shownFeature.getElement().querySelector(".maplibregl-popup-close-button")?.setAttribute("aria-label", get().words.close);
  }

  // Empty ground is asked of the layers' servers, through the phone, as its own tap asks them.
  let asking = 0;
  async function askServers(at: maplibregl.LngLat) {
    const { mapID, styleID } = get();
    if (!mapID) return;
    const asked = ++asking;
    const seen = map.getBounds();
    const canvas = map.getCanvas();
    let listing: IdentifyListing;
    try {
      listing = await backend.identify(mapID, { lon: at.lng, lat: at.lat,
        box: [seen.getWest(), seen.getSouth(), seen.getEast(), seen.getNorth()],
        size: [canvas.clientWidth, canvas.clientHeight], styleID });
    } catch {
      return;
    }
    if (asked !== asking || !listing.answers.length) return;
    showFeatures(listing.answers.slice(0, MOST_ANSWERS), at);
  }

  // 21: the plain card at once, then the layer's own layout once the phone has filled it.
  async function askLayout(feature: MapGeoJSONFeature, shown: Shown, at: maplibregl.LngLat) {
    const { mapID } = get();
    const layer = feature.source.startsWith(CUSTOM) ? feature.source.slice(CUSTOM.length) : null;
    if (!mapID || !layer) return;
    const asked = asking;
    const values = Object.fromEntries(Object.entries(shown.properties).map(([key, value]) => [key, String(value)]));
    let details: DetailsSheet | null;
    try {
      details = await backend.details(mapID, layer, values);
    } catch {
      return;
    }
    if (asked !== asking || !details) return;
    shownFeature?.remove();
    showFeatures([{ ...shown, details }], at);
  }

  map.on("click", (event) => {
    const feature = featureAt(event.point);
    shownFeature?.remove();
    shownFeature = null;
    asking += 1;
    if (feature) {
      const shown = { properties: feature.properties ?? {}, layer: layerName(feature) };
      showFeatures([shown], event.lngLat);
      void askLayout(feature, shown, event.lngLat);
    } else void askServers(event.lngLat);
  });

  // Once a frame at most: a wide style answers a query slower than a mouse moves.
  let hovering: number | null = null;
  map.on("mousemove", (event) => {
    if (hovering) return;
    hovering = requestAnimationFrame(() => {
      hovering = null;
      map.getCanvas().style.cursor = featureAt(event.point) ? "pointer" : "";
    });
  });

  // The browser specs read the live map and state through this.
  Object.assign(window, { __riki: { map, state: get } });

  return {
    draw: drawBusy,
    resize: () => map.resize(),
    stopLive: () => clearTimeout(liveTimer),
    watchPhone,
    showPhone,
    readRegions: () => void readRegions(),
    // Read inside the frame drawn: the canvas keeps no copy after it.
    snapshot: () => new Promise<Blob | null>((resolve) => {
      map.once("render", () => map.getCanvas().toBlob(resolve, "image/jpeg", 0.85));
      map.triggerRepaint();
    }),
    camera() {
      const centre = map.getCenter();
      return { lat: centre.lat, lng: centre.lng, zoom: map.getZoom() };
    },
    remove() {
      clearTimeout(liveTimer);
      clearTimeout(phone.timer);
      clearTimeout(regions.timer);
      clearTimeout(moved);
      stopTraffic();
      maplibregl.removeProtocol("pmtiles");
      map.remove();
    }
  };
}
