/** `signedOut` is the site's: no Apple Account is signed in yet. */
export type Standing = "admitted" | "waiting" | "removed" | "signedOut";
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
  /** 58 The source Edit map folds it under; older phones leave it out. */
  origin?: LayerOrigin;
}

export interface LayerOrigin {
  key: string;
  title: string;
  symbol: string;
}

export interface SharedMap {
  id: string;
  name: string;
  symbol?: string;
  iconTintHex?: string | null;
  revision?: number;
  layers: SharedLayer[];
  minimumVersion?: MinimumVersion | null;
  /** 52 The folder it is in on the phone's Maps sheet. */
  stackID?: string | null;
  stackName?: string | null;
  /** 56 The folder's mark and ground as the phone's Maps sheet draws them. */
  stackSymbol?: string | null;
  stackIconTintHex?: string | null;
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
  symbol?: string;
  iconTintHex?: string | null;
  notes?: string;
  nameTranslations?: Record<string, string>;
  /** 65 Worn in place of its symbol, base64. */
  iconPicture?: string | null;
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
  kind: "kinds" | "switch" | "choice" | "colour" | "railVariants" | "text" | "connection" | "slider" | "values"
    | "details" | "headers" | "probe" | "symbols" | "signKey";
  title?: string;
  footnote?: string;
  layerScoped?: boolean;
  family?: string;
  items?: { id: string; title: string; light: string; dark: string; isOn: boolean; detail?: string;
    isLocked?: boolean }[];
  key?: string;
  label?: string;
  isOn?: boolean;
  value?: string | null;
  options?: OptionChoice[];
  palette?: string[];
  automatic?: string;
  styles?: { id: string; name: string; variant: string }[];
  /** A slider's least, most and step. */
  range?: number[];
  ends?: string[];
  layout?: DetailsLayout;
  /** 70: the keys a `text` section's template may name. */
  keys?: string[];
}

/** 81: a title in other languages by `.lproj` code; the phone leaves the field out when it has none. */
export type Translated = Record<string, string>;

/** 29: a layer's Details layout as the phone lists it, each block named by its handle. */
export interface DetailsLayout {
  sections: { title?: string | null; titleTranslations?: Translated; name: string; blocks: LayoutBlock[] }[];
  used: number;
  limit: number;
  /** The app's parts not placed yet, which go in one place each. */
  parts: LayoutBlock[];
  keys: string[];
  offers: OptionChoice[];
  words: Record<string, string>;
  /** 55: the header, the action buttons (none until added) and the choices they offer. */
  header?: { title?: string | null; symbol?: string | null; layerSymbol: string; titleTranslations?: Translated };
  actions?: LayoutActions | null;
  /** 114: each shape and whether a tap on it opens the sheet; none from an older phone. */
  taps?: { kind: string; name: string; isOn: boolean }[];
  symbols?: string[];
  /** 80: the icon picker's groups for a row's mark; none from a phone that cannot set it. */
  symbolGroups?: { title: string; symbols: string[] }[];
  choices?: Record<string, OptionChoice[]>;
  /** 81: the phone takes titles in other languages; an older phone sends no flag. */
  takesTranslations?: boolean;
  /** 79: the layer's points the preview may fill; absent from a phone that sends none. */
  samples?: LayoutSample[];
  /** The phone's words for a layer with no point to show yet. */
  sampleNote?: string;
}

/** 79: a point's tags and the phone's caption for it, as the app's editor words it. */
export interface LayoutSample {
  caption: string;
  properties: Record<string, string>;
}

/** 55: the placed buttons in the sheet's order, then the app's own left off. */
export interface LayoutActions {
  items: { id: string; name: string; note: string; isOn: boolean; button?: LayoutButton }[];
  labels: string;
  highlightsFirst: boolean;
}

export interface LayoutButton {
  id: string;
  label: string;
  symbol?: string | null;
  look: string;
  action: string;
  template?: string | null;
  subject?: string | null;
  body?: string | null;
  hides: boolean;
  labelTranslations?: Translated;
}

