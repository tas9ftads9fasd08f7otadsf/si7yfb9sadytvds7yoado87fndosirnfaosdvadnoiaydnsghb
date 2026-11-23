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

/** Keys a mapping in the text holds twice, which GitHub refuses as an invalid workflow. */
function repeatedKeys(text) {
  const repeated = [];
  let open = [];
  let block = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (block != null && indent > block) continue;
    block = null;
    const entry = /^(\s*)(- +)?([\w.-]+):(\s*[|>][-+]?)?/.exec(line);
    if (!entry) continue;
    const depth = entry[1].length + (entry[2]?.length ?? 0);
    open = open.filter((mapping) => mapping.depth < depth || (mapping.depth === depth && !entry[2]));
    let mapping = open.at(-1);
    if (mapping?.depth !== depth) open.push(mapping = { depth, keys: new Set() });
    if (mapping.keys.has(entry[3])) repeated.push(`${entry[3]} at ${line.trim()}`);
    mapping.keys.add(entry[3]);
    if (entry[4]) block = indent;
  }
  return repeated;
}

// 143 bug: check-server.yml set SITE_URL twice, so every push failed it and no daily check ran
describe("every workflow", () => {
  it("holds each key once in a mapping", () => {
    for (const file of readdirSync(path.join(process.cwd(), ".github/workflows"))) expect(repeatedKeys(read(file)), file).toEqual([]);
  });

  it("is caught holding a key twice", () => {
    expect(repeatedKeys("jobs:\n  a:\n    env:\n      X: 1\n      X: 2\n  b:\n    env:\n      X: 1\n")).toHaveLength(1);
    expect(repeatedKeys("steps:\n  - run: |\n      a: 1\n      a: 1\n  - run: b\n")).toEqual([]);
  });
});

