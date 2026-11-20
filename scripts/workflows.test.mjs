import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name) => readFileSync(path.join(process.cwd(), ".github/workflows", name), "utf8");

/** Every `name: level` under a `permissions:` key, as the text writes them. */
function asked(text) {
  const found = new Set();
  let depth = null;
  for (const line of text.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (/^\s*permissions:\s*$/.test(line)) depth = indent;
    else if (depth != null && indent > depth && /^\s*[\w-]+:\s*\w+/.test(line)) found.add(line.trim());
    else if (line.trim()) depth = null;
  }
  return found;
}

// 102 bug: actions/checkout fetched the abbreviated `ref: 5a7200c4fb` as a branch or tag and failed the core job
describe("the commits the workflows check out", () => {
  it("are named by their full sha, which actions/checkout alone resolves", () => {
    for (const file of readdirSync(path.join(process.cwd(), ".github/workflows"))) {
      for (const [, ref] of read(file).matchAll(/^\s+ref:\s+([0-9a-f]+)\s*$/gm)) expect(ref, file).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

// 32 Release never started: CI asked to read pull requests, and Release did not grant it.
describe("the release workflow", () => {
  it("grants the CI it calls every permission CI's jobs ask for", () => {
    const release = read("release.yml");
    const check = release.slice(release.indexOf("  check:"), release.indexOf("\n  release:"));
    const granted = asked(check);
    for (const permission of asked(read("ci.yml"))) expect(granted).toContain(permission);
  });
});

// 35 a merge's release was cancelled by the next merge: one group per branch held them both
describe("CI's concurrency", () => {
  it("groups a pull request by its branch and anything else by its commit", () => {
    const group = /concurrency:\s*\n\s*group:\s*(.+)/.exec(read("ci.yml"))?.[1] ?? "";
    expect(group).toContain("github.head_ref || github.sha");
    expect(group).not.toContain("ref_name");
  });
});

// 49 a release that passed CI is deployed to the PHP server over FTPS, and only then
describe("the site's deploy", () => {
  const release = read("release.yml");
  const deploy = read("deploy-site.yml");

  it("follows the release, which follows CI, and is handed the release's tag", () => {
    const job = release.slice(release.indexOf("\n  deploy:"));
    expect(job).toContain("needs: release");
    expect(job).toContain("uses: ./.github/workflows/deploy-site.yml");
    expect(job).toContain("tag: ${{ needs.release.outputs.tag }}");
    expect(release).toMatch(/release:[\s\S]*needs: \[check, core\]/);
    expect(release).toContain('echo "tag=v$version" >> "$GITHUB_OUTPUT"');
  });

  it("can be run again by hand for any release", () => {
    expect(deploy).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*tag:/);
  });

  it("reads the server's password from a secret, never from the workflow's text", () => {
    expect(deploy).toContain("FTPS_PASSWORD: ${{ secrets.FTPS_PASSWORD }}");
    expect(deploy).not.toMatch(/FTPS_PASSWORD:\s*["']?[^$\s]/);
    expect(deploy).toContain("environment: site");
  });

  it("never cuts a deploy short for the next one", () => {
    expect(deploy).toMatch(/concurrency:\s*\n\s*group: deploy-site\s*\n\s*cancel-in-progress: false/);
  });

  it("gives the release's called deploy what it needs to read releases", () => {
    const job = release.slice(release.indexOf("\n  deploy:"));
    for (const permission of asked(deploy)) expect(asked(job)).toContain(permission);
  });

  // 98 the deploy writes config.php from the environment's settings, and php-cli writes it
  it("reads the config's settings from the site environment, production never being one", () => {
    expect(deploy).toContain("ICLOUD_API_TOKEN: ${{ vars.ICLOUD_API_TOKEN || secrets.ICLOUD_API_TOKEN }}");
    expect(deploy).toContain("ICLOUD_CONTAINER: ${{ vars.ICLOUD_CONTAINER || 'iCloud.com.rikimaps.rikimaps.maps' }}");
    expect(deploy).toContain("TILES_BASE: ${{ vars.TILES_BASE }}");
    expect(deploy).not.toMatch(/ICLOUD_ENVIRONMENT|ICLOUD_API_TOKEN:\s*["']?[^$\s]/);
    expect(deploy).toMatch(/apt-get install -y -q lftp php-cli/);
  });

  it("gives CI the FTPS tools the deploy script's test needs", () => {
    expect(read("ci.yml")).toContain("apt-get install -y -q lftp");
    expect(read("ci.yml")).toContain("pip install pyftpdlib pyopenssl");
  });
});

// 63 a draft pull request runs no CI; marking it ready runs it, and so does each later push
describe("CI on a pull request", () => {
  const ci = read("ci.yml");

  it("is started when the pull request is marked ready, and by every push to it", () => {
    const types = /pull_request:\s*\n\s*types:\s*\[([^\]]*)\]/.exec(ci)?.[1].split(",").map((t) => t.trim());
    expect(types).toEqual(expect.arrayContaining(["opened", "synchronize", "reopened", "ready_for_review"]));
  });

  it("skips a draft, and the check that needs it, but never a release's call", () => {
    const changes = ci.slice(ci.indexOf("  changes:"), ci.indexOf("\n  check:"));
    expect(changes).toContain("if: github.event_name != 'pull_request' || !github.event.pull_request.draft");
    expect(ci.slice(ci.indexOf("\n  check:"))).toContain("needs: changes");
  });
});

// 71 a merge to master left its tests running while a newer merge's started: the old ones stop
describe("CI's check job", () => {
  const ci = read("ci.yml");
  const check = ci.slice(ci.indexOf("\n  check:"));

  it("replaces the check still running for the same branch, or for master", () => {
    expect(check).toMatch(/concurrency:\s*\n\s*group: check-\$\{\{ github\.head_ref \|\| github\.ref \}\}\s*\n\s*cancel-in-progress: true/);
  });

  it("leaves the release and the deploy out of any group that cancels", () => {
    const release = read("release.yml");
    expect(release).not.toContain("cancel-in-progress: true");
    expect(release).not.toMatch(/\n  release:[\s\S]*concurrency:/);
  });

  it("starts the check only for code, so a docs-only merge cancels no tests", () => {
    expect(check).toContain("if: needs.changes.outputs.code == 'true'");
  });
});

// 75 a release that passed CI asks Riki Maps for a pull request taking it into the app
describe("the app's update", () => {
  const release = read("release.yml");
  const update = read("update-app.yml");
  const job = release.slice(release.indexOf("\n  app:"), release.indexOf("\n  deploy:"));

  it("follows the published release, which follows CI", () => {
    expect(job).toContain("needs: release");
    expect(job).toContain("uses: ./.github/workflows/update-app.yml");
    expect(release).toMatch(/release:[\s\S]*needs: \[check, core\]/);
  });

  it("runs Riki Maps' own web-editor workflow on its master", () => {
    expect(update).toContain("gh workflow run web-editor.yml --repo skifahrer/rikimaps --ref master");
  });

  it("reaches Riki Maps with a secret token, handed on by the release", () => {
    expect(update).toContain("GH_TOKEN: ${{ secrets.RIKIMAPS_ACTIONS_TOKEN }}");
    expect(job).toContain("RIKIMAPS_ACTIONS_TOKEN: ${{ secrets.RIKIMAPS_ACTIONS_TOKEN }}");
  });

  it("gives the called update what it asks for", () => {
    for (const permission of asked(update)) expect(asked(job)).toContain(permission);
  });
});

// 88 the core is built from a pinned rikimaps commit, before the site is packed, and a deploy needs it
describe("the core's pipeline", () => {
  const core = read("core.yml");
  const release = read("release.yml");
  const deploy = read("deploy-site.yml");

  it("checks out the private rikimaps at the pinned commit with a secret token", () => {
    expect(core).toContain("repository: skifahrer/rikimaps");
    expect(core).toContain("ref: ${{ steps.pin.outputs.ref }}");
    expect(core).toContain("token: ${{ secrets.RIKIMAPS_READ_TOKEN }}");
    expect(core).toContain("rikiCore.ref");
    expect(core).not.toMatch(/token:\s*["']?[^$\s"']/);
  });

  it("caches the toolchain and the SDK, and builds with the script", () => {
    expect(core).toContain("~/.cache/riki-swift");
    expect(core).toContain("~/.swiftpm/swift-sdks");
    expect(core).toContain("npm run build:core");
    expect(core).toMatch(/workflow_call:/);
  });

  it("runs rikimaps' own core tests, which its CI no longer does, with the toolchain it built with", () => {
    expect(core).toContain("rikimaps/tools/linux-core-tests.sh");
    expect(core).toContain("SWIFT:");
    expect(core.indexOf("npm run build:core")).toBeLessThan(core.indexOf("linux-core-tests.sh"));
  });

  // 91 the words are made from the same checkout, and checked against the generator they replace
  it("makes the site's words from the same checkout and reproduces the generator's, which the release takes", () => {
    expect(core).toContain("npm run build:words");
    expect(core).toContain("ref: 5a7200c4fbea3ded11e7b9294e39bc35c0fd8ffe");
    expect(core).toContain("RIKIMAPS_WORDS_CHECK_DIR");
    expect(core).toContain("name: riki-words");
    expect(release).toContain("name: riki-words");
    expect(release.indexOf("name: riki-words")).toBeLessThan(release.indexOf("npm run pack:web"));
  });

  it("lets CI pack the site without the core for its browser specs, and the release not", () => {
    expect(read("ci.yml")).toMatch(/run: npm run pack:web\n\s+env:\n\s+RIKI_PACK_WITHOUT_CORE: "1"/);
    expect(release).not.toContain("RIKI_PACK_WITHOUT_CORE");
  });

  it("is built by the release before the site is packed, with the secret handed on", () => {
    expect(release).toMatch(/\n  core:[\s\S]*uses: \.\/\.github\/workflows\/core\.yml/);
    expect(release).toContain("RIKIMAPS_READ_TOKEN: ${{ secrets.RIKIMAPS_READ_TOKEN }}");
    expect(release).toMatch(/release:[\s\S]*needs: \[check, core\]/);
    expect(release.indexOf("name: riki-core")).toBeGreaterThan(-1);
    expect(release.indexOf("name: riki-core")).toBeLessThan(release.indexOf("npm run pack:web"));
  });

  it("refuses a deploy without the core unless a run by hand says it is a test address", () => {
    expect(deploy).toMatch(/workflow_dispatch:[\s\S]*without_core:[\s\S]*type: boolean[\s\S]*default: false/);
    expect(deploy).toContain("RIKI_ALLOW_NO_CORE: ${{ inputs.without_core && '1' || '' }}");
    expect(read("../../scripts/deploy-site.sh")).toContain("out/riki-core.wasm");
  });
});

// 96 the core is built by hand for any rikimaps commit and kept where fetch:core finds it
describe("the core on demand", () => {
  const onDemand = read("core-on-demand.yml");

  it("runs only by hand and publishes no release, which rikimaps would take as the editor's", () => {
    expect(onDemand).toMatch(/^on:\n  workflow_dispatch:\n/m);
    expect(onDemand).not.toMatch(/pull_request:|push:|schedule:|workflow_call:/);
    expect(onDemand).not.toContain("gh release");
    expect([...asked(onDemand)]).toEqual(["contents: read"]);
  });

  it("builds the commit asked for, or the pin, and names the artifact by the commit built", () => {
    expect(onDemand).toContain("ASKED: ${{ inputs.ref }}");
    expect(onDemand).not.toMatch(/run:[^\n]*\$\{\{ inputs\./);
    expect(onDemand).toContain("RIKI_CORE_REF: ${{ steps.commit.outputs.sha }}");
    expect(onDemand).toContain("name: riki-core-${{ steps.commit.outputs.sha }}");
    expect(onDemand).toContain("retention-days: 90");
    expect(onDemand).toContain("rikimaps/tools/linux-core-tests.sh");
  });

  it("is the workflow fetch:core asks for", async () => {
    const { WORKFLOW, artifactName } = await import("./fetch-core.mjs");
    expect(WORKFLOW).toBe("core-on-demand.yml");
    expect(onDemand).toContain(artifactName("${{ steps.commit.outputs.sha }}"));
  });
});