/** 55: a block's own settings, only those of its kind. */
export interface BlockSettings {
  icon?: boolean;
  hides?: boolean;
  look?: string;
  icons?: boolean;
  hidesEmpty?: boolean;
  rows?: { index: number; title: string; value: string; symbol?: string }[];
  button?: LayoutButton;
  card?: Record<string, string>;
  live?: number | null;
}

export interface LayoutBlock {
  handle: string;
  kind: string;
  name: string;
  part?: string;
  value?: string;
  heading?: string;
  headingTranslations?: Translated;
  style?: string;
  counts: boolean;
  settings?: BlockSettings | null;
}

/** 21: a layer's Details layout, filled and worded by the phone. */
export interface DetailsSheet {
  title?: string | null;
  sections: { title?: string | null; blocks: DetailsBlock[] }[];
  /** What the layout read, which the card's tag list leaves out. */
  keys: string[];
}

/** `rows`, `text`, `link`, `image` or `allTags`; a kind this page does not know is skipped. */
export interface DetailsBlock {
  kind: string;
  rows?: { title: string; value: string }[] | null;
  title?: string | null;
  text?: string | null;
  warning?: boolean | null;
}

/** What the layers' servers said of a tap on empty ground, top layer's first. */
export interface IdentifyListing {
  answers: { layer: string; properties: Record<string, string>; details?: DetailsSheet | null }[];
}

/** The keys Add layer's API page reads; the rest of the phone's reading travels as it is. */
export interface APIReading {
  itemsPath: string;
  spelling: string;
  latitudeKey: string;
  longitudeKey: string;
  positionKey: string;
  nameKey?: string | null;
  positionOrder?: string | null;
  colourKey?: string | null;
  imageKey?: string | null;
  shownKeys?: string[];
  refreshSeconds?: number | null;
  detailRows?: APIDetailRow[] | null;
  cookies?: CookiePreflight | null;
  [other: string]: unknown;
}

/** 3409: a DXF as `PeerWebDXF` reads it: the phone's systems and the one it found. */
export interface DXFReading {
  fileName: string;
  system: string | null;
  systems: { value: string; title: string }[];
  said: string;
  features: number;
}

/** 3397: a page asked for cookies before the address, as `CookiePreflight` is written. */
export interface CookiePreflight {
  isOn: boolean;
  page: string;
  seconds: number;
}

/** 3397: a row of the sheet's Details card, as `APIDetailRow` is written. */
export interface APIDetailRow {
  id: string;
  title: string;
  symbol: string;
  value: string;
  isCoordinates?: boolean | null;
  isHidden?: boolean | null;
}

export interface APIChoice {
  value: string;
  title: string;
  detail?: string | null;
}

/** 3003: what the phone read of an API, and the reading it would add. */
export interface APIRead {
  reading: APIReading | null;
  paths: string[];
  keys: string[];
  points: number;
  name: string;
  said: string;
  samples?: Record<string, string>;
  keepsCookie?: boolean;
  choices?: { spellings: APIChoice[]; orders: APIChoice[]; refresh: APIChoice[]; cookieAges: APIChoice[] };
}

/** 3397: how the phone asks beyond the reading: its cookie page, a typed cookie, the colour. */
export interface APIAsk {
  cookies?: CookiePreflight | null;
  cookie?: string;
  tint?: string | null;
}

/** 60: what the phone's Test or Read said about a layer's address. */
export interface LayerTest {
  reachable: boolean;
  said: string;
}

/** 69: one country's traffic signs, as the phone's Traffic signs key lists them. */
export interface RoadSigns {
  country: string | null;
  countryName: string;
  countries: OptionChoice[];
  signs: { id: string; title: string }[];
}