// 102 bug: actions/checkout fetched the abbreviated `ref: 5a7200c4fb` as a branch or tag and failed the core job
describe("the commits the workflows check out", () => {
  it("are named by their full sha, which actions/checkout alone resolves", () => {
    for (const file of readdirSync(path.join(process.cwd(), ".github/workflows"))) {
      for (const [, ref] of read(file).matchAll(/^\s+ref:\s+([0-9a-f]+)\s*$/gm)) expect(ref, file).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

// 124 bug: actions/cache@v4 and actions/upload-artifact@v4 ran on the deprecated Node.js 20
describe("the actions the workflows use", () => {
  const firstOnNode24 = { "actions/cache": 5, "actions/checkout": 5, "actions/download-artifact": 7,
    "actions/setup-node": 5, "actions/upload-artifact": 6 };

  it("are releases that run on Node.js 24", () => {
    for (const file of readdirSync(path.join(process.cwd(), ".github/workflows"))) {
      for (const [, action, major] of read(file).matchAll(/uses:\s+(actions\/[\w-]+)@v(\d+)/g)) {
        expect(firstOnNode24[action], `${file}: ${action} is not listed`).toBeDefined();
        expect(Number(major), `${file}: ${action}@v${major}`).toBeGreaterThanOrEqual(firstOnNode24[action]);
      }
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
    // 147 region packages come from the catalog's addresses alone, so no tiles host is read
    expect(deploy).not.toContain("TILES_BASE");
    expect(deploy).toContain("REGIONS_CATALOG: ${{ vars.REGIONS_CATALOG }}");
    expect(deploy).not.toMatch(/ICLOUD_ENVIRONMENT|ICLOUD_API_TOKEN:\s*["']?[^$\s]/);
    expect(deploy).toMatch(/apt-get install -y -q lftp php-cli/);
  });

  it("gives CI the FTPS tools the deploy script's test needs", () => {
    expect(read("ci.yml")).toContain("apt-get install -y -q lftp");
    expect(read("ci.yml")).toContain("pip install pyftpdlib pyopenssl");
  });

  // 174 npm test needs no SSL: the FTPS suites run as test:ftps, after their tools are installed
  it("runs the FTPS suites on their own, where their tools are installed", () => {
    for (const name of ["ci.yml", "deploy-latest.yml"]) {
      const text = read(name);
      expect(text.indexOf("pip install pyftpdlib")).toBeLessThan(text.indexOf("run: npm run test:ftps"));
      expect(text.indexOf("run: npm test")).toBeLessThan(text.indexOf("run: npm run test:ftps"));
    }
  });
});

// 132 runners waited 8 minutes on Playwright's browser; CI keeps it and the rest
describe("CI's caches", () => {
  const ci = read("ci.yml");

  it("keep Playwright's browser for its version, a week at most, and fetch it only on a miss", () => {
    expect(ci).toContain("path: ~/.cache/ms-playwright");
    expect(ci).toContain("key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}-${{ steps.week.outputs.week }}");
    expect(ci).toContain("date -u +%G-W%V");
    expect(ci).toMatch(/if: steps\.browser\.outputs\.cache-hit != 'true'\s*\n\s*run: npx playwright install --with-deps chromium/);
    expect(ci).toMatch(/if: steps\.browser\.outputs\.cache-hit == 'true'\s*\n\s*run: npx playwright install-deps chromium/);
  });

  it("keep the packages until the lockfile changes, and install only on a miss", () => {
    expect(ci).toContain("key: node-modules-${{ runner.os }}-${{ hashFiles('.nvmrc', 'package-lock.json') }}");
    expect(ci).toMatch(/if: steps\.modules\.outputs\.cache-hit != 'true'\s*\n\s*run: npm ci/);
    expect(ci).toContain("key: composer-${{ runner.os }}-${{ hashFiles('server/composer.lock') }}");
  });

  it("keep pip's downloads a week and the build's cache by its sources", () => {
    expect(ci).toContain("key: pip-${{ runner.os }}-ftps-${{ steps.week.outputs.week }}");
    expect(ci).toContain("path: .next/cache");
  });

  // 139 the browser's libraries moved to the browser jobs, so the check job asks apt for its own lists
  it("ask apt for its lists once in each job", () => {
    const check = ci.slice(ci.indexOf("\n  check:"), ci.indexOf("\n  browser:"));
    const browser = ci.slice(ci.indexOf("\n  browser:"));
    expect(check.match(/apt-get update/g)).toHaveLength(1);
    expect(check).toContain("apt-get update -q && sudo apt-get install -y -q lftp");
    expect(browser).not.toContain("apt-get update");
    expect(browser).toContain("playwright install-deps chromium");
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

// 139 the browser specs took 16 of a run's 18 minutes on one runner, one after the other
describe("CI's browser tests", () => {
  const ci = read("ci.yml");
  const check = ci.slice(ci.indexOf("\n  check:"), ci.indexOf("\n  browser:"));
  const browser = ci.slice(ci.indexOf("\n  browser:"));

  it("run in shares on parallel runners beside the check, not after it", () => {
    expect(browser).toContain("needs: changes");
    expect(browser).not.toMatch(/needs:.*check/);
    expect(browser).toContain("if: needs.changes.outputs.code == 'true'");
    expect(browser).toContain("run: npx playwright test --shard=${{ matrix.shard }}");
    expect(browser).toContain("fail-fast: false");
  });

  it("cover every share of both targets", () => {
    const shards = [...browser.matchAll(/\{ target: (\w+), shard: (\d+)\/(\d+) \}/g)];
    for (const target of ["phone", "web"]) {
      const own = shards.filter((each) => each[1] === target);
      expect(own.length).toBeGreaterThan(1);
      expect(own.map((each) => Number(each[2]))).toEqual(own.map((_, index) => index + 1));
      expect(own.every((each) => Number(each[3]) === own.length)).toBe(true);
    }
  });

  it("each replace only their own share's older run", () => {
    expect(browser).toMatch(/concurrency:\s*\n\s*group: browser-\$\{\{ github\.head_ref \|\| github\.ref \}\}-\$\{\{ matrix\.target \}\}-\$\{\{ matrix\.shard \}\}\s*\n\s*cancel-in-progress: true/);
  });

  it("leave the check job its lint, unit tests and packages, and no browser tests", () => {
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run test:php", "npm run pack",
      "npm run pack:web"]) expect(check).toContain(`run: ${step}`);
    expect(check).not.toContain("test:e2e");
    expect(check).not.toContain("playwright");
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

  // 145 bug: `gh workflow run` needs actions: write, which the read token lacks, and failed with 403
  it("sends Riki Maps the repository dispatch its web-editor workflow listens for", () => {
    expect(update).toContain("gh api repos/skifahrer/rikimaps/dispatches -f event_type=web-editor-release");
    expect(update).not.toContain("gh workflow run");
  });

  // 145 a release with no token used to warn and pass, so nobody saw the app was never asked
  it("reaches Riki Maps with the read token, handed on by the release, and fails without it", () => {
    expect(update).toContain("GH_TOKEN: ${{ secrets.RIKIMAPS_READ_TOKEN }}");
    expect(update).toMatch(/RIKIMAPS_READ_TOKEN:\s*\n\s*required: true/);
    expect(update).toMatch(/RIKIMAPS_READ_TOKEN is not set[^\n]*"\s*\n\s*exit 1/);
    expect(job).toContain("RIKIMAPS_READ_TOKEN: ${{ secrets.RIKIMAPS_READ_TOKEN }}");
    expect(update + job).not.toContain("RIKIMAPS_ACTIONS_TOKEN");
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

  // 146 a core cut is built and tested on Linux by hand, on its branch, before it is pinned
  it("may be run by hand on another rikimaps branch or commit, built as that commit", () => {
    expect(core).toMatch(/workflow_dispatch:\s*\n(\s*#.*\n)*\s*inputs:\s*\n\s*ref:/);
    expect(core).toContain("ASKED: ${{ inputs.ref }}");
    expect(core).toContain('echo "ref=${ASKED:-$(node -p');
    expect(core).toContain('echo "RIKI_CORE_REF=$(git -C rikimaps rev-parse HEAD)" >> "$GITHUB_ENV"');
    expect(core.indexOf("RIKI_CORE_REF=")).toBeLessThan(core.indexOf("npm run build:core"));
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

  // 110 the glyphs and the base sprite are made from the same checkout, and the release packs them
  it("makes the site's glyphs and sprite from the same checkout, which the release takes before it packs", () => {
    expect(core).toContain("npm run build:assets");
    expect(core).toContain("name: riki-assets");
    expect(core).toContain("scripts/build-assets.mjs");
    expect(release).toContain("name: riki-assets");
    expect(release.indexOf("name: riki-assets")).toBeLessThan(release.indexOf("npm run pack:web"));
    expect(read("../../scripts/deploy-site.sh")).toContain("out/glyphs");
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

// 120 the site's server connection is checked each day and before each deploy
describe("the server check", () => {
  const check = read("check-server.yml");
  const deploy = read("deploy-site.yml");

  it("runs each day, by hand, and when another workflow calls it", () => {
    expect(check).toMatch(/schedule:\s*\n\s*- cron: "[0-9]+ [0-9]+ \* \* \*"/);
    expect(check).toContain("workflow_dispatch:");
    expect(check).toContain("workflow_call:");
  });

  it("reads the deploy's own settings from the site environment, the password from a secret", () => {
    expect(check).toContain("environment: site");
    for (const name of ["FTPS_HOST", "FTPS_USER", "FTPS_PASSWORD"]) {
      expect(check).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    for (const name of ["FTPS_DIR", "FTPS_PORT", "SITE_URL"]) expect(check).toContain(`${name}: \${{ vars.${name} }}`);
  });

  it("fails rather than skips when the settings are missing, so a daily run is never green for nothing", () => {
    expect(check).toMatch(/are not all set on the site environment"\s*\n\s*exit 1/);
  });

  it("installs the deploy's FTPS client and runs the script", () => {
    expect(check).toContain("apt-get install -y -q lftp");
    expect(check).toContain("run: bash scripts/check-server.sh");
  });

  it("runs in the deploy before anything is uploaded", () => {
    const checked = deploy.indexOf("run: bash scripts/check-server.sh");
    expect(checked).toBeGreaterThan(-1);
    expect(checked).toBeLessThan(deploy.indexOf("run: bash scripts/deploy-site.sh"));
  });
});

// 164 the site is deployed by hand with the core, words and glyphs of rikimaps' newest commit
describe("the deploy of the latest", () => {
  const latest = read("deploy-latest.yml");
  const core = read("core.yml");
  const deploy = read("deploy-site.yml");
  const job = (name) => {
    const rest = latest.slice(latest.indexOf(`\n  ${name}:\n`) + 1);
    const next = rest.slice(1).search(/\n  [\w-]+:\n/);
    return next < 0 ? rest : rest.slice(0, next + 1);
  };

  it("runs only by hand and cuts no release, which the app would take", () => {
    expect(latest).toMatch(/^on:\n  workflow_dispatch:\n/m);
    expect(latest).not.toMatch(/pull_request:|push:|schedule:|workflow_call:/);
    expect(latest).not.toContain("gh release");
    expect(latest).not.toContain("update-app.yml");
  });

  it("names rikimaps' newest commit by its full sha and builds the core there", () => {
    expect(latest).toContain('gh api "repos/skifahrer/rikimaps/commits/${BRANCH:-HEAD}" --jq .sha');
    expect(latest).toContain("BRANCH: ${{ inputs.rikimaps_branch }}");
    expect(latest).not.toMatch(/run:[^\n]*\$\{\{ inputs\./);
    expect(latest).toMatch(/\^\[0-9a-f\]\{40\}\$/);
    expect(latest).toContain("uses: ./.github/workflows/core.yml");
    expect(latest).toContain("ref: ${{ needs.latest.outputs.sha }}");
    expect(latest).toContain("RIKIMAPS_READ_TOKEN: ${{ secrets.RIKIMAPS_READ_TOKEN }}");
  });

  it("gives the core's call a ref, and a group of its own beside the release's at the same commit", () => {
    expect(core).toMatch(/workflow_call:\s*\n(\s*#.*\n)*\s*inputs:\s*\n\s*ref:/);
    expect(core).toMatch(/concurrency:\s*\n\s*group: core-\$\{\{ github\.head_ref \|\| github\.sha \}\}-\$\{\{ inputs\.ref \}\}/);
  });

  it("tests and packs with that core, which must be there, held to the commit built", () => {
    const pack = job("pack");
    expect(pack).toContain("needs: [latest, core]");
    for (const name of ["riki-core", "riki-words", "riki-assets"]) expect(pack).toContain(`name: ${name}`);
    expect(pack).not.toContain("continue-on-error");
    expect(pack).not.toContain("RIKI_PACK_WITHOUT_CORE");
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run test:php"]) expect(pack).toContain(`run: ${step}`);
    expect(pack).toContain("RIKI_CORE_WASM: dist/riki-core/riki-core.wasm");
    expect(pack).toContain("RIKI_CORE_REF: ${{ needs.latest.outputs.sha }}");
    expect(pack.indexOf("npm test")).toBeLessThan(pack.indexOf("npm run pack:web"));
    expect(pack).toContain("name: web-site-latest");
  });

  it("deploys the packed zip through the site's deploy, which takes it from the run", () => {
    const step = job("deploy");
    expect(step).toContain("needs: pack");
    expect(step).toContain("uses: ./.github/workflows/deploy-site.yml");
    expect(step).toContain("artifact: web-site-latest");
    expect(step).toContain("secrets: inherit");
    for (const permission of asked(deploy)) expect(asked(step)).toContain(permission);
    expect(deploy).toMatch(/if: steps\.ready\.outputs\.go == 'true' && inputs\.artifact != ''\s*\n\s*uses: actions\/download-artifact@v7\s*\n\s*with:\s*\n\s*name: \$\{\{ inputs\.artifact \}\}/);
    expect(deploy).toMatch(/if: steps\.ready\.outputs\.go == 'true' && inputs\.artifact == ''\s*\n\s*run: gh release download/);
  });

  it("fails without the server's settings rather than passing having deployed nothing", () => {
    expect(deploy).toMatch(/if \[ -n "\$ARTIFACT" \]; then\s*\n\s*echo "::error::FTPS_HOST[^\n]*"\s*\n\s*exit 1/);
  });
});
