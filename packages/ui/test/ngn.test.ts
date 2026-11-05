import { describe, expect, it } from "vitest";
import { parseStructured, prettyJson } from "../src/lib/json";
import { runTone, seriesSlot } from "../src/lib/ngn";

// The derivations ngnui shares with the CLI are tested where they live, in
// @apisurf/ngn-schema/describe. These are the parts only the UI has.

describe("tones", () => {
  it("gives each status a tone", () => {
    expect([
      runTone("success"),
      runTone("failure"),
      runTone("skipped"),
      runTone("running"),
    ]).toEqual(["ok", "bad", "neutral", "info"]);
  });

  it("gives a label the same colour slot every time", () => {
    expect(seriesSlot("fetch")).toBe(seriesSlot("fetch"));
    expect(seriesSlot("fetch")).toBeGreaterThanOrEqual(0);
    expect(seriesSlot("fetch")).toBeLessThan(8);
  });
});

describe("json", () => {
  it("parses objects and arrays, and leaves scalars as text", () => {
    expect(parseStructured('{"a":1}')).toEqual({ a: 1 });
    expect(parseStructured(" [1, 2] ")).toEqual([1, 2]);
    expect(parseStructured("42")).toBeUndefined();
    expect(parseStructured("{not json")).toBeUndefined();
  });

  it("pretty-prints what parses and returns the rest unchanged", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("plain")).toBe("plain");
  });
});
