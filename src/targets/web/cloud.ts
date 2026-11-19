import { readConfig, type SiteConfig } from "./config";

/**
 * What CloudKit JS answers when a server error is one item of a list: a `CKError`. An unknown server code is
 * `ckErrorCode: "UNKNOWN_ERROR"` with the server's own in `serverErrorCode`.
 */
export interface CKError {
  ckErrorCode?: string;
  serverErrorCode?: string;
  reason?: string;
  recordName?: string;
  zoneID?: ZoneID;
}

/** The part of CloudKit JS the site uses. */
export interface CKRecordList {
  zones?: { zoneID: ZoneID; records?: CKRecord[]; syncToken?: string; moreComing?: boolean }[];
  /** A zone that failed (`ZONE_NOT_FOUND`, an expired token) is here, not in `zones`. */
  errors?: CKError[];
  hasErrors?: boolean;
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

/**
 * What a batch commit answers: `records` holds only the clean ones, each failure is in `errors`; an atomic batch
 * that failed has the cause (`CONFLICT`, `EXISTS`) and `ATOMIC_ERROR` for each record that was only collateral.
 */
export interface CKBatchResult {
  records?: CKRecord[];
  errors?: CKError[];
  hasErrors?: boolean;
}

/** One zone's changes: the options `fetchRecordZoneChanges` takes, an array of them for several zones. */
export interface CKZoneChanges {
  zoneID: ZoneID;
  syncToken?: string;
  desiredKeys?: string[];
  resultsLimit?: number;
}

/** `Database.newRecordsBatch`: saves and deletes in one request, deletes checking their change tag. */
export interface CKBatch {
  create(record: CKSave): CKBatch;
  update(record: CKSave): CKBatch;
  delete(record: { recordName: string; recordChangeTag?: string }): CKBatch;
  commit(): Promise<CKBatchResult>;
}

/** What reading a zone takes. */
export interface CKReading {
  fetchRecordZoneChanges(options: CKZoneChanges | CKZoneChanges[]): Promise<CKRecordList>;
  fetchAllRecordZones(): Promise<{ zones?: { zoneID: ZoneID }[] }>;
}

export interface CKSubscription {
  subscriptionID: string;
  subscriptionType: "database";
}

export interface CKDatabase extends CKReading {
  newRecordsBatch(options: { zoneID: ZoneID; atomic: boolean }): CKBatch;
  saveSubscriptions(subscriptions: CKSubscription | CKSubscription[]): Promise<{ errors?: CKError[]; hasErrors?: boolean }>;
  fetchDatabaseChanges(options?: { syncToken?: string }): Promise<{ zones?: unknown[]; syncToken?: string; moreComing?: boolean }>;
}

/** `users/caller` answers the record name only; a discovered user has the name too, if discoverable. */
export interface CKIdentity {
  userRecordName?: string;
  nameComponents?: { givenName?: string; familyName?: string };
}

export interface CKContainer {
  setUpAuth(): Promise<CKIdentity | false | null>;
  whenUserSignsIn(): Promise<CKIdentity>;
  whenUserSignsOut(): Promise<unknown>;
  /** A person is found by record name; the answer holds `users`, one name if the person may be discovered. */
  discoverUserIdentityWithUserRecordName?(name: string): Promise<{ users?: CKIdentity[] }>;
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

const nameOf = (identity: CKIdentity | undefined): string => {
  const { givenName = "", familyName = "" } = identity?.nameComponents ?? {};
  return `${givenName} ${familyName}`.trim();
};

/** A subscription is saved once per database; the server says it exists when it already does. */
const SUBSCRIPTIONS = { private: "riki-site-private", shared: "riki-site-shared" } as const;

/** How often the databases are asked what changed where no subscription could be saved. */
export const POLL_EVERY = 30_000;

/** CloudKit JS configured once; who is signed in, and what changed elsewhere. */
export class Cloud {
  private container: Promise<CKContainer> | null = null;
  private configured: CKContainer | null = null;
  private holder: HTMLElement | null = null;
  private person: Person | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly targets: Partial<Record<"in" | "out", HTMLElement>> = {};
  private readonly slots: Partial<Record<"in" | "out", Element>> = {};
  private listening = false;
  private polling: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly load: () => Promise<CloudKitJS> = loadScript,
    private readonly config: () => Promise<SiteConfig> = readConfig) {}

  /** The container set up once; a set-up that failed is tried again by the next call. */
  private ready(): Promise<CKContainer> {
    if (!this.container) {
      this.container = this.setUp();
      this.container.catch(() => { this.container = null; });
    }
    return this.container;
  }

