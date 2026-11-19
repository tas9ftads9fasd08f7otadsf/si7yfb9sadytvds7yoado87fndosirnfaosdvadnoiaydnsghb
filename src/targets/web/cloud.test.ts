import { describe, expect, it, vi } from "vitest";
import { Cloud, SIGN_IN_ID, SIGN_OUT_ID, type CKContainer, type CKIdentity, type CloudKitJS } from "./cloud";
import type { SiteConfig } from "./config";

// 76 CloudKit JS configured once; sign-in, sign-out and notifications turn into onChanged
const config: SiteConfig = { container: "iCloud.x", apiToken: "T", environment: "development", tilesBase: "" };

function kit(known: CKIdentity | false = false) {
  let signIn: (identity: CKIdentity) => void = () => {};
  let signOut: () => void = () => {};
  let notify: (n: unknown) => void = () => {};
  const container = {
    setUpAuth: vi.fn(async () => known),
    whenUserSignsIn: () => new Promise<CKIdentity>((resolve) => { signIn = resolve; }),
    whenUserSignsOut: () => new Promise<unknown>((resolve) => { signOut = () => resolve(null); }),
    registerForNotifications: vi.fn(async () => {}),
    addNotificationListener: (listener: (n: unknown) => void) => { notify = listener; }
  } as unknown as CKContainer;
  const cloudkit: CloudKitJS = { configure: vi.fn(), getDefaultContainer: () => container };
  return { cloudkit, container, signIn: (identity: CKIdentity) => signIn(identity), signOut: () => signOut(),
    notify: () => notify({}) };
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
        signOutButton: { id: SIGN_OUT_ID, theme: "black" } }, environment: "development" }] });
    expect(document.getElementById(SIGN_IN_ID)).not.toBeNull();
  });

  it("names the person already signed in", async () => {
    const stub = kit({ nameComponents: { givenName: "Riki", familyName: "Tester" } });
    expect(await new Cloud(async () => stub.cloudkit, async () => config).start()).toEqual({ name: "Riki Tester" });
  });

  it("tells a listener when the person signs in, out, and when a notification arrives", async () => {
    const stub = kit();
    const cloud = new Cloud(async () => stub.cloudkit, async () => config);
    const told = vi.fn();
    cloud.onChanged(told);
    await cloud.start();
    stub.signIn({ nameComponents: { givenName: "Rita" } });
    await flush();
    expect(await cloud.start()).toEqual({ name: "Rita" });
    expect(told).toHaveBeenCalledTimes(1);
    stub.notify();
    expect(told).toHaveBeenCalledTimes(2);
    stub.signOut();
    await flush();
    expect(await cloud.start()).toBeNull();
    expect(told).toHaveBeenCalledTimes(3);
  });

  it("stops telling a listener that was removed", async () => {
    const stub = kit({ nameComponents: {} });
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

  it("fails when CloudKit JS cannot be loaded", async () => {
    const cloud = new Cloud(async () => { throw new Error("blocked"); }, async () => config);
    await expect(cloud.start()).rejects.toThrow("blocked");
  });
});
