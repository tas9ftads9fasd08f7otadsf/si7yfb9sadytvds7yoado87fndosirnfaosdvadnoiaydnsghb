export type Standing = "admitted" | "waiting" | "removed";
export type Box = [number, number, number, number];

export interface MinimumVersion {
  app?: string | null;
  browser?: string | null;
}

export interface SharedLayer {
  id: string;
  name: string;
  kind: string;
  symbol?: string;
  isLive?: boolean;
}

export interface SharedMap {
  id: string;
  name: string;
  symbol?: string;
  iconTintHex?: string | null;
  revision?: number;
  layers: SharedLayer[];
  minimumVersion?: MinimumVersion | null;
}

export interface Device {
  name: string;
  appVersion?: string;
  sharesLocation?: boolean;
  maps: SharedMap[];
}

export interface PortableStyle {
  id: string;
  name: string;
  arrangement?: { hidden?: string[] };
}

export interface StackLayer {
  id: string;
  name: string;
  symbol?: string;
  tintHex?: string | null;
  opacity?: number;
  isEnabled?: boolean;
}

export interface Start {
  kind: string;
  region?: string;
  country?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  box?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

export interface Portable {
  id: string;
  name: string;
  note?: string;
  symbol?: string;
  iconTintHex?: string | null;
  iconPicture?: string | null;
  previewPicture?: string | null;
  styles?: PortableStyle[];
  selectedStyleID?: string | null;
  stack?: StackLayer[];
  start?: Start | null;
  nameTranslations?: Record<string, string>;
  noteTranslations?: Record<string, string>;
  readerAppearance?: string;
  appearance?: string;
  staysLightInDarkMode?: boolean;
}

export interface Pictures {
  preview?: string | null;
  icon?: string | null;
  symbol?: string;
  tint?: string | null;
}

export interface Region {
  id: string;
  name: string;
  box: Box;
}

export interface RegionList {
  drawn?: Region[];
  downloadable?: Region[];
  downloading?: Region[];
}

export type CoverageSideKey = "include" | "exclude";

export interface CoverageSide {
  world?: boolean;
  continents?: string[];
  mountains?: boolean;
  countries?: string[];
  regions?: string[];
}

export interface Coverage extends CoverageSide {
  exclude?: CoverageSide;
}

export interface CoverageSummary {
  line: string;
  required?: string | null;
  warnings: string[];
  coverage?: Coverage;
}

export interface Place {
  id: string;
  name: string;
}

export interface CoverageRegion extends Place {
  country: string;
  isRange?: boolean;
}

export interface CoveragePlaces {
  continents: Place[];
  countries: Place[];
  regions: CoverageRegion[];
  mountains: string;
}

export interface FoundPlace {
  start: Start;
  title: string;
  detail?: string | null;
}

export interface OptionChoice {
  id: string;
  title: string;
  detail?: string;
}

export interface OptionSection {
  kind: "kinds" | "switch" | "choice" | "colour" | "railVariants";
  title?: string;
  footnote?: string;
  layerScoped?: boolean;
  family?: string;
  items?: { id: string; title: string; light: string; dark: string; isOn: boolean }[];
  key?: string;
  label?: string;
  isOn?: boolean;
  value?: string | null;
  options?: OptionChoice[];
  palette?: string[];
  automatic?: string;
  styles?: { id: string; name: string; variant: string }[];
}

/** What the layers' servers said of a tap on empty ground, top layer's first. */
export interface IdentifyListing {
  answers: { layer: string; properties: Record<string, string> }[];
}

export interface LayerOptions {
  layers: { id: string; sections: OptionSection[] }[];
}

export interface PackageRow {
  name: string;
  detail?: string;
  note?: string;
  symbol?: string;
  overlay?: string | null;
  isDrawn?: boolean;
  isSubPackage?: boolean;
  exclusive?: string[];
}

export interface Packages {
  rows: PackageRow[];
  ticked: string[];
}

export interface ServerPick {
  layer: string;
  [key: string]: unknown;
}

export interface ServerRow {
  kind: "layer" | "note" | string;
  title: string;
  subtitle?: string;
  depth: number;
  pick: ServerPick;
}

export interface Server {
  id: string;
  name: string;
  line: string;
  rows: ServerRow[];
}

export interface ServerList {
  servers: Server[];
}

export interface AddressReading {
  kind: string;
  title?: string;
  footnote?: string;
  rows: { id: string; title: string; subtitle?: string; refusal?: string }[];
}

export interface ServiceRead {
  address: string;
  reading: AddressReading;
  ticks: Set<string>;
}

export interface SessionAnswer {
  standing: Standing;
  edits?: boolean;
  device?: string;
  viewers?: number | null;
}
