import { beforeEach, describe, expect, it } from "vitest";
import { go, readAddress, resetViewer, showSwitcher, useViewer } from "./viewer";

const get = useViewer.getState;

describe("the layer switcher and its address", () => {
  beforeEach(() => {
    resetViewer();
    history.replaceState(null, "", "/maps/a");
    useViewer.setState({ mapID: "a", route: { screen: "map", map: "a" } });
  });

  // 151 bug: /maps/<map>/layers named the switcher but opened nothing, so W15's address showed no panel
  it("opens at /maps/<map>/layers and closes at /maps/<map>", () => {
    history.replaceState(null, "", "/maps/a/layers");
    readAddress();
    expect(get().switcherOpen).toBe(true);
    expect(get().route).toEqual({ screen: "map", map: "a", panel: "layers" });
    go({ screen: "map", map: "a" });
    expect(get().switcherOpen).toBe(false);
  });

  // 151 the button writes the address, in place, so opening and closing leave no history behind
  it("names itself in the address when opened and leaves it when closed", () => {
    const entries = history.length;
    showSwitcher(true);
    expect(get().switcherOpen).toBe(true);
    expect(location.pathname).toBe("/maps/a/layers");
    showSwitcher(false);
    expect(get().switcherOpen).toBe(false);
    expect(location.pathname).toBe("/maps/a");
    expect(history.length).toBe(entries);
  });

  // 151 off the map screen there is no address to carry it
  it("is only a flag where the screen is not the map", () => {
    useViewer.setState({ route: { screen: "maps" } });
    showSwitcher(true);
    expect(get().switcherOpen).toBe(true);
    expect(get().route).toEqual({ screen: "maps" });
  });
});
