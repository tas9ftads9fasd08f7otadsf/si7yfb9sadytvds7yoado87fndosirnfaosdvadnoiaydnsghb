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
