/** Every screen's address, made of path segments; the camera stays in the fragment. */
export type EditTab = "layers" | "general" | "styling" | "sharing" | "offline";
export type DataTab = "layers" | "servers" | "regions";
export type ServerPart = "layers" | "general" | "sharing";
export type AddSource = "tile" | "server" | "builtin" | "file";

export const EDIT_TABS: EditTab[] = ["layers", "general", "styling", "sharing", "offline"];
export const DATA_TABS: DataTab[] = ["layers", "servers", "regions"];
export const SERVER_PARTS: ServerPart[] = ["layers", "general", "sharing"];
export const ADD_SOURCES: AddSource[] = ["tile", "server", "builtin", "file"];

/** The first segments the phone answers with the page. */
export const PAGE_SEGMENTS = ["maps", "data", "servers", "settings", "new", "unlock"];

export type Screen =
  | { screen: "home" }
  | { screen: "maps" }
  | { screen: "map"; map: string; style?: string; panel?: "layers" }
  | { screen: "search"; map: string; text: string }
  | { screen: "place"; map: string; layer: string; feature: string }
  | { screen: "edit"; map: string; tab: EditTab; style?: string }
  | { screen: "details"; map: string; layer: string }
  | { screen: "data"; tab: DataTab }
  | { screen: "servers"; server?: string; part?: ServerPart }
  | { screen: "settings" }
  | { screen: "unlock"; key: string };

export type Modal = { kind: "new" } | { kind: "add"; source: AddSource };

export type Route = Screen & { modal?: Modal };

const HOME: Route = { screen: "home" };

const isOneOf = <T extends string>(list: readonly T[], value: string | undefined): value is T =>
  value != null && (list as readonly string[]).includes(value);

/** The map a route draws, where it names one. */
export function mapOf(route: Route): string | undefined {
  return "map" in route ? route.map : undefined;
}

function readMap(map: string, rest: string[]): Route {
  const [part, first, second] = rest;
  switch (part) {
    case undefined:
      return { screen: "map", map };
    case "style":
      return first ? { screen: "map", map, style: first } : { screen: "map", map };
    case "layers":
      if (first === "new") {
        const source: AddSource = isOneOf(ADD_SOURCES, second) ? second : "tile";
        return { screen: "map", map, modal: { kind: "add", source } };
      }
      if (first && second === "details") return { screen: "details", map, layer: first };
      return { screen: "map", map, panel: "layers" };
    case "search":
      return first ? { screen: "search", map, text: first } : { screen: "map", map };
    case "place":
      return first && second ? { screen: "place", map, layer: first, feature: second } : { screen: "map", map };
    case "edit": {
      const tab: EditTab = isOneOf(EDIT_TABS, first) ? first : "layers";
      return tab === "styling" && second ? { screen: "edit", map, tab, style: second } : { screen: "edit", map, tab };
    }
    default:
      return { screen: "map", map };
  }
}

function readSegments(segments: string[]): Route {
  const [first, second, third] = segments;
  switch (first) {
    case undefined:
    case "index.html":
      return HOME;
    case "maps":
      return second ? readMap(second, segments.slice(2)) : { screen: "maps" };
    case "data":
      return { screen: "data", tab: isOneOf(DATA_TABS, second) ? second : "layers" };
    case "servers":
      if (!second) return { screen: "servers" };
      return { screen: "servers", server: second, part: isOneOf(SERVER_PARTS, third) ? third : "layers" };
    case "settings":
      return { screen: "settings" };
    case "new":
      return { screen: "home", modal: { kind: "new" } };
    case "unlock":
      return second ? { screen: "unlock", key: second } : HOME;
    default:
      return HOME;
  }
}

/** A path as the address bar holds it; an unknown or broken one is home. */
export function readRoute(path: string): Route {
  const bare = path.split(/[?#]/)[0] ?? "";
  try {
    return readSegments(bare.split("/").filter(Boolean).map((each) => decodeURIComponent(each)));
  } catch {
    return HOME;
  }
}

const join = (...segments: string[]) => "/" + segments.map(encodeURIComponent).join("/");

function screenPath(route: Screen): string {
  switch (route.screen) {
    case "home":
      return "/";
    case "maps":
      return "/maps";
    case "map":
      if (route.style) return join("maps", route.map, "style", route.style);
      return route.panel ? join("maps", route.map, "layers") : join("maps", route.map);
    case "search":
      return join("maps", route.map, "search", route.text);
    case "place":
      return join("maps", route.map, "place", route.layer, route.feature);
    case "edit":
      return route.tab === "styling" && route.style
        ? join("maps", route.map, "edit", "styling", route.style) : join("maps", route.map, "edit", route.tab);
    case "details":
      return join("maps", route.map, "layers", route.layer, "details");
    case "data":
      return join("data", route.tab);
    case "servers":
      return route.server ? join("servers", route.server, route.part ?? "layers") : "/servers";
    case "settings":
      return "/settings";
    case "unlock":
      return join("unlock", route.key);
  }
}

/** The address of a route; a modal's names the screen under it where it can. */
export function pathOf(route: Route): string {
  const { modal } = route;
  if (modal?.kind === "new") return "/new";
  const map = mapOf(route);
  if (modal?.kind === "add" && map) return join("maps", map, "layers", "new", modal.source);
  return screenPath(route);
}

/** MapLibre's named camera, `#at=z/lat/lon`, kept in old links, as its plain one. */
export function plainCamera(hash: string): string | null {
  return hash.startsWith("#at=") ? "#" + hash.slice(4) : null;
}
