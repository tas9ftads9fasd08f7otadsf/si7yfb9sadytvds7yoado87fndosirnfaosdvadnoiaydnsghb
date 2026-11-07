/** English, until the phone's own words arrive or if they never do. */
export const ENGLISH = {
  maps: "Maps", styles: "Styles", layers: "Layers", newMap: "New map", importMap: "Import",
  nothing: "No map here can be shared.", away: "Not serving", app: "Riki Maps", allMaps: "All maps",
  onMapNow: "On map now", edit: "Edit map", done: "Done", cancel: "Cancel", save: "Save", name: "Name",
  note: "Note", otherLanguages: "Other languages", addLanguage: "Add a language", remove: "Remove",
  languages: "", opacity: "Opacity", rename: "Rename", newStyle: "New style", delete: "Delete",
  moveUp: "Move up", moveDown: "Move down", show: "Show", hide: "Hide", north: "N",
  locate: "Locate, pointing north", layerCap: "A style draws up to 12 layers. Switch one off first.",
  close: "Close", viewing: "Browsers viewing", waiting: "Waiting to be let in",
  waitingText: "The phone sharing these maps has been asked to let this browser in.",
  removedTitle: "Removed from these maps",
  removedText: "The phone sharing these maps removed this browser. Ask to join, and it can let you in again.",
  askToJoin: "Ask to join", smallTitle: "Made for a computer's screen",
  smallText: "This size is not supported. On a phone or a tablet, open the shared maps in Riki Maps.",
  typePassword: "Type the edit password", password: "Edit password", unlock: "Unlock",
  wrongPassword: "That is not this phone's edit password", passwordAgain: "Type the edit password again",
  tooManyTries: "Too many wrong passwords. Try again in a few minutes.",
  needsApp: "Needs Riki Maps {version} or later", needsViewer: "Needs browser viewer {version} or later",
  updatePhone: "This map needs browser viewer {version} or later. Update Riki Maps on the phone sharing it.",
  downloadRegion: "Download {region}", downloadingRegion: "Downloading {region}",
  regionNotOnPhone: "{region} is not downloaded on the phone",
  phoneHere: "Show where the phone is",
  minimumVersion: "Minimum version", minimumApp: "App", minimumBrowser: "Browser viewer", anyVersion: "Any version",
  minimumNote: "The oldest app that can show this map.",
  versionShape: "Write up to three numbers joined by dots, like 0.18.0.",
  opensAt: "Opens at", whereLeft: "Where it was left", opensNote: "Where the camera goes when the map opens.",
  locationNote: "Opens on where you are when location is allowed.", "start.location": "Your location",
  "start.coordinates": "Coordinates", "start.region": "Region", "start.country": "Country", "start.state": "State",
  "start.city": "City", latitude: "Latitude", longitude: "Longitude", zoomWord: "Zoom",
  useCentre: "Use the map's centre", "search.region": "Search regions", "search.country": "Search countries",
  coverage: "Coverage", coverageLead: "The part of the world this map covers.", "side.include": "Include",
  "side.exclude": "Exclude", sideWord: "Side",
  includeNote: "What the map takes in. Leave it empty and excluding takes in the world.",
  excludeNote: "What the map leaves out of that. The more specific choice wins: excluding the world and including "
    + "the mountains leaves only the mountains.",
  world: "Whole world", worldNote: "For a map whose layers are drawn everywhere, as OpenStreetMap's are.",
  continents: "Continents", everyRange: "Every mountain range", ranges: "Ranges", countries: "Countries",
  excludedRow: "Excluded", includedRow: "Included", opensDownloaded: "The map opens once these are downloaded.",
  "search.state": "Search states", "search.city": "Search cities", foundAppleMaps: "Found with Apple Maps.",
  appearance: "Appearance", "theme.auto": "Automatic", "theme.light": "Light", "theme.dark": "Dark",
  styling: "Styling", icon: "Icon", background: "Background", pickColour: "Pick a colour", mapSymbols: "",
  iconTints: "", addLayer: "Add layer", whichPackages: "Which packages",
  tickPackages: "Tick every package this map should draw.", add: "Add", deleteLayer: "Delete layer",
  removeAsk: "Remove {name}?", layerOptions: "Options", export: "Export",
  tileURL: "Tile URL", files: "Files", chooseFile: "Choose a file",
  fileKinds: "GeoJSON, KML, KMZ, GPX, PMTiles or MBTiles up to 16 MB. You can also drop it on the map.",
  yourServers: "Your servers", noServers: "No server saved yet.",
  "TerrainControl.Enable": "3D relief, off", "TerrainControl.Disable": "3D relief, on",
  newServer: "New server", serverAddress: "Address", "serverKind.arcgis": "Esri / ArcGIS",
  "serverKind.tilejson": "TileJSON", "serverKind.tiles": "Tile server", "serverKind.mapproxy": "MapProxy"
};

export type Words = typeof ENGLISH & Record<string, string>;

export const WORDS_PATH = "/web/words";

export interface PhoneWords {
  language: string;
  words: Words;
}

/** The phone's words in its own language; nil from an answer that is not them. */
export function readPhoneWords(answer: unknown): PhoneWords | null {
  const said = answer as Partial<PhoneWords> | null;
  if (typeof said?.language !== "string" || typeof said.words !== "object" || said.words == null) return null;
  return { language: said.language, words: { ...ENGLISH, ...said.words } };
}

/** Fills a `{name}` slot the phone left in a sentence. */
export function filledIn(sentence: string, slot: string, value: string): string {
  return sentence.replace(`{${slot}}`, value);
}

export function listed(words: string | undefined): string[] {
  return (words ?? "").split(",").filter(Boolean);
}
