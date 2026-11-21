import { describe, expect, it } from "vitest";
import { Progress } from "./progress";

describe("Progress", () => {
  // 137 a screen that starts listening late is told at once how far the read has come
  it("tells a new listener what is done so far, and every step after", () => {
    const progress = new Progress();
    progress.engine(10, 20);
    progress.record();
    const told: unknown[] = [];
    const stop = progress.listen((loading) => told.push(loading));
    progress.file();
    stop();
    progress.zones(1, 2);
    expect(told).toEqual([{ engine: { done: 10, total: 20 }, records: 1, files: 0 },
      { engine: { done: 10, total: 20 }, records: 1, files: 1 }]);
  });
});
