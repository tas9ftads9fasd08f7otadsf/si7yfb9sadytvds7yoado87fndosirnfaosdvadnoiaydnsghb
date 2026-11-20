import type { Edit, Shelving } from "@/lib/edit";
import type { PeopleAsk, Sharer } from "@/lib/people";
import type { APIAsk, APIRead, DXFReading, APIReading, CoveragePlaces, CoverageSummary, Device, DetailsSheet, EsriChange, EsriListing, FoundPlace, IdentifyListing,
  LayerOptions, LayerTest, MapSwitches, RoadSigns, RoadSignsAsk, OfflineAsk, OfflinePlan, Packages, Portable, RegionList, ServerList, ServerPick, SessionAnswer,
  SharePeople } from "@/lib/types";

/** What was asked for, or why not: the status and the words that came with it. */
/** 92 An ask to edit, shown as a QR code and the four letters the phone shows too. */
export interface PairStarted {
  id: string;
  code: string;
  expiresIn: number;
}

export type Answer<T> = { ok: true; value: T } | { ok: false; status: number; said: string };

/** 82 A call the target does not do yet: the page says so, and the connection is not lost. */
export class NotOnSite extends Error {}

/** 88 The core's rules are not all in the module yet: the page says so, and the connection is not lost. */
export class CoreNotReady extends NotOnSite {}

/** 82 The parts of the page a target may not answer yet; a screen offers only what it does. 86 `addLayer` is the panel
 * with a tile address and a service's layers; its packages, files, API layers and servers are offered apart. */
export type Feature = "places" | "newMap" | "shelf" | "exportMap" | "duplicateMap" | "pictures" | "addLayer" | "addPackages" | "addFile" | "addAPI" | "servers" | "coverage" | "pairing";

