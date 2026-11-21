import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLISH_EVERY } from "@/lib/publish";
import type { PublishAnswer, PublishOffer } from "@/lib/types";
import { type MapControl, setMapControl } from "@/map/control";
import { addPublishLanguage, cancelPublish, donePublish, editPublish, loadPublish, removePublishLanguage, resetPublish,
  sendPublish, usePublish, writePublish } from "./publish";
import { resetViewer, useViewer } from "./viewer";

const fake = vi.hoisted(() => ({ offer: vi.fn(), send: vi.fn(), answer: vi.fn(), cancel: vi.fn(), setPicture: vi.fn(),
  order: [] as string[] }));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, offers: () => true, publishOffer: fake.offer, publishSend: fake.send,
    publishAnswer: fake.answer, publishCancel: fake.cancel, setPicture: fake.setPicture,
    maps: async () => ({ name: "iPad", maps: [] }) } };
});

const get = usePublish.getState;

const offer: PublishOffer = { language: "en", isUpdate: false, texts: { en: { title: "High Tatras", body: "Hiking maps" } },
  categories: [{ id: "hiking", name: "Hiking", symbol: "figure.hiking" }], coverage: { countries: ["SK"] },
  coverageLine: "Slovakia", places: ["Slovakia"], leftOut: [], keysNote: "", manualURL: "", hasPreview: true, publicName: "",
  needsPublicName: false };

const ok = <T,>(value: T) => ({ ok: true as const, value });
const said = (state: PublishAnswer["state"], more: Partial<PublishAnswer> = {}) => ok({ state, ...more });

const fill = () => editPublish({ category: "hiking", replaces: true });

