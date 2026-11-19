/** 89 The phone's 3D tilt, steep enough that the relief reads as mountains. */
export const THREE_D_PITCH = 60;

type Sources = Record<string, { type?: string } | undefined>;

/** 89 The style's height model, the one the phone names `terrain` first. */
export function heightModel(sources: Sources): string | null {
  const dems = Object.keys(sources).filter((id) => sources[id]?.type === "raster-dem");
  return dems.find((id) => id === "terrain" || id.endsWith("__terrain")) ?? dems[0] ?? null;
}

/** 89 One press does all of 3D, as on the phone: the relief and the tilt together. */
export function threeDView(on: boolean, dem: string | null) {
  return {
    terrain: on && dem ? { source: dem, exaggeration: 1 } : null,
    pitch: on ? THREE_D_PITCH : 0
  };
}
