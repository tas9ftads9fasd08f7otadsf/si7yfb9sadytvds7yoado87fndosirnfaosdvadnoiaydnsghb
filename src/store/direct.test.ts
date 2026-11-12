import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MapControl, setMapControl } from "@/map/control";
import { applySession, loadsDirect, resetViewer, restoreKept, setTilesDirect, useViewer } from "./viewer";

const get = useViewer.getState;

const control = () => ({ draw: vi.fn(), stopLive: vi.fn(), resize: vi.fn(), watchPhone: vi.fn(), showPhone: vi.fn(),
  readRegions: vi.fn(), camera: vi.fn(), snapshot: vi.fn(), remove: vi.fn() }) satisfies MapControl;

beforeEach(() => {
  resetViewer();
  setMapControl(null);
  localStorage.clear();
});

describe("where tiles come from", () => {
  // 43 the choice is the browser's, kept between visits, and redraws the map where the phone allows it
  it("keeps the choice and redraws when the phone allows loading from the source", () => {
    const map = control();
    setMapControl(map);
    useViewer.setState({ directAllowed: true });
    setTilesDirect(true);
    expect(loadsDirect(get())).toBe(true);
    expect(localStorage.getItem("riki-tiles-direct")).toBe("1");
    expect(map.draw).toHaveBeenCalledTimes(1);
    setTilesDirect(true);
    expect(map.draw).toHaveBeenCalledTimes(1);
    setTilesDirect(false);
    expect(localStorage.getItem("riki-tiles-direct")).toBe("0");
    expect(map.draw).toHaveBeenCalledTimes(2);
  });

  // 43 a choice made earlier means nothing on a phone that does not allow it
  it("goes through the phone while the phone does not allow the source", () => {
    const map = control();
    setMapControl(map);
    setTilesDirect(true);
    expect(loadsDirect(get())).toBe(false);
    expect(map.draw).not.toHaveBeenCalled();
  });

  // 43 the choice comes back on the next visit
  it("restores the choice kept from an earlier visit", () => {
    localStorage.setItem("riki-tiles-direct", "1");
    restoreKept();
    expect(get().tilesDirect).toBe(true);
    localStorage.removeItem("riki-tiles-direct");
  });

  // 43 the phone's switch arrives with each beat; turning it off or on redraws a map drawn the other way
  it("follows the phone's switch, redrawing when it changes what is drawn", () => {
    const map = control();
    setMapControl(map);
    useViewer.setState({ standing: "admitted", tilesDirect: true });
    applySession({ standing: "admitted", direct: true });
    expect(get().directAllowed).toBe(true);
    expect(map.draw).toHaveBeenCalledTimes(1);
    applySession({ standing: "admitted", direct: true });
    expect(map.draw).toHaveBeenCalledTimes(1);
    applySession({ standing: "admitted" });
    expect(get().directAllowed).toBe(false);
    expect(map.draw).toHaveBeenCalledTimes(2);
  });
});
