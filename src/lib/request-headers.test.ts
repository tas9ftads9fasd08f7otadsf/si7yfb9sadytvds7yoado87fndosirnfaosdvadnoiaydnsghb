import { afterEach, describe, expect, it } from "vitest";
import { requestHeaders, setRequestHeaders } from "./request-headers";

// 177 the map's requests carry a layer's header keys to that layer's host only
describe("the requests' header keys", () => {
  afterEach(() => setRequestHeaders({}));

  it("go to their own host in any case, and to no other or a malformed address", () => {
    setRequestHeaders({ "Tiles.Example.com": { "X-Api-Key": "secret-1" } });
    expect(requestHeaders("https://tiles.example.com/1/2/3.png")).toEqual({ "X-Api-Key": "secret-1" });
    expect(requestHeaders("https://TILES.example.com/x")).toEqual({ "X-Api-Key": "secret-1" });
    expect(requestHeaders("https://other.example.com/1/2/3.png")).toBeUndefined();
    expect(requestHeaders("not an address")).toBeUndefined();
  });

  it("are replaced whole by the next set", () => {
    setRequestHeaders({ "a.example": { k: "1" } });
    setRequestHeaders({ "b.example": { k: "2" } });
    expect(requestHeaders("https://a.example/")).toBeUndefined();
    expect(requestHeaders("https://b.example/")).toEqual({ k: "2" });
  });
});
