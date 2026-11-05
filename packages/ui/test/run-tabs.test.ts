import { describe, expect, it } from "vitest";
import { defaultRunTab, hasContent, pickRunTab, type RunContent } from "../src/lib/run-tabs";

const quiet: RunContent = { failed: false, taskLines: 0, timings: 0, hasResult: false };

describe("run tabs", () => {
  it("opens a failed run on what it logged", () => {
    expect(defaultRunTab({ ...quiet, failed: true, taskLines: 3 })).toBe("logs");
  });

  it("opens a run that logged or timed something on its timeline", () => {
    expect(defaultRunTab({ ...quiet, taskLines: 2 })).toBe("timeline");
    expect(defaultRunTab({ ...quiet, timings: 1, hasResult: true })).toBe("timeline");
  });

  it("opens a quiet run on its result, else its details", () => {
    expect(defaultRunTab({ ...quiet, hasResult: true })).toBe("result");
    expect(defaultRunTab(quiet)).toBe("details");
    expect(defaultRunTab({ ...quiet, failed: true })).toBe("details");
  });

  it("knows which tabs are empty", () => {
    expect(hasContent("timeline", quiet)).toBe(false);
    expect(hasContent("result", quiet)).toBe(false);
    expect(hasContent("details", quiet)).toBe(true);
  });

  it("honours a tab asked for by name, even an empty one", () => {
    expect(pickRunTab(quiet, "timings", undefined)).toBe("timings");
  });

  it("keeps a carried tab only where this run has something", () => {
    expect(pickRunTab({ ...quiet, timings: 2 }, undefined, "timings")).toBe("timings");
    expect(pickRunTab({ ...quiet, hasResult: true }, undefined, "timings")).toBe("result");
  });
});
