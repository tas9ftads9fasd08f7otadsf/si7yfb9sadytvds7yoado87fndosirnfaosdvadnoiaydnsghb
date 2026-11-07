import { describe, expect, it } from "vitest";
import { featureRows, featureTitle } from "./feature";
import { groundID } from "./ground";
import { savedName, typedKey } from "./phone";
import { ENGLISH, filledIn, listed, readPhoneWords } from "./words";

describe("features", () => {
  it("takes the app's name first, and skips a blank one", () => {
    expect(featureTitle({ name: "B", riki_name: "A" })).toBe("A");
    expect(featureTitle({ riki_name: "  ", NAME: "C" })).toBe("C");
    expect(featureTitle({ other: 1 })).toBe("");
  });
  it("lists at most forty rows, none of the app's own or blank", () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`k${index}`, index]));
    expect(featureRows(many)).toHaveLength(40);
    expect(featureRows({ riki_x: 1, blank: " ", none: null, kept: 0 })).toEqual([["kept", "0"]]);
  });
});

describe("the map's ground", () => {
  it("flips the id's tail, as the phone does", () => {
    expect(groundID("6f1e2a10-0000-4000-8000-000000000001")).toBe("6F1E2A10-0000-4000-8000-000000005AA4");
  });
});

describe("what is typed and saved", () => {
  it("reads a password with any case or gaps", () => {
    expect(typedKey("7q4-k 29")).toBe("7Q4K29");
  });
  it("prefers the UTF-8 file name", () => {
    expect(savedName(`attachment; filename="a.mapson"; filename*=UTF-8''Pre%C5%A1ov.mapson`)).toBe("Prešov.mapson");
    expect(savedName(`attachment; filename="a.mapson"`)).toBe("a.mapson");
    expect(savedName("")).toBe("Map.mapson");
  });
});

describe("words", () => {
  it("keeps English for what the phone does not say", () => {
    const said = readPhoneWords({ language: "sk", words: { maps: "Mapy" } });
    expect(said?.language).toBe("sk");
    expect(said?.words.maps).toBe("Mapy");
    expect(said?.words.close).toBe(ENGLISH.close);
  });
  it("refuses an answer that is not words", () => {
    expect(readPhoneWords(null)).toBeNull();
    expect(readPhoneWords({ language: "sk" })).toBeNull();
  });
  it("fills slots and splits lists", () => {
    expect(filledIn("Needs {version}", "version", "1.2")).toBe("Needs 1.2");
    expect(listed("a,,b")).toEqual(["a", "b"]);
    expect(listed(undefined)).toEqual([]);
  });
});