  /** Configures and sets up sign-in; the person, or null while signed out. */
  async start(): Promise<Person | null> {
    await this.ready();
    return this.person;
  }

  async databases(): Promise<{ container: CKContainer; ownedBy: Person | null }> {
    return { container: await this.ready(), ownedBy: this.person };
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

  private makeButtons() {
    // CloudKit JS finds its buttons by id in the page, so they wait here until a screen asks for them.
    if (this.holder) return;
    const holder = document.createElement("div");
    holder.hidden = true;
    for (const [button, id] of [["in", SIGN_IN_ID], ["out", SIGN_OUT_ID]] as const) {
      const slot = document.createElement("div");
      slot.id = id;
      this.slots[button] = slot;
      holder.append(slot);
    }
    document.body.append(holder);
    this.holder = holder;
    this.place("in");
    this.place("out");
  }

  private async setUp(): Promise<CKContainer> {
    const [config, cloudkit] = await Promise.all([this.config(), this.load()]);
    this.makeButtons();
    if (!this.configured) {
      cloudkit.configure({
        containers: [{
          containerIdentifier: config.container,
          apiTokenAuth: { apiToken: config.apiToken, persist: true,
            signInButton: { id: SIGN_IN_ID, theme: "black" }, signOutButton: { id: SIGN_OUT_ID, theme: "black" } },
          environment: config.environment,
          // The library's own default is development, whatever the environment.
          apnsEnvironment: config.environment
        }]
      });
      this.configured = cloudkit.getDefaultContainer();
    }
    const container = this.configured;
    const known = await container.setUpAuth();
    if (known) await this.signedIn(container, known, false);
    else this.waitForSignIn(container);
    return container;
  }

  /** The caller's identity names no one: the name is looked up, and left empty for someone not discoverable. */
  private async named(container: CKContainer, identity: CKIdentity): Promise<string> {
    if (!identity.userRecordName || !container.discoverUserIdentityWithUserRecordName) return "";
    try {
      return nameOf((await container.discoverUserIdentityWithUserRecordName(identity.userRecordName)).users?.[0]);
    } catch {
      return "";
    }
  }

  private async signedIn(container: CKContainer, identity: CKIdentity, announce = true) {
    this.person = { name: await this.named(container, identity) };
    if (!this.listening) {
      this.listening = true;
      void container.registerForNotifications().then(async () => {
        container.addNotificationListener(() => this.tell());
        await this.subscribe(container);
      }, () => { this.listening = false; });
    }
    void container.whenUserSignsOut().then(() => {
      this.person = null;
      this.stopPolling();
      this.waitForSignIn(container);
      this.tell();
    });
    if (announce) this.tell();
  }

  /**
   * A notification only comes for a subscription, so each database gets one that fires on any change in it, as
   * the app's own mirror has. Where one cannot be saved, the databases are asked for changes instead.
   */
  private async subscribe(container: CKContainer) {
    try {
      const saved = await Promise.all((["private", "shared"] as const).map((scope) =>
        (scope === "private" ? container.privateCloudDatabase : container.sharedCloudDatabase)
          .saveSubscriptions({ subscriptionID: SUBSCRIPTIONS[scope], subscriptionType: "database" })));
      const failed = saved.flatMap((each) => each.errors ?? []).filter((each) => each.ckErrorCode !== "EXISTS");
      if (failed.length > 0) throw new Error(failed[0]!.reason ?? failed[0]!.ckErrorCode);
    } catch {
      this.poll(container);
    }
  }

  private poll(container: CKContainer) {
    if (this.polling) return;
    const tokens: Partial<Record<"private" | "shared", string>> = {};
    const ask = async (first: boolean) => {
      let changed = false;
      for (const scope of ["private", "shared"] as const) {
        const db = scope === "private" ? container.privateCloudDatabase : container.sharedCloudDatabase;
        try {
          const answer = await db.fetchDatabaseChanges({ syncToken: tokens[scope] });
          tokens[scope] = answer.syncToken ?? tokens[scope];
          if (!first && (answer.zones?.length ?? 0) > 0) changed = true;
        } catch { /* asked again next time */ }
      }
      if (changed) this.tell();
    };
    void ask(true);
    this.polling = setInterval(() => void ask(false), POLL_EVERY);
  }

  private stopPolling() {
    if (this.polling) clearInterval(this.polling);
    this.polling = null;
  }

  /** A sign-in window closed or failed rejects the promise, and the library makes a new one. */
  private waitForSignIn(container: CKContainer) {
    container.whenUserSignsIn().then((identity) => this.signedIn(container, identity),
      () => this.waitForSignIn(container));
  }
}
