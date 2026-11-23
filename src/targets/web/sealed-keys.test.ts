// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SEALED_FIELD, keysOf, openSealed } from "./sealed-keys";
import type { CoreRow } from "./records";

const OWNER = "_0123456789abcdef0123456789abcdef";
const MAP = "6F1E2A10-0000-4000-8000-000000000001";
/** rikimaps' MapKeysSealTests seals the same keys to this text. */
const VECTOR = "1:dx5g2E+mV5CeSXSpBX0LlbKiv2+MDPJWPW39JTsVpHoBIsooemFOtAeoTeMeVqRsq4"
  + "rDzHiS/3vF6pLhg6vTPUjHPAHeSrfknHA=";
const HEADERS = { "tiles.example.com": { "X-Api-Key": "secret-1" } };

const mapRow = (database: CoreRow["database"], sealed?: string, owner?: string): CoreRow => ({
  entity: "SharedMap", id: `row-${database}`, database, zone: "z", tag: "t", ...(owner ? { owner } : {}),
  fields: { id: MAP, payload: JSON.stringify({ name: "Tatry", ...(sealed ? { [SEALED_FIELD]: sealed } : {}) }) }
});

// 177 a map's header keys, sealed by rikimaps 3656 with its owner's record name and its id
describe("a map's sealed keys", () => {
  it("open with the owner's record name and the map's id, as the app sealed them", async () => {
    expect(await openSealed(VECTOR, OWNER, MAP)).toEqual(HEADERS);
    expect(await openSealed(VECTOR, OWNER, MAP.toLowerCase())).toEqual(HEADERS);
  });

  it("open to nothing for another map, another owner, or another version", async () => {
    expect(await openSealed(VECTOR, OWNER, "6F1E2A10-0000-4000-8000-000000000002")).toBeNull();
    expect(await openSealed(VECTOR, "_someone", MAP)).toBeNull();
    expect(await openSealed(`2:${VECTOR.slice(2)}`, OWNER, MAP)).toBeNull();
    expect(await openSealed(VECTOR, "", MAP)).toBeNull();
  });

  it("are read from a private map with the signer's name and a shared one with its owner's", async () => {
    expect(await keysOf([mapRow("private", VECTOR)], OWNER)).toEqual(HEADERS);
    expect(await keysOf([mapRow("shared", VECTOR, OWNER)], "_me")).toEqual(HEADERS);
    expect(await keysOf([mapRow("private", VECTOR)], null)).toEqual({});
    expect(await keysOf([mapRow("private"), { ...mapRow("private", VECTOR), entity: "SharedMapLayer" }], OWNER))
      .toEqual({});
  });
});
