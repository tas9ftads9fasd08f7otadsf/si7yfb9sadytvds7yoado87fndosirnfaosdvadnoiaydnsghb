import type { Coverage, PublishOffer, PublishRefusal, PublishRequest, PublishText } from "./types";
import type { ENGLISH } from "./words";

/** 136 What the person has written in the Gallery card, apart from what the phone offered. */
export interface PublishForm {
  texts: Record<string, PublishText>;
  /** The language whose name and description are shown. */
  shown: string;
  category: string | null;
  keysNote: string;
  manualURL: string;
  changes: string;
  replaces: boolean;
  publicName: string;
}

/** The card as the phone's sheet opens it: its texts, its keys and manual, nothing chosen yet. */
export function formOf(offer: PublishOffer): PublishForm {
  return { texts: structuredClone(offer.texts), shown: offer.language, category: null, keysNote: offer.keysNote,
    manualURL: offer.manualURL, changes: "", replaces: false, publicName: offer.publicName };
}

/** True where the coverage takes in or leaves out some place, as the phone's `cleaned` reads it. */
export function hasPlaces(coverage?: Coverage | null): boolean {
  if (!coverage) return false;
  const lists = [coverage.countries, coverage.regions, coverage.continents];
  return coverage.world === true || coverage.mountains === true || lists.some((list) => (list?.length ?? 0) > 0)
    || Object.values(coverage.exclude ?? {}).some((each) => each === true || (Array.isArray(each) && each.length > 0));
}

export function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/** The first thing the card still lacks, in the order the phone's Send says them; null when it may go. */
export function publishNeeds(form: PublishForm, offer: PublishOffer): PublishRefusal | null {
  const main = form.texts[offer.language];
  if (!main?.title.trim()) return "name";
  if (offer.categories.length > 0 && !form.category) return "category";
  if (!main.body.trim()) return "summary";
  if (!hasPlaces(offer.coverage)) return "coverage";
  if (offer.isUpdate && !form.changes.trim()) return "changes";
  if (offer.leftOut.length > 0 && !form.keysNote.trim()) return "keysNote";
  const manual = form.manualURL.trim();
  if (manual && !isWebAddress(manual)) return "manual";
  if (!offer.isUpdate && !form.replaces) return "replaces";
  if (offer.needsPublicName && !form.publicName.trim()) return "publicName";
  return null;
}

/** The words that name each thing still to do; a code with none shows the phone's own message. */
export const NEEDS_WORD: Partial<Record<PublishRefusal, keyof typeof ENGLISH>> = {
  name: "publishNeedsName", category: "publishNeedsCategory", summary: "publishNeedsSummary",
  coverage: "publishNeedsCoverage", changes: "publishNeedsChanges", keysNote: "publishNeedsKeys",
  manual: "publishNeedsManual", replaces: "publishNeedsAgree", publicName: "publishNeedsName",
  notSignedIn: "publishNotSignedIn"
};

/** What the phone says of each refusal, in English, for a code the page has no words for yet. */
export const REFUSAL_ENGLISH: Record<PublishRefusal, string> = {
  noSuchMap: "No such map",
  notYours: "This map is shared with this phone to look at, not to change",
  locked: "This map is locked on the phone",
  builtIn: "A map the app ships is not published",
  off: "Publishing is switched off in this app",
  unsigned: "It came from a file the app did not sign, so it can't go to the gallery",
  notSignedIn: "Not signed in to iCloud. Sign in in the Settings app.",
  name: "Add a name", category: "Choose a category", summary: "Say what it shows", coverage: "Choose where it covers",
  changes: "Say what changed", keysNote: "Say how to get the keys", manual: "Fix the web address",
  replaces: "Agree that the gallery's map takes this one's place", language: "The app has no such language",
  publicName: "Give the name shown beside what you publish",
  notConfirmed: "The phone's person did not publish it", busy: "Too many publications wait on the phone",
  expired: "The phone was not answered in time; ask again"
};

/** The request as the phone's `Request` reads it: only what is written, and what the card is asked for. */
export function requestOf(form: PublishForm, offer: PublishOffer): PublishRequest {
  const texts: Record<string, PublishText> = {};
  for (const [code, text] of Object.entries(form.texts)) {
    if (code === offer.language || text.title.trim() || text.body.trim()) texts[code] = text;
  }
  const request: PublishRequest = { texts };
  if (form.category) request.category = form.category;
  if (offer.coverage) request.coverage = offer.coverage;
  if (form.keysNote.trim()) request.keysNote = form.keysNote.trim();
  if (form.manualURL.trim()) request.manualURL = form.manualURL.trim();
  if (offer.isUpdate) request.changes = form.changes.trim();
  else request.replaces = form.replaces;
  if (offer.needsPublicName) request.publicName = form.publicName.trim();
  return request;
}

/** The languages written, the phone's first and the rest by the name they are shown under. */
export function languagesOf(form: PublishForm, offer: PublishOffer, nameOf: (code: string) => string): string[] {
  const others = Object.keys(form.texts).filter((code) => code !== offer.language);
  return [offer.language, ...others.sort((one, other) => nameOf(one).localeCompare(nameOf(other)))];
}

/** A refusal the phone sent as `{refusal, message}`; anything else is shown as it was said. */
export function refusalOf(said: string): { refusal: PublishRefusal | null; message: string } {
  try {
    const read = JSON.parse(said) as { refusal?: PublishRefusal; message?: string };
    if (read && typeof read === "object") return { refusal: read.refusal ?? null, message: read.message ?? said };
  } catch { /* plain words */ }
  return { refusal: null, message: said };
}

/** How often the phone is asked whether its person has answered. */
export const PUBLISH_EVERY = 1500;
