import { readFileSync } from "node:fs";
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
    expect(release).toMatch(/release:[\s\S]*needs: check/);
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
    expect(release).toMatch(/release:[\s\S]*needs: check/);
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
