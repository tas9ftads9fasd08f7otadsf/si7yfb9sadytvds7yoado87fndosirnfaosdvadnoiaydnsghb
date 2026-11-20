import {
  ArrowDownToLine, Bed, Bike, Binoculars, Building2, Bus, CableCar, Calendar, Camera, Car, Castle, Check,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Church, Circle, CircleArrowDown, CircleCheck, CircleMinus,
  CirclePlus, CircleUser, Clock, Coffee, Compass, Copy, CopyPlus, Cross, Database, Download, Droplet, Eye, Flag,
  Flame, Folder, FolderPlus, Footprints, Fuel, Globe, Heart, Hospital, House, Image, Info, Landmark, Layers,
  Layers3, LayoutGrid, Link, LocateFixed, LockOpen, Map as MapIcon, MapPin, Menu, Minus, Monitor, Moon,
  Mountain, MountainSnow, Navigation, PanelLeft, Pencil, Phone, Pill, Plane, Plus, RotateCw, Route, Rows3,
  ScanSearch, School, Search, Server, Settings, Share, Ship, ShoppingCart, Signpost, SlidersHorizontal,
  Smartphone, Snowflake, SquareDashed, SquareParking, Star, Store, Sun, SunMoon, Tent, TrainFront, Trash2,
  TreePine, TriangleAlert, Type, Undo2, Upload, UserMinus, UserPlus, Users, UserX, Utensils, WandSparkles, Waves,
  X, Zap
} from "lucide-static";

/** 133: the page's own SF Symbol names, as the open set draws them; Apple's may not be drawn on the web. */
const NAMED: Record<string, string> = {
  "app": Smartphone, "arrow.clockwise": RotateCw, "arrow.down.circle": CircleArrowDown,
  "arrow.down.to.line": ArrowDownToLine, "arrow.uturn.backward": Undo2, "capsule": Pill, "checkmark": Check,
  "checkmark.circle.fill": CircleCheck, "chevron.backward": ChevronLeft, "chevron.down": ChevronDown,
  "chevron.forward": ChevronRight, "chevron.right": ChevronRight, "chevron.up": ChevronUp, "circle": Circle,
  "cylinder.split.1x2": Database, "desktopcomputer": Monitor, "doc.on.doc": Copy,
  "exclamationmark.triangle.fill": TriangleAlert, "eye": Eye, "folder": Folder, "folder.badge.plus": FolderPlus,
  "gearshape": Settings, "globe": Globe, "info.circle": Info, "iphone": Smartphone,
  "line.3.horizontal": Menu, "link": Link, "lock.open": LockOpen, "magnifyingglass": Search, "map": MapIcon,
  "mappin": MapPin, "minus": Minus, "minus.circle": CircleMinus, "pencil": Pencil, "person.2": Users,
  "person.badge.minus": UserMinus, "person.badge.plus": UserPlus, "person.crop.circle": CircleUser,
  "person.crop.circle.badge.xmark": UserX, "plus": Plus, "plus.circle.fill": CirclePlus,
  "plus.square.on.square": CopyPlus, "rectangle.and.text.magnifyingglass": ScanSearch, "scope": LocateFixed,
  "server.rack": Server, "sidebar.left": PanelLeft, "slider.horizontal.3": SlidersHorizontal,
  "square.3.layers.3d": Layers3, "square.and.arrow.down": Download, "square.and.arrow.up": Share,
  "square.dashed": SquareDashed, "square.grid.2x2": LayoutGrid, "square.stack.3d.up": Layers,
  "square.text.square": Rows3, "trash": Trash2, "wand.and.stars": WandSparkles, "xmark": X,
  "photo": Image, "textformat": Type, "sun.max": Sun, "moon": Moon, "circle.lefthalf.filled": SunMoon,
  "square.and.arrow.up.on.square": Upload
};

/** A layer's or a map's own mark is any symbol its owner picked; its word picks the nearest picture. */
const KINDS: [RegExp, string][] = [
  [/mountain|snowflake\.circle/, Mountain], [/snow|skiing|ski/, MountainSnow], [/snowflake/, Snowflake],
  [/tram|train|railway/, TrainFront], [/bus/, Bus], [/cablecar/, CableCar], [/cart|bag/, ShoppingCart],
  [/car|steeringwheel/, Car],
  [/bicycle|bike/, Bike], [/figure|walk|hiking|shoe/, Footprints], [/airplane/, Plane], [/ferry|sailboat|boat/, Ship],
  [/fuelpump/, Fuel], [/parkingsign/, SquareParking], [/signpost/, Signpost], [/road|point\.topleft/, Route],
  [/location|arrow\.triangle/, Navigation], [/safari|compass/, Compass], [/binoculars/, Binoculars],
  [/building\.columns/, Landmark], [/building|apartment/, Building2], [/house|homekit/, House],
  [/castle|crown/, Castle], [/church|cross\.case/, Church], [/cross|medical|staroflife/, Cross],
  [/hospital|bandage/, Hospital], [/graduationcap|book/, School], [/storefront/, Store],
  [/fork\.knife|takeoutbag/, Utensils], [/cup|mug/, Coffee], [/bed/, Bed], [/tent/, Tent],
  [/tree|leaf|camera\.macro|laurel/, TreePine], [/drop|humidity/, Droplet], [/water|wave/, Waves],
  [/flame|fire/, Flame], [/bolt|powerplug/, Zap], [/sun/, Sun], [/moon/, Moon], [/star/, Star],
  [/heart/, Heart], [/flag/, Flag], [/camera|photo/, Camera], [/phone/, Phone], [/clock|timer/, Clock],
  [/calendar/, Calendar], [/globe/, Globe], [/map/, MapIcon], [/mappin|pin/, MapPin], [/info/, Info],
  [/exclamationmark|warning/, TriangleAlert]
];

const drawn = new Map<string, string>();

/** The open set's picture for an SF Symbol name; a name it cannot place is a plain circle. */
export function siteSymbol(name: string | null | undefined): string {
  const asked = name || "map";
  return NAMED[asked] ?? KINDS.find(([word]) => word.test(asked))?.[1] ?? Circle;
}

/** The picture as the `mask` the page's `.sym` lays over the text's colour. */
export function siteSymbolURL(name: string | null | undefined): string {
  const asked = name || "map";
  let url = drawn.get(asked);
  if (!url) {
    url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(siteSymbol(asked).trim())}")`;
    drawn.set(asked, url);
  }
  return url;
}
