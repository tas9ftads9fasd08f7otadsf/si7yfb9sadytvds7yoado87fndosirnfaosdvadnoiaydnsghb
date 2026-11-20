import { create } from "zustand";
import { backend } from "@backend";
import { NEEDS_WORD, PUBLISH_EVERY, type PublishForm, REFUSAL_ENGLISH, formOf, publishNeeds, refusalOf, requestOf }
  from "@/lib/publish";
import type { PublishOffer, PublishRefusal, PublishStarted, PublishText } from "@/lib/types";
import { editing, offers, takePreview, useViewer } from "./viewer";

/** 136 Edit map › Sharing's Gallery card: the offer as the phone made it, what is written, and the ask. */
export type PublishStep = "form" | "sending" | "waiting" | "sent" | "failed";

export interface PublishState {
  mapID: string | null;
  offer: PublishOffer | null;
  form: PublishForm | null;
  step: PublishStep;
  started: PublishStarted | null;
  /** The phone's words for what stopped the last try, shown over the form. */
  said: string | null;
  sentAt: number | null;
  submission: string | null;
}

const FIRST: PublishState = { mapID: null, offer: null, form: null, step: "form", started: null, said: null,
  sentAt: null, submission: null };

export const usePublish = create<PublishState>(() => FIRST);

const set = usePublish.setState;
const get = usePublish.getState;

let timer: ReturnType<typeof setTimeout> | undefined;

export function resetPublish() {
  clearTimeout(timer);
  set(FIRST, true);
}

/** The page's words for a refusal where it has them, else what the phone said. */
function sayRefusal(refusal: PublishRefusal | null, message: string): string {
  const key = refusal ? NEEDS_WORD[refusal] : undefined;
  const words = useViewer.getState().words;
  return (key ? words[key] : undefined) || message || (refusal ? REFUSAL_ENGLISH[refusal] : "");
}

/** The offer is read each time the card opens, and again after Coverage changed; what is written stays. */
export async function loadPublish(mapID: string) {
  if (!useViewer.getState().editToken || !offers("publish")) return;
  if (get().mapID !== mapID) {
    resetPublish();
    set({ mapID });
  }
  const answer = await editing(() => backend.publishOffer(mapID), { quiet: true });
  if (!answer?.ok || get().mapID !== mapID) return;
  set({ offer: answer.value, form: get().form ?? formOf(answer.value) });
}

export function editPublish(patch: Partial<PublishForm>) {
  const { form } = get();
  if (form) set({ form: { ...form, ...patch } });
}

export function writePublish(code: string, part: keyof PublishText, value: string) {
  const { form } = get();
  if (!form) return;
  const was = form.texts[code] ?? { title: "", body: "" };
  set({ form: { ...form, texts: { ...form.texts, [code]: { ...was, [part]: value } } } });
}

export function addPublishLanguage(code: string) {
  const { form } = get();
  if (!form || !code || form.texts[code]) return;
  set({ form: { ...form, texts: { ...form.texts, [code]: { title: "", body: "" } }, shown: code } });
}

export function removePublishLanguage(code: string) {
  const { form, offer } = get();
  if (!form || !offer || code === offer.language) return;
  const texts = { ...form.texts };
  delete texts[code];
  set({ form: { ...form, texts, shown: offer.language } });
}

/** Sends the card to the phone, which asks its person first; the preview goes before it when none is set. */
export async function sendPublish() {
  const { mapID, offer, form, step } = get();
  if (!mapID || !offer || !form || step !== "form" || publishNeeds(form, offer)) return;
  set({ step: "sending", said: null });
  if (!offer.hasPreview) await takePreview();
  const answer = await editing(() => backend.publishSend(mapID, requestOf(form, offer)));
  if (get().mapID !== mapID) return;
  if (!answer) {
    set({ step: "form" });
    return;
  }
  if (!answer.ok) {
    const { refusal, message } = refusalOf(answer.said);
    set({ step: "form", said: sayRefusal(refusal, message) });
    if (refusal === "notSignedIn" || refusal === "off") void loadPublish(mapID);
    return;
  }
  set({ step: "waiting", started: answer.value });
  timer = setTimeout(askPublish, PUBLISH_EVERY);
}

/** Asked about every second and a half: has the phone's person answered? */
async function askPublish() {
  const { mapID, started, step } = get();
  if (!mapID || !started || step !== "waiting") return;
  const answer = await editing(() => backend.publishAnswer(mapID, started.ask), { quiet: true });
  if (get().started?.ask !== started.ask) return;
  if (answer && !answer.ok) {
    set({ step: "form", started: null, said: answer.status === 410 ? REFUSAL_ENGLISH.expired : answer.said });
    return;
  }
  const said = answer?.value;
  if (said?.state === "sent") {
    set({ step: "sent", sentAt: Date.now(), submission: said.submission ?? null });
    return;
  }
  if (said?.state === "failed") {
    set({ step: "failed", said: said.message ?? null });
    return;
  }
  if (said?.state === "refused") {
    set({ step: "form", started: null, said: sayRefusal(said.refusal ?? null, said.message ?? "") });
    return;
  }
  timer = setTimeout(askPublish, PUBLISH_EVERY);
}

/** The browser takes its ask back before the phone's person answered. */
export async function cancelPublish() {
  const { mapID, started } = get();
  clearTimeout(timer);
  set({ step: "form", started: null, said: null });
  if (mapID && started) await editing(() => backend.publishCancel(mapID, started.ask), { quiet: true });
}

/** Done after Sent or a failure: the card opens afresh from what the phone offers now. */
export function donePublish() {
  const { mapID, step, form } = get();
  clearTimeout(timer);
  if (step === "sent") {
    set({ ...FIRST, mapID });
    if (mapID) void loadPublish(mapID);
    return;
  }
  set({ step: "form", started: null, said: null, form });
}
