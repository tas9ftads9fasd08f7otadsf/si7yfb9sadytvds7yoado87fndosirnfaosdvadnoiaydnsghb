/** `signedOut` is the site's: no Apple Account is signed in yet. */
export type Standing = "admitted" | "waiting" | "removed" | "signedOut" | "refused";
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
  /** 141 What the phone holds of it, in bytes; older phones leave it out. */
  bytes?: number;
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
  /** 128 The style names and, in the same order, their ids; older phones send no ids. */
  styles?: string[];
  styleIDs?: string[];
  /** 128 The note cut to a card's line, whose it is, and how many others it is shared with. */
  note?: string | null;
  role?: MapRole;
  people?: number;
  isLocked?: boolean;
  offline?: MapOffline;
  /** What the map holds on the phone, and when the phone last wrote it, in Unix seconds. */
  bytes?: number;
  changedAt?: number;
  /** 142 The owner's own one-line label for the map; absent is none, and older phones send none. */
  category?: string;
}

export type MapRole = "own" | "edit" | "view";
export type MapOffline = "ready" | "partly" | "online" | "update";

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
  /** 142 The owner's own label, as the phone cleaned it. */
  category?: string;
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
  /** 141 What the map's packages hold of it on the phone; a region still to download has none. */
  bytes?: number;
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

/** 136 A name and a description, in one language, as the Gallery's sheet writes them. */
export interface PublishText {
  title: string;
  body: string;
}

export interface PublishCategory {
  id: string;
  name: string;
  symbol: string;
}

/** 136 Why the phone refuses, or what the sheet still lacks, in the order its Send says them. */
export type PublishRefusal = "noSuchMap" | "notYours" | "locked" | "builtIn" | "off" | "unsigned" | "notSignedIn"
  | "name" | "category" | "summary" | "coverage" | "changes" | "keysNote" | "manual" | "replaces" | "language"
  | "publicName" | "notConfirmed" | "busy" | "expired";

/** 136 `PeerWebPublish.Offer`: the sheet as the phone would open it, in the phone's language. */
export interface PublishOffer {
  refusal?: PublishRefusal | null;
  /** The phone's own language, whose text is the map's name and description. */
  language: string;
  isUpdate: boolean;
  texts: Record<string, PublishText>;
  categories: PublishCategory[];
  coverage?: Coverage | null;
  coverageLine: string;
  places: string[];
  leftOut: string[];
  keysNote: string;
  manualURL: string;
  hasPreview: boolean;
  publicName: string;
  needsPublicName: boolean;
}

/** 136 `PeerWebPublish.Request`: the sheet's fields, sent only once the phone's person says yes. */
export interface PublishRequest {
  texts: Record<string, PublishText>;
  category?: string;
  coverage?: Coverage;
  keysNote?: string;
  manualURL?: string;
  changes?: string;
  replaces?: boolean;
  publicName?: string;
}

export interface PublishStarted {
  ask: string;
  /** Shown here and on the phone, so its person says yes to the browser meant. */
  code: string;
  expiresIn: number;
}

export interface PublishAnswer {
  state: "waiting" | "sending" | "sent" | "refused" | "failed";
  refusal?: PublishRefusal | null;
  message?: string | null;
  submission?: string | null;
}

/** 135 A folder of the phone's saved places; `isSharedWithMe` is one another person shared. */
export interface SavedFolder {
  id: string;
  name: string;
  symbol: string;
  colour?: string;
  note?: string;
  isShared: boolean;
  isSharedWithMe: boolean;
}

export interface SavedBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** 135 One saved place, line or area; a line's or area's shape is read apart, by its id. */
export interface SavedRow {
  id: string;
  name: string;
  kind: "point" | "line" | "area";
  category?: string;
  /** The spot, or the middle of a shape. */
  latitude: number;
  longitude: number;
  bounds?: SavedBounds;
  folderID?: string;
  note?: string;
  symbol?: string;
  ink?: string;
  mapName?: string;
  layerName?: string;
  /** ISO 8601. */
  savedAt: string;
  /** False where only part of a long line or large area was kept. */
  isComplete: boolean;
}

export interface SavedListing {
  folders: SavedFolder[];
  features: SavedRow[];
  total: number;
}

