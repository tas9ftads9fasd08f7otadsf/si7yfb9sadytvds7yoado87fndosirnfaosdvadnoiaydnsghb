import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { WASI } from "@bjorn3/browser_wasi_shim";
import { describe, expect, it } from "vitest";
import recorded from "../../../e2e/fixtures/recorded-records.json";
import { CoreNotReady } from "@/backend/types";
import type { CKRecord } from "./cloud";
import { CORE_ARGS, NoSuchMap, coreOf, type CoreExports } from "./core";
import { SHARE_TYPE, rowOf, shareRowOf, type CoreRow } from "./records";

/** 159 The module `RIKI_CORE_WASM` names, which must be there, else the one `npm run build:core` made, if any. */
const ASKED = process.env.RIKI_CORE_WASM;
const MODULE = ASKED ?? path.join(__dirname, "../../../dist/riki-core/riki-core.wasm");

const TATRAS = "6F1E2A10-0000-4000-8000-000000000001";
const BESKYDY = "6F1E2A10-0000-4000-8000-000000000003";
const DOPRAVA = "6F1E2A10-0000-4000-8000-000000000002";

async function realCore() {
  const wasi = new WASI(CORE_ARGS, [], []);
  const { instance } = await WebAssembly.instantiate(readFileSync(MODULE),
    { wasi_snapshot_preview1: wasi.wasiImport as unknown as WebAssembly.ModuleImports });
  wasi.initialize(instance as unknown as Parameters<WASI["initialize"]>[0]);
  const exports = instance.exports as unknown as CoreExports;
  return { core: coreOf(exports), hasPeople: typeof exports.riki_people === "function" };
}

/** The rows as the site reads them from CloudKit: `rowOf` for the mirror's records, `shareRowOf` for a share. */
async function rows(): Promise<CoreRow[]> {
  const read = recorded.zones.map(async ({ database, zone, records, ...rest }) => {
    const where = { database: database as CoreRow["database"], zone, ...("owner" in rest ? { owner: rest.owner } : {}) };
    return Promise.all((records as unknown as CKRecord[]).map((record) =>
      record.recordType === SHARE_TYPE ? shareRowOf(record, where) : rowOf(record, where)));
  });
  return (await Promise.all(read)).flat();
}

// 159 the browser specs stand in for the core, so its contract with the site had no test of the real module
describe.skipIf(!ASKED && !existsSync(MODULE))("the real riki-core.wasm on records the app writes", () => {
  it("lists every map with a payload in rank order, with its layers top first and whose it is", async () => {
    const { core } = await realCore();
    const device = core.maps(await rows());
    expect(device.maps.map((each) => [each.id, each.name, each.role])).toEqual([
      [BESKYDY, "Beskydy", "own"], [TATRAS, "High Tatras", "own"], [DOPRAVA, "Doprava", "view"]]);
    const tatras = device.maps.find((each) => each.id === TATRAS);
    expect(tatras?.layers.map((each) => each.name)).toEqual(["Trails", "Roads"]);
    expect(tatras?.styles).toEqual(["Summer"]);
  });

  it("opens a map by its id in any case, and throws NoSuchMap for one the rows lack", async () => {
    const { core } = await realCore();
    const read = await rows();
    const tatras = core.map(read, TATRAS.toLowerCase());
    expect(tatras.name).toBe("High Tatras");
    expect(tatras.stack?.map((each) => each.name)).toEqual(["Roads", "Trails"]);
    expect(tatras.styles?.map((each) => each.name)).toEqual(["Summer"]);
    expect(() => core.map(read, "nothing")).toThrow(NoSuchMap);
  });

  it("reads the history's lines with their author and where they were made", async () => {
    const { core } = await realCore();
    expect(core.changes(await rows())).toEqual([
      { id: "change-1", map: "own-tatras", author: "Eva", origin: "web", lines: ["Trails added"] }]);
  });

  it("reads who holds a map by the app's roles, or says not ready in a module from before rikimaps 3560", async () => {
    const { core, hasPeople } = await realCore();
    const read = await rows();
    if (!hasPeople) {
      expect(() => core.people(read, BESKYDY)).toThrow(CoreNotReady);
      return;
    }
    expect(core.people(read, BESKYDY)).toEqual({
      shared: true, role: "owner", linkRole: "reader", people: [
        { id: "_me", name: "Riki Tester", role: "owner", hasAccepted: true, isYou: true },
        { id: "_jana", name: "Jana", role: "admin", hasAccepted: true, isYou: false },
        { id: "invite:email:marek@example.com", name: "marek@example.com", role: "editor", hasAccepted: false, isYou: false },
        { id: "_petr", name: "petr@example.com", role: "reader", hasAccepted: false, isYou: false }] });
    expect(core.people(read, DOPRAVA)).toMatchObject({ shared: true, role: "reader", linkRole: null,
      people: [{ id: "_friki", role: "owner" }, { id: "_me", role: "reader", isYou: true }] });
  });
});
