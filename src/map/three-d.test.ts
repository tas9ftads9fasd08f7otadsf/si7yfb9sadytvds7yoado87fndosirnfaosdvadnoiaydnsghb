import { describe, expect, it } from "vitest";
import { heightModel, THREE_D_PITCH, threeDView } from "./three-d";

describe("3D view", () => {
  // 89 the phone's own height model is picked before any other.
  it("picks the terrain source among the height models", () => {
    expect(heightModel({ a: { type: "raster-dem" }, terrain: { type: "raster-dem" }, b: { type: "vector" } }))
      .toBe("terrain");
    expect(heightModel({ "riki__terrain": { type: "raster-dem" } })).toBe("riki__terrain");
    expect(heightModel({ hills: { type: "raster-dem" } })).toBe("hills");
    expect(heightModel({ roads: { type: "vector" } })).toBeNull();
  });

  // 89 the button raised the relief but left the camera flat, so nothing looked 3D.
  it("raises the relief and tilts the camera in one press", () => {
    expect(threeDView(true, "terrain")).toEqual({ terrain: { source: "terrain", exaggeration: 1 },
      pitch: THREE_D_PITCH });
  });

  // 89 off lays the map flat again.
  it("lays the map flat when turned off", () => {
    expect(threeDView(false, "terrain")).toEqual({ terrain: null, pitch: 0 });
  });
});
