import type { Edit } from "@/lib/edit";
import type { APIRead, APIReading, CoveragePlaces, CoverageSummary, Device, DetailsSheet, FoundPlace, IdentifyListing,
  LayerOptions, Packages, Portable, RegionList, ServerList, ServerPick, SessionAnswer } from "@/lib/types";

/** What was asked for, or why not: the status and the words that came with it. */
export type Answer<T> = { ok: true; value: T } | { ok: false; status: number; said: string };

/** A file to hand the person, named as it was sent. */
export interface Saved {
  blob: Blob;
  name: string;
}

/** An icon drawn for the map, with how MapLibre should lay it on. */
export interface Icon {
  image: Blob;
  sdf: boolean;
  pixelRatio: number;
}

/** What the map view asks to draw a map's style. */
export interface StyleAsk {
  mapID: string;
  styleID: string | null;
  hidden: string[];
  theme: "light" | "dark";
  /** How many 512 px tiles the map's box holds, so the phone sizes its answer. */
  tiles: string;
  revision?: number | null;
}

export interface AddressAsk {
  lon: number;
  lat: number;
  box: [number, number, number, number];
  size: [number, number];
  styleID: string | null;
}

/**
 * Everything the page asks of where its maps live; each target answers it its own way.
 * A call rejects only when that place cannot be reached at all.
 */
export interface Backend {
  readonly target: "phone" | "web";

  words(): Promise<unknown>;
  session(): Promise<Answer<SessionAnswer>>;
  askToJoin(): Promise<Answer<SessionAnswer>>;
  /** Trades the edit password for a token; 429 when tried too often. */
  unlock(key: string): Promise<Answer<{ token: string }>>;
  /** The token later calls carry, read when each is made. */
  useToken(token: () => string | null): void;

  maps(): Promise<Device>;
  map(id: string): Promise<Portable>;
  style(ask: StyleAsk): Promise<Answer<unknown>>;
  change(mapID: string, styleID: string | null, edit: Edit): Promise<Answer<Portable>>;
  newMap(name: string): Promise<Answer<{ id: string }>>;
  importMap(file: Blob): Promise<Answer<{ id: string }>>;
  exportMap(id: string): Promise<Answer<Saved>>;
  setPicture(mapID: string, kind: "icon" | "preview", picture: ArrayBuffer): Promise<Answer<Portable>>;

  layerOptions(mapID: string): Promise<Answer<LayerOptions>>;
  packages(mapID: string): Promise<Answer<Packages>>;
  servers(): Promise<Answer<ServerList>>;
  addServer(kind: string, address: string, name: string): Promise<Answer<ServerList>>;
  importServers(file: Blob): Promise<Answer<ServerList>>;
  exportServers(id?: string): Promise<Answer<Saved>>;
  addServerLayers(mapID: string, picks: ServerPick[]): Promise<Answer<Portable>>;
  readAPI(address: string, reading?: APIReading | null): Promise<Answer<APIRead>>;
  addAPI(mapID: string, address: string, reading: APIReading, name: string): Promise<Answer<Portable>>;
  addFile(mapID: string, file: File): Promise<Answer<Portable>>;
  readAddress(address: string): Promise<Answer<{ kind: string }>>;
  addTiles(mapID: string, template: string): Promise<Answer<Portable>>;
  addServiceLayers(mapID: string, address: string, picks: string[]): Promise<Answer<Portable>>;

  coverage(mapID: string): Promise<Answer<CoverageSummary>>;
  coveragePlaces(): Promise<Answer<CoveragePlaces>>;
  startPlaces(kind: string, query: string): Promise<Answer<FoundPlace[]>>;
  regions(mapID: string): Promise<RegionList>;
  downloadRegion(mapID: string, regionID: string): Promise<Answer<null>>;

  live(mapID: string, layerID: string, box: string): Promise<unknown>;
  identify(mapID: string, ask: AddressAsk): Promise<IdentifyListing>;
  details(mapID: string, layerID: string, values: Record<string, string>): Promise<DetailsSheet | null>;
  phoneLocation(): Promise<{ lat: number; lon: number }>;
  icon(name: string): Promise<Icon | null>;
  /** A CSS `url(…)` of a symbol, laid on as a mask. */
  symbolURL(name?: string | null): string;
}