describe("the Gallery card's store", () => {
  beforeEach(() => {
    resetViewer();
    resetPublish();
    vi.useFakeTimers();
    vi.clearAllMocks();
    fake.order.length = 0;
    fake.offer.mockResolvedValue(ok(offer));
    fake.send.mockResolvedValue(ok({ ask: "A1", code: "7QK2", expiresIn: 300 }));
    fake.answer.mockResolvedValue(said("waiting"));
    fake.cancel.mockResolvedValue(ok(null));
    useViewer.setState({ editToken: "t", mapID: "M" });
  });
  afterEach(() => {
    resetPublish();
    setMapControl(null);
    vi.useRealTimers();
  });

  // 136 the offer is read for the map, and its texts become what is written
  it("reads the offer and starts the card from its texts", async () => {
    await loadPublish("M");
    expect(get().offer).toEqual(offer);
    expect(get().form?.texts).toEqual(offer.texts);
    expect(get().form?.shown).toBe("en");
    expect(get().form?.category).toBeNull();
  });

  // 136 reading the offer again, after Coverage changed, keeps what the person wrote
  it("keeps what is written when the offer is read again", async () => {
    await loadPublish("M");
    writePublish("en", "body", "Hiking maps of the Tatras");
    fake.offer.mockResolvedValue(ok({ ...offer, coverage: { countries: ["SK", "PL"] }, coverageLine: "Slovakia, Poland" }));
    await loadPublish("M");
    expect(get().offer?.coverageLine).toBe("Slovakia, Poland");
    expect(get().form?.texts.en?.body).toBe("Hiking maps of the Tatras");
  });

  // 136 another map starts the card over
  it("starts over for another map", async () => {
    await loadPublish("M");
    writePublish("en", "title", "Mine");
    useViewer.setState({ mapID: "N" });
    await loadPublish("N");
    expect(get().form?.texts.en?.title).toBe("High Tatras");
  });

  // 136 a browser that may not edit, or a phone that answers no offer, shows no card
  it("shows no card without a token or an offer", async () => {
    useViewer.setState({ editToken: null });
    await loadPublish("M");
    expect(fake.offer).not.toHaveBeenCalled();
    useViewer.setState({ editToken: "t" });
    fake.offer.mockResolvedValue({ ok: false, status: 404, said: "" });
    await loadPublish("M");
    expect(get().offer).toBeNull();
  });

  // 136 languages are added, written and taken away; the phone's own stays
  it("adds, writes and removes a language, never the phone's own", async () => {
    await loadPublish("M");
    addPublishLanguage("sk");
    expect(get().form?.shown).toBe("sk");
    writePublish("sk", "title", "Vysoké Tatry");
    expect(get().form?.texts.sk).toEqual({ title: "Vysoké Tatry", body: "" });
    removePublishLanguage("en");
    expect(Object.keys(get().form!.texts)).toEqual(["en", "sk"]);
    removePublishLanguage("sk");
    expect(Object.keys(get().form!.texts)).toEqual(["en"]);
    expect(get().form?.shown).toBe("en");
  });

  // 136 nothing is sent while the card lacks something
  it("sends nothing while something is missing", async () => {
    await loadPublish("M");
    await sendPublish();
    expect(fake.send).not.toHaveBeenCalled();
    expect(get().step).toBe("form");
  });

  // 136 Send posts the request, then waits on the phone's person with the code, polling every 1.5 s
  it("posts the request, shows the waiting state and polls until the phone says sent", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    expect(fake.send).toHaveBeenCalledWith("M", { texts: offer.texts, category: "hiking", coverage: { countries: ["SK"] },
      replaces: true });
    expect(get().step).toBe("waiting");
    expect(get().started?.code).toBe("7QK2");
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    expect(fake.answer).toHaveBeenCalledWith("M", "A1");
    expect(get().step).toBe("waiting");
    fake.answer.mockResolvedValue(said("sent", { submission: "Submission-7" }));
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    expect(get().step).toBe("sent");
    expect(get().submission).toBe("Submission-7");
    const calls = fake.answer.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY * 3);
    expect(fake.answer.mock.calls.length).toBe(calls);
  });

  // 136 with no preview on the phone the map as drawn is posted first
  it("posts the preview first when the phone has none", async () => {
    fake.offer.mockResolvedValue(ok({ ...offer, hasPreview: false }));
    fake.setPicture.mockImplementation(async () => { fake.order.push("preview"); return ok({ id: "M", name: "High Tatras" }); });
    fake.send.mockImplementation(async () => { fake.order.push("send"); return ok({ ask: "A1", code: "7QK2", expiresIn: 300 }); });
    setMapControl({ snapshot: async () => new Blob(["jpeg"]) } as unknown as MapControl);
    await loadPublish("M");
    fill();
    await sendPublish();
    expect(fake.order).toEqual(["preview", "send"]);
    expect(fake.setPicture.mock.calls[0]![1]).toBe("preview");
  });

  // 136 the phone's person said no: the card is back with the phone's words, what was written kept
  it("returns to the card with the phone's words when its person does not confirm", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    fake.answer.mockResolvedValue(said("refused", { refusal: "notConfirmed", message: "The phone's person did not publish it" }));
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    expect(get().step).toBe("form");
    expect(get().said).toBe("The phone's person did not publish it");
    expect(get().form?.category).toBe("hiking");
  });

  // 136 a failure in sending shows the phone's message until Done
  it("shows a failure's message and returns to the card on Done", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    fake.answer.mockResolvedValue(said("failed", { message: "iCloud is full" }));
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    expect(get().step).toBe("failed");
    expect(get().said).toBe("iCloud is full");
    donePublish();
    expect(get().step).toBe("form");
    expect(get().said).toBeNull();
    expect(get().form?.category).toBe("hiking");
  });

  // 136 the phone forgot the ask: 410 says it ran out
  it("says the ask ran out when the phone answers 410", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    fake.answer.mockResolvedValue({ ok: false, status: 410, said: "The phone no longer holds this ask; ask again" });
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    expect(get().step).toBe("form");
    expect(get().said).toBe("The phone was not answered in time; ask again");
  });

  // 136 a refusal of the POST is shown in the page's words where it has them, else the phone's
  it("shows a refused request in the page's words, or the phone's", async () => {
    await loadPublish("M");
    fill();
    fake.send.mockResolvedValue({ ok: false, status: 409, said: JSON.stringify({ refusal: "notSignedIn", message: "Not signed in" }) });
    await sendPublish();
    expect(get().said).toBe("Not signed in to iCloud. Sign in in the Settings app.");
    fake.send.mockResolvedValue({ ok: false, status: 429, said: JSON.stringify({ refusal: "busy", message: "Too many publications wait on the phone" }) });
    await sendPublish();
    expect(get().step).toBe("form");
    expect(get().said).toBe("Too many publications wait on the phone");
  });

  // 136 Cancel takes the ask back from the phone and stops the polling
  it("cancels the ask on the phone and stops asking", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    await cancelPublish();
    expect(fake.cancel).toHaveBeenCalledWith("M", "A1");
    expect(get().step).toBe("form");
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY * 3);
    expect(fake.answer).not.toHaveBeenCalled();
  });

  // 136 Done after Sent opens the card afresh from the phone
  it("starts a new card after Sent", async () => {
    await loadPublish("M");
    fill();
    await sendPublish();
    fake.answer.mockResolvedValue(said("sent", { submission: "S" }));
    await vi.advanceTimersByTimeAsync(PUBLISH_EVERY);
    fake.offer.mockResolvedValue(ok({ ...offer, isUpdate: true }));
    donePublish();
    await vi.advanceTimersByTimeAsync(0);
    expect(get().step).toBe("form");
    expect(get().offer?.isUpdate).toBe(true);
    expect(get().form?.category).toBeNull();
  });
});
