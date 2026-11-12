import { afterEach, describe, expect, it, vi } from "vitest";
import { Meter, countFetches, sourceOf, speedText } from "./traffic";

class Channel {
  static posted: unknown[] = [];
  postMessage(message: unknown) { Channel.posted.push(message); }
}

const answering = (answer: () => Response) => ({ fetch: vi.fn(async () => answer()) as unknown as typeof fetch });

describe("traffic", () => {
  afterEach(() => {
    Channel.posted = [];
    vi.unstubAllGlobals();
  });

  // 46 the chip's two numbers: bytes a second over the last three seconds, each side its own
  it("averages each side's bytes over the last three seconds", () => {
    const meter = new Meter();
    meter.add("phone", 3000, 1000);
    meter.add("other", 600_000, 2000);
    meter.add("phone", 3000, 2500);
    expect(meter.speeds(3000)).toEqual({ phone: 2000, other: 200_000 });
    expect(meter.speeds(4500)).toEqual({ phone: 1000, other: 200_000 });
    expect(meter.speeds(9000)).toEqual({ phone: 0, other: 0 });
  });

  // 46 the phone is the page's own origin, whatever the path; anything else is another source
  it("tells the phone from other sources by the page's origin", () => {
    const page = "http://192.168.1.20:8765/maps/a";
    expect(sourceOf("/riki/v1/device", page)).toBe("phone");
    expect(sourceOf("http://192.168.1.20:8765/web/session", page)).toBe("phone");
    expect(sourceOf("https://192.168.1.20:8766/x", page)).toBe("other");
    expect(sourceOf("https://tiles.example.com/1/2/3.png", page)).toBe("other");
  });

  // 46 speeds read in KB/s, and MB/s from a thousand of them
  it("writes a speed in KB/s or MB/s", () => {
    expect(speedText(0)).toBe("0 KB/s");
    expect(speedText(340_400)).toBe("340 KB/s");
    expect(speedText(1_250_000)).toBe("1.3 MB/s");
  });

  // 46 an answer that says its length is counted by it, and still handed on untouched
  it("counts an answer by its Content-Length and hands it on", async () => {
    vi.stubGlobal("BroadcastChannel", Channel);
    const scope = answering(() => new Response("abc", { headers: { "content-length": "2048" } }));
    countFetches(scope, "test");
    const answer = await scope.fetch("https://tiles.test/1.pbf");
    expect(await answer.text()).toBe("abc");
    expect(Channel.posted).toEqual([{ url: "https://tiles.test/1.pbf", bytes: 2048 }]);
  });

  // 46 with no length said, the body itself is measured
  it("measures the body of an answer that says no length", async () => {
    vi.stubGlobal("BroadcastChannel", Channel);
    const scope = answering(() => new Response("12345"));
    countFetches(scope, "test");
    const answer = await scope.fetch("/riki/v1/device");
    await vi.waitFor(() => expect(Channel.posted).toEqual([{ url: "/riki/v1/device", bytes: 5 }]));
    expect(await answer.text()).toBe("12345");
  });

  // 46 its text alone must work in a worker: built from the text, with nothing of this module in reach
  it("works from its own text, as a worker runs it", async () => {
    const scope = answering(() => new Response("x", { headers: { "content-length": "7" } }));
    const run = new Function("self", "BroadcastChannel", `(${countFetches.toString()})(self, "test");`);
    run(scope, Channel);
    await scope.fetch("https://tiles.test/2.pbf");
    expect(Channel.posted).toEqual([{ url: "https://tiles.test/2.pbf", bytes: 7 }]);
  });
});
