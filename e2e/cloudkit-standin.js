// A stand-in for cloudkit.js: the calls the site makes, sent to api.apple-cloudkit.com as the real one does.
(() => {
  const FLAG = "mock-cloud-signed-in";
  const listeners = [];
  const signedIn = () => { try { return localStorage.getItem(FLAG) === "1"; } catch { return false; } };
  const remember = (on) => { try { localStorage.setItem(FLAG, on ? "1" : "0"); } catch { /* signed out on reload */ } };
  let settings;
  let onSignIn = () => {};
  let onSignOut = () => {};

  async function call(database, path, body) {
    const { containerIdentifier, environment, apiTokenAuth } = settings;
    const address = `https://api.apple-cloudkit.com/database/1/${containerIdentifier}/${environment}/${database}/${path}`
      + `?ckAPIToken=${encodeURIComponent(apiTokenAuth.apiToken)}`;
    const answer = await fetch(address, { method: "POST", body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "text/plain", "X-Mock-Signed-In": signedIn() ? "1" : "0" } });
    const read = await answer.json();
    if (!answer.ok) throw Object.assign(new Error(read.reason ?? "refused"), { ckErrorCode: read.serverErrorCode });
    return read;
  }

  function button(id, label, click) {
    const slot = document.getElementById(id);
    if (!slot) return;
    slot.replaceChildren();
    if (!label) return;
    const each = document.createElement("button");
    each.type = "button";
    each.textContent = label;
    each.addEventListener("click", click);
    slot.append(each);
  }

  const showButtons = (on) => {
    const { signInButton, signOutButton } = settings.apiTokenAuth;
    button(signInButton.id, on ? null : "Sign in with Apple", () => {
      remember(true);
      showButtons(true);
      call("public", "users/caller").then((who) => onSignIn(who));
    });
    button(signOutButton.id, on ? "Sign out" : null, () => {
      remember(false);
      showButtons(false);
      onSignOut(null);
    });
  };

  const database = (name) => ({
    fetchRecordZoneChanges: (options) => call(name, "changes/zone", options),
    fetchAllRecordZones: () => call(name, "zones/list")
  });

  const container = {
    async setUpAuth() {
      try {
        const who = await call("public", "users/caller");
        showButtons(true);
        return who;
      } catch {
        showButtons(false);
        return false;
      }
    },
    whenUserSignsIn: () => new Promise((resolve) => { onSignIn = resolve; }),
    whenUserSignsOut: () => new Promise((resolve) => { onSignOut = resolve; }),
    registerForNotifications: async () => {},
    addNotificationListener: (listener) => { listeners.push(listener); },
    privateCloudDatabase: database("private"),
    sharedCloudDatabase: database("shared")
  };

  window.CloudKit = {
    configure: (options) => { settings = options.containers[0]; },
    getDefaultContainer: () => container
  };
  // The page under test calls this, as a push from Apple would arrive.
  window.__mockCloudPush = () => listeners.forEach((listener) => listener({ type: "mock" }));
})();