/** 69: what the key asks: a country picked, the search typed and the view's centre. */
export interface RoadSignsAsk {
  country?: string;
  q?: string;
  near?: string;
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

export interface ServerFact {
  name: string;
  value: string;
}

export interface Server {
  id: string;
  name: string;
  line: string;
  rows: ServerRow[];
  /** 27: what the phone's server page shows under General; an older phone sends none. */
  address?: string;
  kind?: string;
  symbol?: string;
  iconTintHex?: string | null;
  facts?: ServerFact[];
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
  /** 78 The site's editor: signed in to iCloud is the permission, so no password is traded. */
  token?: string;
  /** The phone lets a browser load tiles from their source. */
  direct?: boolean;
}

/** 50 What Edit map's Availability and Styles rows read, as `PeerWebMapSwitches.Switches` writes it. */
export interface MapSwitches {
  picker: boolean;
  carPlay: boolean;
  legend: boolean;
  world: boolean;
  legendEverywhere: boolean;
  worldEverywhere: boolean;
  hasNothingToDraw: boolean;
  ownsSettings: boolean;
  groupsByOrigin: boolean;
  groupingOffered: boolean;
  groupingReorders: boolean;
  stylesDisagree: boolean;
  differsFromDefault: boolean;
  layersWithoutStyle: number;
  removedStyles: number;
  /** 53 The styles edited away from what was published; older phones leave it out. */
  editedStyles?: string[];
  /** 62 Who loses the map deleted, as the Maps sheet asks; absent where it offers no Delete. */
  deletion?: "onlyYou" | "everyone" | "yourList";
}

/** 59 A role on a shared map, as `MapShareRole` names it. */
export type ShareRole = "owner" | "admin" | "editor" | "reader";

/** 59 One person on the share, as `PeerWebPeople.Person` writes them. */
export interface SharePerson {
  id: string;
  name: string;
  role: ShareRole;
  line: string;
  hasAccepted: boolean;
  isYou: boolean;
  mayChangeRole: boolean;
  mayRemove: boolean;
}

/** 59 Edit map's People card, as `PeerWebPeople.Roster` writes it. */
export interface SharePeople {
  isShared: boolean;
  role: ShareRole;
  mayInvite: boolean;
  invitesDirectly: boolean;
  people: SharePerson[];
  tally: string;
  link?: string | null;
  linkRole?: ShareRole | null;
  mayChangeLink: boolean;
  heldBy?: string | null;
  caveat: string;
  /** 68 A folder's maps in its share, and those shared alone that stay out. */
  folderLine?: string | null;
  /** 68 Maps put in the folder since it was shared, which Share moves in. */
  addsMore?: boolean | null;
  /** 108 The site only reads a share; the card offers no change and says they are made in the app. */
  readOnly?: boolean;
}

/** 57 What the page asks Download tiles for: its view, or the view chosen on the map. */
export interface OfflineAsk {
  box: number[];
  chosen: boolean;
  zoom?: number;
  layers?: string[];
}

/** 57 One layer of Download tiles, as `PeerWebOffline.Row` writes it. */
export interface OfflineRow {
  id: string;
  name: string;
  isDownloadable: boolean;
  isIncluded: boolean;
  detail: string;
  bytes: number;
  stored: number;
  storedLine?: string | null;
  job?: string | null;
  fraction?: number | null;
  /** Edit map's question, offered only where the phone would delete. */
  discard?: { ask: string; note: string } | null;
}

/** 57 Download tiles for the whole map, counted by the phone, as `PeerWebOffline.Plan` writes it. */
export interface OfflinePlan {
  area: string;
  box: number[];
  minZoom: number;
  maxZoom: number;
  zoom: number;
  zoomLabel: string;
  limits: string;
  rows: OfflineRow[];
  toFetch: string;
  held: string;
  free: string;
  total: string;
  exceedsSpace: boolean;
  isQueued: boolean;
  cancel?: string | null;
}

/** 67 One layer an Esri service publishes, as `PeerWebEsriServices.Layer` writes it. */
export interface EsriLayer {
  id: number;
  name: string;
  symbol: string;
  subtitle: string;
  /** The map's layer drawing it, when the map holds it. */
  layer?: string | null;
  refusal?: string | null;
}

/** 67 A service Edit map lists, with its page's rows. */
export interface EsriService {
  id: string;
  name: string;
  subtitle: string;
  detail: string;
  url: string;
  take: string;
  readAgain: string;
  footnote: string;
  /** The style drawing this service alone, when the map has one. */
  style?: string | null;
  layers: EsriLayer[];
}

export interface EsriListing {
  services: EsriService[];
}

/** 67 One thing a service's page does, as `PeerWebEsriServices.asked` reads it. */
export type EsriChange = { kind: "add" | "remove"; layer: number } | { kind: "read" } | { kind: "forget" };
