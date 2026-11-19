import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangedElsewhere } from "@/backend/types";
import { applySession, change, resetViewer, startSession, useViewer } from "./viewer";

const fake = vi.hoisted(() => ({
  listener: null as null | ((changed?: ChangedElsewhere[]) => void),
  map: vi.fn(),
  change: vi.fn(),
  session: vi.fn(async () => ({ ok: true, value: { standing: "admitted" } })),
  maps: vi.fn(async () => ({ name: "iCloud", maps: [] }))
}));
vi.mock("@backend", async (original) => {
  const phone = await original<typeof import("@/targets/phone/backend")>();
  return { backend: { ...phone.backend, session: fake.session, maps: fake.maps, map: fake.map, change: fake.change,
    useToken: () => {}, onChanged: (listener: (changed?: ChangedElsewhere[]) => void) => { fake.listener = listener; return () => {}; } } };
});

const get = useViewer.getState;
const told = async (changed?: ChangedElsewhere[]) => {
  fake.listener!(changed);
  await vi.waitFor(() => expect(fake.session).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve));
};

describe("a map changed elsewhere", () => {
  beforeEach(() => {
    resetViewer();
    vi.clearAllMocks();
    fake.map.mockResolvedValue({ id: "M", name: "Doprava 2" });
    startSession(false);
    useViewer.setState({ standing: "admitted", mapID: "M", portable: { id: "M", name: "Doprava" } });
  });

  // 78 the notice names the map and, when the history says, who changed it
  it("says who changed it when the history names the author", async () => {
    await told([{ mapID: "M", name: "Doprava", author: "Friki" }]);
    expect(get().notice).toBe("Doprava was changed by Friki");
  });

  it("says another device changed it when no author is named", async () => {
    await told([{ mapID: "N", name: "Doprava", author: null }]);
    expect(get().notice).toBe("Doprava was changed on another device");
  });

  it("says nothing when no map changed, and the phone's beat tells nothing either", async () => {
    await told([]);
    await told();
    expect(get().notice).toBeNull();
  });

  // 78 the open Edit map tab's fields are put back from the new rows
  it("reads the shown map again and moves editEpoch when its Edit map tab is open", async () => {
    useViewer.setState({ editing: true, editEpoch: 4 });
    await told([{ mapID: "M", name: "Doprava", author: null }]);
    await vi.waitFor(() => expect(get().editEpoch).toBe(5));
    expect(get().portable?.name).toBe("Doprava 2");
  });

  it("reads the shown map again but leaves editEpoch while the tab is closed", async () => {
    await told([{ mapID: "M", name: "Doprava", author: null }]);
    await vi.waitFor(() => expect(get().portable?.name).toBe("Doprava 2"));
    expect(get().editEpoch).toBe(0);
  });

  it("leaves the shown map alone when another map changed", async () => {
    useViewer.setState({ editing: true });
    await told([{ mapID: "N", name: "Roads", author: "Friki" }]);
    expect(fake.map).not.toHaveBeenCalled();
    expect(get().editEpoch).toBe(0);
  });
});

describe("the site's editing", () => {
  beforeEach(() => {
    resetViewer();
    vi.clearAllMocks();
  });

  // 78 signed in to iCloud is the permission: the session's token opens the editing screens
  it("takes the token the site's session carries, and drops it when editing is off", () => {
    applySession({ standing: "admitted", edits: true, token: "icloud" });
    expect(get().editToken).toBe("icloud");
    applySession({ standing: "admitted", edits: false });
    expect(get().editToken).toBeNull();
  });

  it("shows the map-changed-elsewhere words when the retries are used up, and puts the fields back", async () => {
    useViewer.setState({ editToken: "icloud", mapID: "M" });
    fake.change.mockResolvedValue({ ok: false, status: 412, said: "English fallback" });
    expect(await change({ kind: "name", name: "x" })).toBe(false);
    expect(get().notice).toBe("The map changed elsewhere. Open it again and repeat the change.");
    expect(get().editEpoch).toBe(1);
  });
});
