// A stand-in for cloudkit.js 2.6.4: the calls the site makes, with the shapes the library has, sent to
// api.apple-cloudkit.com as the real one does. Where the library has a rule, the stand-in keeps it:
//  - fetchRecordZoneChanges takes one zone's options, or an array of them, and builds `{zones}` itself;
//  - a list answer is split in the clean ones and `errors` (CKError), with `hasErrors`;
//  - records/modify is built by a batch whose zoneID and atomic are top level, and delete checks the change tag
//    where forceDelete (deleteRecords) does not;
//  - an unknown server code is ckErrorCode UNKNOWN_ERROR, the server's own in serverErrorCode;
//  - whenUserSignsIn rejects when a sign-in fails, and the library makes a new promise;
//  - users/caller answers the record name only.
(() => {
  const FLAG = "mock-cloud-signed-in";
  const KNOWN = ["ACCESS_DENIED", "ATOMIC_ERROR", "AUTHENTICATION_FAILED", "AUTHENTICATION_REQUIRED", "BAD_REQUEST", "CONFLICT",
    "EXISTS", "INTERNAL_ERROR", "NOT_FOUND", "QUOTA_EXCEEDED", "THROTTLED", "TRY_AGAIN_LATER", "UNIQUE_FIELD_ERROR",
    "VALIDATING_REFERENCE_ERROR", "ZONE_NOT_FOUND", "ZONE_BUSY"];
  const ZONE_KEYS = ["zoneID", "numbersAsStrings", "desiredKeys", "desiredRecordTypes", "resultsLimit", "syncToken", "reverse"];
  const BATCH_KEYS = ["zoneID", "desiredKeys", "numbersAsStrings", "atomic", "onAssetUploadStart"];
  const listeners = [];
  const signedIn = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
  const remember = (on) => { try { localStorage.setItem(FLAG, on ? "1" : "0"); } catch { /* signed out on reload */ } };
  let settings;
  let signIn = defer();
  let silentWindow = false;
  let signOut = defer();

  function defer() {
    const made = {};
    made.promise = new Promise((resolve, reject) => { made.resolve = resolve; made.reject = reject; });
    return made;
  }

  /** A CKError: the known server codes stay, any other is UNKNOWN_ERROR with the server's own kept. */
  class CKError extends Error {
    constructor({ serverErrorCode, reason, zoneID, recordName, ckErrorCode }) {
      super(reason ?? serverErrorCode);
      this.serverErrorCode = serverErrorCode;
      this.ckErrorCode = ckErrorCode ?? (KNOWN.includes(serverErrorCode) ? serverErrorCode : "UNKNOWN_ERROR");
      this.reason = reason ?? this.ckErrorCode;
      this.zoneID = zoneID;
      this.recordName = recordName;
    }
  }

  const pick = (from, keys) => Object.fromEntries(keys.filter((key) => from[key] !== undefined).map((key) => [key, from[key]]));
  const isError = (item) => item.serverErrorCode !== undefined && item.serverErrorCode !== null;

  async function call(database, path, body) {
    const { containerIdentifier, environment, apiTokenAuth } = settings;
    const address = `https://api.apple-cloudkit.com/database/1/${containerIdentifier}/${environment}/${database}/${path}`
      + `?ckAPIToken=${encodeURIComponent(apiTokenAuth.apiToken)}`;
    const answer = await fetch(address, { method: "POST", body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "text/plain", "X-Mock-Signed-In": signedIn() ? "1" : "0" } });
    const read = await answer.json();
    if (!answer.ok) throw new CKError(read);
    return read;
  }

  /** The list in `key` split as the library splits it: clean results, and the errors of the rest. */
  function split(read, key, extra = {}) {
    const items = read[key] ?? [];
    const errors = items.filter(isError).map((item) => new CKError(item));
    return { ...read, [key]: items.filter((item) => !isError(item)), errors, hasErrors: errors.length > 0, ...extra };
  }

  function button(id, label, click) {
    const slot = document.getElementById(id);
    if (!slot) return;
    slot.replaceChildren();
    if (!label) return;
    // 161 the library's own shape: a fixed box whose label is shifted to its middle by left and top
    const each = document.createElement("div");
    each.className = "apple-auth-button";
    each.setAttribute("alt", label);
    each.setAttribute("role", "button");
    each.style.cssText = "height: 40px; width: 218px; cursor: pointer; border: 1px solid black; "
      + "border-radius: 5px; background-color: black; display: block;";
    each.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="apple-auth-button-text" width="177" '
      + 'height="21" style="overflow: visible; fill: white; top: 50%; left: 50%; position: relative;">'
      + '<text x="-70" y="6"></text></svg>';
    each.querySelector("text").textContent = label;
    each.addEventListener("click", click);
    slot.append(each);
  }

  const showButtons = (on) => {
    const { signInButton, signOutButton } = settings.apiTokenAuth;
    button(signInButton.id, on ? null : "Sign in with Apple", () => {
      // 185 Apple's window as it hung: opened from the click, and never answering.
      if (silentWindow) return void window.open("about:blank", "", "width=525,height=640");
      remember(true);
      showButtons(true);
      call("public", "users/caller").then((who) => {
        const done = signIn;
        signIn = defer();
        done.resolve(who);
      });
    });
    button(signOutButton.id, on ? "Sign out" : null, () => {
      remember(false);
      showButtons(false);
      const done = signOut;
      signOut = defer();
      done.resolve(null);
    });
  };

  /** `newRecordsBatch`: the options are the batch's, the operations carry the record without a zone. */
  function batch(name, given = {}) {
    const options = pick(given, BATCH_KEYS);
    const operations = [];
    const push = (operationType, records) => {
      for (const record of [].concat(records)) {
        const bare = operationType === "delete" || operationType === "forceDelete" ? { ...record, fields: undefined } : record;
        operations.push({ operationType, record: bare });
      }
      return builder;
    };
    const builder = {
      create: (records) => push("create", records),
      update: (records) => push("update", records),
      delete: (records) => push("delete", records),
      forceDelete: (records) => push("forceDelete", records),
      createOrUpdate(records) {
        for (const record of [].concat(records)) push(record.recordChangeTag ? "update" : "create", record);
        return builder;
      },
      async commit() {
        const read = await call(name, "records/modify", { operations, ...options });
        return split(read, "records");
      }
    };
    return builder;
  }

  const database = (name) => ({
    saveRecords: (records, options) => batch(name, options).createOrUpdate(records).commit(),
    deleteRecords: (records, options) => batch(name, options).forceDelete(records).commit(),
    newRecordsBatch: (options) => batch(name, options),
    // Each zone's options are one item, as the library maps them; it makes the `zones` itself.
    async fetchRecordZoneChanges(options) {
      const zones = [].concat(options).map((each) => pick(each, ZONE_KEYS));
      return split(await call(name, "changes/zone", { zones }), "zones");
    },
    fetchAllRecordZones: async () => split(await call(name, "zones/list"), "zones"),
    async saveSubscriptions(subscriptions) {
      const operations = [].concat(subscriptions).map((subscription) => ({ operationType: "create", subscription }));
      return split(await call(name, "subscriptions/modify", { operations }), "subscriptions");
    },
    async fetchDatabaseChanges(options = {}) {
      return split(await call(name, "changes/database", pick(options, ["syncToken", "resultsLimit"])), "zones");
    }
  });

  const container = {
    async setUpAuth() {
      try {
        const who = await call("public", "users/caller");
        showButtons(true);
        const done = signIn;
        signIn = defer();
        done.resolve(who);
        return who;
      } catch (error) {
        if (error.ckErrorCode !== "AUTHENTICATION_REQUIRED") throw error;
        showButtons(false);
        return false;
      }
    },
    whenUserSignsIn: () => signIn.promise,
    whenUserSignsOut: () => signOut.promise,
    discoverUserIdentityWithUserRecordName: async (userRecordName) =>
      split(await call("public", "users/discover", { lookupInfos: [{ userRecordName }] }), "users"),
    registerForNotifications: async () => {},
    addNotificationListener: (listener) => { listeners.push(listener); },
    privateCloudDatabase: database("private"),
    sharedCloudDatabase: database("shared")
  };

  window.CloudKit = {
    configure: (options) => { settings = options.containers[0]; window.__mockCloudSettings = settings; },
    getDefaultContainer: () => container
  };
  // The page under test calls these: a push as Apple would send it, and a sign-in window that was closed.
  window.__mockCloudPush = () => listeners.forEach((listener) => listener({ type: "mock" }));
  window.__mockCloudSilentWindow = () => { silentWindow = true; };
  window.__mockCloudFailSignIn = () => {
    const failed = signIn;
    signIn = defer();
    failed.reject(new CKError({ ckErrorCode: "SIGN_IN_FAILED", reason: "Error in sign in popup" }));
  };
})();
