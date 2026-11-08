import { describe, expect, it } from "vitest";
import { regionOffer, regionUnder } from "./region";
import type { Box, Region } from "./types";

const tatry: Region = { id: "t", name: "Tatry", box: [19.9, 49.09, 20.32, 49.32] };
const presov: Region = { id: "p", name: "Prešov", box: [20.4, 48.6, 22.6, 49.6] };
const overPresov: Box = [21, 49, 21.5, 49.3];
const centre = { lng: 21.2, lat: 49.1 };

describe("regionUnder", () => {
  it("finds the region holding the centre", () => {
    expect(regionUnder([tatry, presov], centre)).toBe(presov);
    expect(regionUnder([tatry], centre)).toBeUndefined();
  });
});

describe("regionOffer", () => {
  it("offers nothing until the regions are known", () => {
    expect(regionOffer(null, overPresov, centre)).toBeNull();
  });
  it("offers nothing where the phone draws", () => {
    expect(regionOffer({ drawn: [presov], downloadable: [presov] }, overPresov, centre)).toBeNull();
  });
  it("says a region is on its way before offering it", () => {
    const known = { downloading: [presov], downloadable: [presov] };
    expect(regionOffer(known, overPresov, centre)).toEqual({ kind: "downloading", region: presov });
  });
  it("names a region the phone lacks", () => {
    expect(regionOffer({ drawn: [tatry], downloadable: [presov] }, overPresov, centre))
      .toEqual({ kind: "absent", region: presov });
  });
});
