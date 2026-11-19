import { readConfig, type SiteConfig } from "./config";

/** The part of CloudKit JS the site uses. */
export interface CKRecordList {
  zones?: { zoneID: ZoneID; records?: CKRecord[]; syncToken?: string; moreComing?: boolean }[];
}

export interface ZoneID {
  zoneName: string;
  ownerRecordName?: string;
}

export interface CKField {
  value: unknown;
  type?: string;
}

export interface CKRecord {
  recordName: string;
  recordType?: string;
  recordChangeTag?: string;
  fields?: Record<string, CKField>;
  deleted?: boolean;
  zoneID?: ZoneID;
}

/** A record to save: with a `recordChangeTag` it updates, without one it creates. */
export interface CKSave {
  recordName: string;
  recordType: string;
  recordChangeTag?: string;
  fields: Record<string, { value: unknown; type?: string }>;
}

/** Each record as the server answered it; one refused carries `serverErrorCode`. */
export interface CKSaved {
  records?: (Partial<CKRecord> & { serverErrorCode?: string; reason?: string })[];
}

/** What reading a zone takes. */
export interface CKReading {
  fetchRecordZoneChanges(options: { zones: { zoneID: ZoneID; syncToken?: string }[] }): Promise<CKRecordList>;
  fetchAllRecordZones(): Promise<{ zones?: { zoneID: ZoneID }[] }>;
}

export interface CKDatabase extends CKReading {
  saveRecords(records: CKSave[], options: { zoneID: ZoneID; atomic: boolean }): Promise<CKSaved>;
  deleteRecords(records: { recordName: string; recordChangeTag?: string }[],
    options: { zoneID: ZoneID; atomic: boolean }): Promise<CKSaved>;
}

export interface CKIdentity {
  userRecordName?: string;
  nameComponents?: { givenName?: string; familyName?: string };
}

export interface CKContainer {
  setUpAuth(): Promise<CKIdentity | false | null>;
  whenUserSignsIn(): Promise<CKIdentity>;
  whenUserSignsOut(): Promise<unknown>;
  registerForNotifications(): Promise<unknown>;
  addNotificationListener(listener: (notification: unknown) => void): void;
  privateCloudDatabase: CKDatabase;
  sharedCloudDatabase: CKDatabase;
}

export interface CloudKitJS {
  configure(options: unknown): void;
  getDefaultContainer(): CKContainer;
}

declare global {
  interface Window {
    CloudKit?: CloudKitJS;
  }
}

export const CLOUDKIT_SRC = "https://cdn.apple-cloudkit.com/ck/2/cloudkit.js";
export const SIGN_IN_ID = "apple-sign-in-button";
export const SIGN_OUT_ID = "apple-sign-out-button";

/** Loads CloudKit JS as a script tag, once per page. */
export function loadScript(src = CLOUDKIT_SRC): Promise<CloudKitJS> {
  if (window.CloudKit) return Promise.resolve(window.CloudKit);
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    tag.onload = () => (window.CloudKit ? resolve(window.CloudKit) : reject(new Error("CloudKit JS did not start")));
    tag.onerror = () => reject(new Error("CloudKit JS could not be loaded"));
    document.head.append(tag);
  });
}

export interface Person {
  name: string;
}

const nameOf = (identity: CKIdentity): string => {
  const { givenName = "", familyName = "" } = identity.nameComponents ?? {};
  return `${givenName} ${familyName}`.trim();
};

/** CloudKit JS configured once; who is signed in, and what changed elsewhere. */
export class Cloud {
  private container: Promise<CKContainer> | null = null;
  private person: Person | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly targets: Partial<Record<"in" | "out", HTMLElement>> = {};
  private readonly slots: Partial<Record<"in" | "out", Element>> = {};
  private listening = false;

  constructor(private readonly load: () => Promise<CloudKitJS> = loadScript,
    private readonly config: () => Promise<SiteConfig> = readConfig) {}

  /** Configures and sets up sign-in; the person, or null while signed out. */
  async start(): Promise<Person | null> {
    this.container ??= this.setUp();
    await this.container;
    return this.person;
  }

  async databases(): Promise<{ container: CKContainer; ownedBy: Person | null }> {
    return { container: await (this.container ??= this.setUp()), ownedBy: this.person };
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Puts CloudKit's own button into the element; its sign-in answers by postMessage. */
  mount(button: "in" | "out", into: HTMLElement) {
    this.targets[button] = into;
    this.place(button);
  }

  private place(button: "in" | "out") {
    const [held, into] = [this.slots[button], this.targets[button]];
    if (held && into) into.replaceChildren(held);
  }

  private tell() {
    for (const listener of this.listeners) listener();
  }

  private async setUp(): Promise<CKContainer> {
    const [config, cloudkit] = await Promise.all([this.config(), this.load()]);
    // CloudKit JS finds its buttons by id in the page, so they wait here until a screen asks for them.
    const holder = document.createElement("div");
    holder.hidden = true;
    for (const [button, id] of [["in", SIGN_IN_ID], ["out", SIGN_OUT_ID]] as const) {
      const slot = document.createElement("div");
      slot.id = id;
      this.slots[button] = slot;
      holder.append(slot);
    }
    document.body.append(holder);
    this.place("in");
    this.place("out");
    cloudkit.configure({
      containers: [{
        containerIdentifier: config.container,
        apiTokenAuth: { apiToken: config.apiToken, persist: true,
          signInButton: { id: SIGN_IN_ID, theme: "black" }, signOutButton: { id: SIGN_OUT_ID, theme: "black" } },
        environment: config.environment
      }]
    });
    const container = cloudkit.getDefaultContainer();
    const known = await container.setUpAuth();
    if (known) this.signedIn(container, known, false);
    else this.waitForSignIn(container);
    return container;
  }

  private signedIn(container: CKContainer, identity: CKIdentity, announce = true) {
    this.person = { name: nameOf(identity) };
    if (!this.listening) {
      this.listening = true;
      void container.registerForNotifications().then(() => {
        container.addNotificationListener(() => this.tell());
      }, () => { this.listening = false; });
    }
    void container.whenUserSignsOut().then(() => {
      this.person = null;
      this.waitForSignIn(container);
      this.tell();
    });
    if (announce) this.tell();
  }

  private waitForSignIn(container: CKContainer) {
    void container.whenUserSignsIn().then((identity) => this.signedIn(container, identity));
  }
}