/** 78 A map whose rows another device changed, and the author its history names, if any. */
export interface ChangedElsewhere {
  mapID: string;
  name: string;
  author: string | null;
}

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
  /** Sources that need nothing of the phone keep their own address. */
  direct?: boolean;
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
  /** 82 Whether this target answers the calls behind a part of the page. */
  offers(feature: Feature): boolean;

  words(): Promise<unknown>;
  session(): Promise<Answer<SessionAnswer>>;
  askToJoin(): Promise<Answer<SessionAnswer>>;
  /** Trades the edit password for a token; 429 when tried too often. */
  unlock(key: string): Promise<Answer<{ token: string }>>;
  /** 92 Asks the phone for a QR code it can scan to let this browser edit. */
  pair?(): Promise<Answer<PairStarted>>;
  /** 92 Waiting until the phone said yes, then the token; 403 refused, 410 ran out. */
  pairState?(id: string): Promise<Answer<{ waiting: true } | { token: string }>>;
  /** 92 The address of the ask's QR code, drawn by the phone. */
  pairPicture?(id: string): string;
  /** The token later calls carry, read when each is made. */
  useToken(token: () => string | null): void;
  /** 76 Told when the maps changed elsewhere, or the person signed in or out; returns how to stop. */
  onChanged(listener: (changed?: ChangedElsewhere[]) => void): () => void;
  /** 76 The site's Sign in with Apple or sign-out button, put in this element; the phone has none. */
  mountAccount?(button: "in" | "out", into: HTMLElement): void;
  /** 83 The name the site's changes are made under, typed in its account part; the phone has none. */
  readonly author?: { read(): string; keep(name: string): void };

  maps(): Promise<Device>;
  map(id: string): Promise<Portable>;
  style(ask: StyleAsk): Promise<Answer<unknown>>;
  change(mapID: string, styleID: string | null, edit: Edit): Promise<Answer<Portable>>;
  /** 78 The last change put back, while nothing else has touched its rows; the site only. */
  undo?(mapID: string): Promise<Answer<Portable>>;
  newMap(name: string): Promise<Answer<{ id: string }>>;
  importMap(file: Blob): Promise<Answer<{ id: string }>>;
  exportMap(id: string): Promise<Answer<Saved>>;
  /** 50 A copy of the map, shared at once as a new map is. */
  duplicateMap(id: string): Promise<Answer<{ id: string }>>;
  /** 62 The map deleted as the Maps sheet deletes it, its name typed to confirm. */
  deleteMap(id: string, name: string): Promise<Answer<null>>;
  /** 52 The Maps list's order, sort and folders; the phone answers with the list again. */
  shelve(shelving: Shelving): Promise<Answer<Device>>;
  /** 50 What Availability and the Styles card's rows read, which the portable copy leaves out. */
  switches(mapID: string): Promise<Answer<MapSwitches>>;
  /** 65 `styleIcon` is the picture of the style named, as its style page sets one. */
  setPicture(mapID: string, kind: "icon" | "preview" | "styleIcon", picture: ArrayBuffer, style?: string): Promise<Answer<Portable>>;
  /** 59 Who a map, or since 68 a folder, is shared with, read off the phone's share. */
  people(of: Sharer): Promise<Answer<SharePeople>>;
  /** 59 One change to the share, carried out by the phone; it answers with the people again. */
  askPeople(of: Sharer, ask: PeopleAsk): Promise<Answer<SharePeople>>;

  layerOptions(mapID: string): Promise<Answer<LayerOptions>>;
  /** 69 The traffic signs' key for one country. */
  roadSigns(mapID: string, ask: RoadSignsAsk): Promise<Answer<RoadSigns>>;
  /** 69 Where a picture the phone draws, a sign among them, is fetched from. */
  iconURL(name: string): string;
  /** 60 The layer's address asked as the phone's Test asks it. */
  testLayer(mapID: string, layerID: string): Promise<Answer<LayerTest>>;
  packages(mapID: string): Promise<Answer<Packages>>;
  servers(): Promise<Answer<ServerList>>;
  addServer(kind: string, address: string, name: string): Promise<Answer<ServerList>>;
  importServers(file: Blob): Promise<Answer<ServerList>>;
  exportServers(id?: string): Promise<Answer<Saved>>;
  addServerLayers(mapID: string, picks: ServerPick[]): Promise<Answer<Portable>>;
  readAPI(address: string, reading?: APIReading | null, ask?: APIAsk): Promise<Answer<APIRead>>;
  addAPI(mapID: string, address: string, reading: APIReading, name: string, ask?: APIAsk): Promise<Answer<Portable>>;
  addFile(mapID: string, file: File, system?: string): Promise<Answer<Portable>>;
  readDXF(mapID: string, file: File): Promise<Answer<DXFReading>>;
  /** 67 Edit map's Esri services and each one's page. */
  esriServices(mapID: string): Promise<Answer<EsriListing>>;
  /** 67 A layer ticked or taken off, the service read again or forgotten; the map comes back. */
  changeEsriService(mapID: string, serviceID: string, asked: EsriChange): Promise<Answer<Portable>>;
  readAddress(address: string): Promise<Answer<{ kind: string }>>;
  addTiles(mapID: string, template: string): Promise<Answer<Portable>>;
  addServiceLayers(mapID: string, address: string, picks: string[]): Promise<Answer<Portable>>;

  coverage(mapID: string): Promise<Answer<CoverageSummary>>;
  coveragePlaces(): Promise<Answer<CoveragePlaces>>;
  startPlaces(kind: string, query: string): Promise<Answer<FoundPlace[]>>;
  regions(mapID: string): Promise<RegionList>;
  downloadRegion(mapID: string, regionID: string): Promise<Answer<null>>;
  /** 57 Download tiles for the whole map, as the phone counts it for this area. */
  offlinePlan(mapID: string, ask: OfflineAsk): Promise<Answer<OfflinePlan>>;
  /** 57 Queues the ticked layers, or cancels them; the plan comes back as it now stands. */
  offlineDownload(mapID: string, ask: OfflineAsk, action: "start" | "cancel"): Promise<Answer<OfflinePlan>>;
  /** 57 Deletes what a layer has stored, as Edit map's Delete does. */
  discardStored(mapID: string, layerID: string): Promise<Answer<null>>;

  live(mapID: string, layerID: string, box: string): Promise<unknown>;
  identify(mapID: string, ask: AddressAsk): Promise<IdentifyListing>;
  details(mapID: string, layerID: string, values: Record<string, string>): Promise<DetailsSheet | null>;
  phoneLocation(): Promise<{ lat: number; lon: number }>;
  icon(name: string): Promise<Icon | null>;
  /** A CSS `url(…)` of a symbol, laid on as a mask. */
  symbolURL(name?: string | null): string;
}