/** 135 One saved feature as GeoJSON, its row the properties. */
export interface SavedShape {
  type: "Feature";
  id?: string;
  geometry: { type: string; coordinates: unknown };
  properties: SavedRow;
}

export interface FoundPlace {
  start: Start;
  title: string;
  detail?: string | null;
  /** 129 Set for a place of the phone's search, which opens in the place panel with these tags. */
  kind?: string | null;
  properties?: Record<string, string>;
}

/** 129 One answer of `GET …/search` (`PeerWebSearch.Place`): the map's own feature, with a `layer`, or an indexed place. */
export interface PhonePlace {
  title: string;
  detail?: string | null;
  kind?: string | null;
  layer?: string | null;
  layerID?: string | null;
  lat: number;
  lon: number;
  /** West, south, east, north. */
  box?: number[] | null;
  properties: Record<string, string>;
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
  /** 168: the part of a point layer's look it belongs to. */
  aspect?: "colour" | "mark" | "text" | "stacking" | "linesAndAreas";
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
  /** 130 The phone's LIVE pill, for a layer that answers live; none from a phone before 3493. */
  live?: DetailsLive | null;
}

/** 130 `ageSeconds` is since the layer last answered, nil if it never has; the page counts it on from asking. */
export interface DetailsLive {
  isLive: boolean;
  ageSeconds?: number | null;
  windowSeconds: number;
  label: string;
  notLiveLabel: string;
}

/** 130 A vehicle's running state, every part worded by the phone; `tone` is `good`, `late` or `veryLate`. */
export interface DetailsConnection {
  delay?: { minutes: number; sentence: string; short: string; tone: string } | null;
  station?: string | null;
  route?: string | null;
  operatorLine?: string | null;
  planned?: string | null;
  actual?: string | null;
  updated?: string | null;
  note?: string | null;
  labels: { delay: string; planned: string; actual: string; updated: string; note: string };
}

/** `rows`, `text`, `link`, `image` or `allTags`; a kind this page does not know is skipped. */
export interface DetailsBlock {
  kind: string;
  rows?: { title: string; value: string }[] | null;
  title?: string | null;
  text?: string | null;
  warning?: boolean | null;
  /** 130 A connection card whole; `rows` still holds what a phone from before 3493 sends alone. */
  connection?: DetailsConnection | null;
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
  /** 171 Only the points where every rule holds are drawn. */
  filter?: APIPointRule[] | null;
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

/** 171: one condition of a reading's filter, as `APIPointRule` is written. */
export interface APIPointRule {
  key: string;
  op: "is" | "isNot" | "contains" | "notEmpty";
  value?: string | null;
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
  /** 171 What the address answered, for the Points page; a phone from before sends none. */
  answer?: unknown;
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

/** 119 One layer of another map; `blocked` says why it cannot be ticked. */
export interface OtherLayer {
  layer: string;
  title: string;
  subtitle: string;
  symbol: string;
  blocked?: string | null;
}

export interface OtherMap {
  map: string;
  name: string;
  symbol: string;
  iconTintHex?: string | null;
  rows: OtherLayer[];
}

export interface OtherLayers {
  groups: OtherMap[];
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

/** 137 How far the site's first read has come: the engine's bytes, the zones, and what they held. */
export interface Loading {
  engine?: { done: number; total: number | null };
  zones?: { done: number; total: number };
  records: number;
  files: number;
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
  /** 118 Edit map's lock, asked of the phone's person when switched; absent from older phones. */
  lock?: LockOffer;
}

/** 118 `PeerWebLock.Offer`: the row's state, and the phone's own lines under it. */
export interface LockOffer {
  isOn: boolean;
  mayChange: boolean;
  /** Apple's name for how the phone asks; none is the passcode. */
  brand?: string | null;
  note: string;
  sharedNote?: string | null;
}

/** 112 A region package the style would draw from and this browser does not hold; the core names it. */
export interface RegionNeed {
  region: string;
  piece: string;
}

/** 112 One region's packages as the Edit map card and the map's note list them. */
export interface RegionRow {
  region: string;
  name: string;
  /** What to fetch to see the map: pieces not held, and held ones the catalog has a newer build of. */
  fetch: { piece: string; bytes: number; update: boolean }[];
  held: { piece: string; bytes: number }[];
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
