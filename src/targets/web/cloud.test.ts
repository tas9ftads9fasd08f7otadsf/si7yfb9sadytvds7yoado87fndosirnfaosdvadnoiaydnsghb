import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOSED_GRACE, Cloud, POLL_EVERY, refusesToken, SIGN_IN_ID, SIGN_IN_WAIT, SIGN_OUT_ID, type CKContainer, type CKIdentity, type CloudKitJS } from "./cloud";
import type { SiteConfig } from "./config";

// 76 CloudKit JS configured once; sign-in, sign-out and notifications turn into onChanged
const config: SiteConfig = { container: "iCloud.x", apiToken: "T", environment: "development", regionsCatalog: "" };

// 87 the stand-in kit answers as cloudkit.js 2.6.4 does: the caller is a record name, a name is discovered
const people: Record<string, CKIdentity> = {
  _me: { userRecordName: "_me", nameComponents: { givenName: "Riki", familyName: "Tester" } },
  rita: { userRecordName: "rita", nameComponents: { givenName: "Rita" } }
};

function kit(known: CKIdentity | false = false, options: { saving?: () => Promise<unknown> } = {}) {
  let signIn = defer<CKIdentity>();
  let signOut: () => void = () => {};
  let notify: (n: unknown) => void = () => {};
  const saved: { subscriptionID: string; subscriptionType: string }[] = [];
  const database = { saveSubscriptions: vi.fn(async (each: { subscriptionID: string; subscriptionType: string }) => {
    saved.push(each);
    return (await options.saving?.()) ?? {};
  }), fetchDatabaseChanges: vi.fn(async () => ({ zones: [], syncToken: "t" })) };
  const container = {
    setUpAuth: vi.fn(async () => known),
    whenUserSignsIn: vi.fn(() => signIn.promise),
    whenUserSignsOut: () => new Promise<unknown>((resolve) => { signOut = () => resolve(null); }),
    discoverUserIdentityWithUserRecordName: vi.fn(async (name: string) => ({ users: people[name] ? [people[name]] : [] })),
    registerForNotifications: vi.fn(async () => {}),
    addNotificationListener: (listener: (n: unknown) => void) => { notify = listener; },
    privateCloudDatabase: database, sharedCloudDatabase: database
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: vi.fn(), getDefaultContainer: () => container };
  return { cloudkit, container, database, saved,
    signIn: (identity: CKIdentity) => { const done = signIn; signIn = defer(); done.resolve(identity); },
    failSignIn: () => { const failed = signIn; signIn = defer(); failed.reject(new Error("Error in sign in popup")); },
    signOut: () => signOut(), notify: () => notify({}) };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe("Cloud", () => {
  it("configures once with the token, the environment and both buttons, and reports signed out", async () => {
    const stub = kit();
    const load = vi.fn(async () => stub.cloudkit);
    const cloud = new Cloud(load, async () => config);
    expect(await cloud.start()).toBeNull();
    await cloud.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(stub.cloudkit.configure).toHaveBeenCalledTimes(1);
    expect(stub.cloudkit.configure).toHaveBeenCalledWith({ containers: [{ containerIdentifier: "iCloud.x",
      apiTokenAuth: { apiToken: "T", persist: true, signInButton: { id: SIGN_IN_ID, theme: "black" },
        signOutButton: { id: SIGN_OUT_ID, theme: "black" } }, environment: "development", apnsEnvironment: "development" }] });
    expect(document.getElementById(SIGN_IN_ID)).not.toBeNull();
  });

  // 87 bug: the site read nameComponents off users/caller, which answers the record name only;
  // 177 the record name stays, for the sealed keys
  it("names the person already signed in by discovering them, as the caller carries no name", async () => {
    const stub = kit({ userRecordName: "_me" });
    expect(await new Cloud(async () => stub.cloudkit, async () => config).start()).toEqual({ name: "Riki Tester", recordName: "_me" });
    expect(stub.container.discoverUserIdentityWithUserRecordName).toHaveBeenCalledWith("_me");
  });

  it("has no name for a person who cannot be discovered, so the typed one is used", async () => {
    const stub = kit({ userRecordName: "hidden" });
    expect(await new Cloud(async () => stub.cloudkit, async () => config).start()).toEqual({ name: "", recordName: "hidden" });
    const nameless = kit({ userRecordName: "_me" });
    (nameless.container as { discoverUserIdentityWithUserRecordName?: unknown }).discoverUserIdentityWithUserRecordName = async () => { throw new Error("no"); };
    expect(await new Cloud(async () => nameless.cloudkit, async () => config).start()).toEqual({ name: "", recordName: "_me" });
  });

  // 87 bug: the library's apnsEnvironment defaults to development, whatever the container's environment
  it("sets the push environment to the container's", async () => {
    const stub = kit();
    await new Cloud(async () => stub.cloudkit, async () => ({ ...config, environment: "production" })).start();
    expect(vi.mocked(stub.cloudkit.configure).mock.calls[0]![0]).toMatchObject({ containers: [{ environment: "production", apnsEnvironment: "production" }] });
  });

  it("tells a listener when the person signs in, out, and when a notification arrives", async () => {
    const stub = kit();
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    const told = vi.fn();
    cloud.onChanged(told);
    await cloud.start();
    stub.signIn({ userRecordName: "rita" });
    await flush();
    expect(await cloud.start()).toEqual({ name: "Rita", recordName: "rita" });
    expect(told).toHaveBeenCalledTimes(1);
    stub.notify();
    expect(told).toHaveBeenCalledTimes(2);
    stub.signOut();
    await flush();
    expect(await cloud.start()).toBeNull();
    expect(told).toHaveBeenCalledTimes(3);
  });

  it("stops telling a listener that was removed", async () => {
    const stub = kit({ userRecordName: "_me" });
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    const told = vi.fn();
    cloud.onChanged(told)();
    await cloud.start();
    await flush();
    stub.notify();
    expect(told).not.toHaveBeenCalled();
  });

  it("moves CloudKit's own button into the element asked", async () => {
    const stub = kit();
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    await cloud.start();
    const into = document.createElement("div");
    cloud.mount("in", into);
    expect(into.querySelector(`#${SIGN_IN_ID}`)).not.toBeNull();
  });

  // 76 the top bar asks for its button before CloudKit JS has loaded
  it("puts the button in an element that asked before CloudKit JS was ready", async () => {
    const stub = kit();
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    const into = document.createElement("div");
    cloud.mount("out", into);
    expect(into.querySelector(`#${SIGN_OUT_ID}`)).toBeNull();
    await cloud.start();
    expect(into.querySelector(`#${SIGN_OUT_ID}`)).not.toBeNull();
  });

  // 87 bug: a closed sign-in window rejects whenUserSignsIn and the library makes a new promise; the site stopped waiting
  it("waits for the next sign-in after a sign-in window failed", async () => {
    const stub = kit();
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    await cloud.start();
    stub.failSignIn();
    await flush();
    expect(stub.container.whenUserSignsIn).toHaveBeenCalledTimes(2);
    stub.signIn({ userRecordName: "rita" });
    await flush();
    expect(await cloud.start()).toEqual({ name: "Rita", recordName: "rita" });
  });

  // 87 bug: a set-up that failed was cached for good
  it("sets up again after a set-up failed for a reason that is not signing in", async () => {
    const stub = kit({ userRecordName: "_me" });
    vi.mocked(stub.container.setUpAuth).mockRejectedValueOnce(new Error("network"));
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    await expect(cloud.start()).rejects.toThrow("network");
    const slots = document.querySelectorAll(`#${SIGN_IN_ID}`).length;
    expect(await cloud.start()).toEqual({ name: "Riki Tester", recordName: "_me" });
    expect(stub.cloudkit.configure).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(`#${SIGN_IN_ID}`)).toHaveLength(slots);
  });

  // 134 bug: a refused token was asked again and again, and the page said only that it reconnects
  it("keeps a token Apple refused refused, without asking again", async () => {
    const stub = kit({ userRecordName: "_me" });
    const refused = { ckErrorCode: "AUTHENTICATION_FAILED", reason: "check the API Token" };
    vi.mocked(stub.container.setUpAuth).mockRejectedValueOnce(refused);
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    await expect(cloud.start()).rejects.toBe(refused);
    await expect(cloud.start()).rejects.toBe(refused);
    expect(stub.container.setUpAuth).toHaveBeenCalledTimes(1);
  });

  // 134 CloudKit JS names the refusal in its code, or in the server's own
  it("knows a refused token by either code, and nothing else as one", () => {
    expect(refusesToken({ ckErrorCode: "AUTHENTICATION_FAILED" })).toBe(true);
    expect(refusesToken({ ckErrorCode: "UNKNOWN_ERROR", serverErrorCode: "AUTHENTICATION_FAILED" })).toBe(true);
    expect(refusesToken(new Error("AUTHENTICATION_FAILED"))).toBe(true);
    expect(refusesToken({ ckErrorCode: "AUTHENTICATION_REQUIRED" })).toBe(false);
    expect(refusesToken(new Error("network"))).toBe(false);
    expect(refusesToken(null)).toBe(false);
  });

  // 87 bug: nothing saved a subscription, so Apple sent no notification at all
  it("saves a database subscription for the private and the shared database once signed in", async () => {
    const stub = kit({ userRecordName: "_me" });
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    await cloud.start();
    await flush();
    expect(stub.saved.map((each) => each.subscriptionType)).toEqual(["database", "database"]);
    expect(new Set(stub.saved.map((each) => each.subscriptionID))).toEqual(new Set(["riki-site-private", "riki-site-shared"]));
  });

  describe("without a subscription", () => {
    afterEach(() => vi.useRealTimers());

    it("takes a subscription that exists already for saved, and does not poll", async () => {
      vi.useFakeTimers();
      const stub = kit({ userRecordName: "_me" }, { saving: async () => ({ hasErrors: true, errors: [{ ckErrorCode: "EXISTS" }] }) });
      await new Cloud(async () => stub.cloudkit, async () => config).start();
      await vi.advanceTimersByTimeAsync(POLL_EVERY * 2);
      expect(stub.database.fetchDatabaseChanges).not.toHaveBeenCalled();
    });

    it("asks the databases what changed instead, and tells when a zone did", async () => {
      vi.useFakeTimers();
      const stub = kit({ userRecordName: "_me" }, { saving: async () => { throw new Error("subscriptions are not on"); } });
      const cloud = new Cloud(async () => stub.cloudkit, async () => config);
      const told = vi.fn();
      cloud.onChanged(told);
      await cloud.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(stub.database.fetchDatabaseChanges).toHaveBeenCalled();
      // the first answer only learns the token
      expect(told).not.toHaveBeenCalled();
      stub.database.fetchDatabaseChanges.mockResolvedValue({ zones: [{}], syncToken: "u" } as never);
      await vi.advanceTimersByTimeAsync(POLL_EVERY);
      expect(told).toHaveBeenCalled();
      expect(stub.database.fetchDatabaseChanges).toHaveBeenLastCalledWith({ syncToken: "t" });
    });
  });

  // 116 a database subscription has no zone, so a share zone made later is covered; the fallback asks the same way
  it("subscribes to the private database as a whole, not to a zone", async () => {
    const stub = kit({ userRecordName: "_me" });
    await new Cloud(async () => stub.cloudkit, async () => config).start();
    await flush();
    expect(stub.saved.find((each) => each.subscriptionID === "riki-site-private")).toEqual({
      subscriptionID: "riki-site-private", subscriptionType: "database" });
  });

  // 116 the zone of a map the person has just shared is new to the private database, and its rows are news
  it("tells when the private database answers with a zone it did not have", async () => {
    vi.useFakeTimers();
    try {
      const stub = kit({ userRecordName: "_me" }, { saving: async () => { throw new Error("subscriptions are not on"); } });
      const own = { fetchDatabaseChanges: vi.fn(async () => ({ zones: [] as unknown[], syncToken: "p1" })) };
      (stub.container as unknown as { privateCloudDatabase: unknown }).privateCloudDatabase = { ...stub.database, ...own };
      const cloud = new Cloud(async () => stub.cloudkit, async () => config);
      const told = vi.fn();
      cloud.onChanged(told);
      await cloud.start();
      await vi.advanceTimersByTimeAsync(0);
      own.fetchDatabaseChanges.mockResolvedValue({ zones: [{ zoneID: { zoneName: "com.apple.coredata.cloudkit.share.X" } }], syncToken: "p2" });
      await vi.advanceTimersByTimeAsync(POLL_EVERY);
      expect(told).toHaveBeenCalledTimes(1);
      expect(own.fetchDatabaseChanges).toHaveBeenLastCalledWith({ syncToken: "p1" });
    } finally {
      vi.useRealTimers();
    }
  });

  // 185 bug #167: Apple's sign-in window hung, and the card waited for its answer for ever, saying nothing
  describe("a sign-in window that never answers", () => {
    afterEach(() => vi.useRealTimers());

    async function signingIn() {
      const popup = { closed: false };
      const opened = vi.fn(() => popup as unknown as Window);
      window.open = opened as unknown as typeof window.open;
      const stub = kit();
      const cloud = new Cloud(async () => stub.cloudkit, async () => config);
      const told = vi.fn();
      cloud.onChanged(told);
      await cloud.start();
      const card = document.createElement("div");
      cloud.mount("in", card);
      // CloudKit JS puts its own button in the slot and opens its window from that button's click.
      const button = document.createElement("div");
      button.addEventListener("click", () => window.open("https://idmsa.apple.com/signin", "", "width=525"));
      card.firstElementChild!.append(button);
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      return { stub, cloud, told, popup, opened, click: () => button.click() };
    }

    it("says so once the window has been closed a moment without Apple's answer", async () => {
      const { cloud, told, popup, opened, click } = await signingIn();
      click();
      expect(opened).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      popup.closed = true;
      vi.advanceTimersByTime(CLOSED_GRACE);
      expect(cloud.signInUnanswered()).toBe(false);
      vi.advanceTimersByTime(1_000);
      expect(cloud.signInUnanswered()).toBe(true);
      expect(told).toHaveBeenCalledTimes(1);
    });

    it("says so of a window still open past the wait, and a sign-in after it clears it", async () => {
      const { stub, cloud, click } = await signingIn();
      click();
      vi.advanceTimersByTime(SIGN_IN_WAIT - 1_000);
      expect(cloud.signInUnanswered()).toBe(false);
      vi.advanceTimersByTime(1_000);
      expect(cloud.signInUnanswered()).toBe(true);
      stub.signIn({ userRecordName: "rita" });
      await flush();
      expect(cloud.signInUnanswered()).toBe(false);
    });

    it("forgets what the last window said when the button opens a new one", async () => {
      const { cloud, told, popup, click } = await signingIn();
      popup.closed = true;
      click();
      vi.advanceTimersByTime(CLOSED_GRACE + 1_000);
      expect(cloud.signInUnanswered()).toBe(true);
      popup.closed = false;
      click();
      expect(cloud.signInUnanswered()).toBe(false);
      expect(told).toHaveBeenCalledTimes(2);
    });

    it("says nothing of a window that answered", async () => {
      const { stub, cloud, popup, click } = await signingIn();
      click();
      stub.signIn({ userRecordName: "rita" });
      await flush();
      popup.closed = true;
      vi.advanceTimersByTime(SIGN_IN_WAIT);
      expect(cloud.signInUnanswered()).toBe(false);
    });

    it("watches only a window its own button opened", async () => {
      const { cloud } = await signingIn();
      window.open("https://example.com/", "_blank");
      vi.advanceTimersByTime(SIGN_IN_WAIT);
      expect(cloud.signInUnanswered()).toBe(false);
    });
  });

  it("fails when CloudKit JS cannot be loaded", async () => {
    const cloud = new Cloud(async () => { throw new Error("blocked"); }, async () => config);
    await expect(cloud.start()).rejects.toThrow("blocked");
  });
});
