import { describe, expect, it } from "vitest";
import {
  cronPeriodMs,
  isStalled,
  parseDuration,
  runStateLabel,
  runWindowMs,
  STALL_FACTOR,
  UNKNOWN_WINDOW_MS,
} from "../src/describe/index";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compiled code with the given literal exports, the way esbuild emits it. */
function compiled(exports: Record<string, string>): string {
  const names = Object.keys(exports);
  return [
    `__export(x_exports, { ${names.map((n) => `${n}: () => ${n}`).join(", ")} });`,
    ...names.map((n) => `  var ${n} = ${exports[n]};`),
  ].join("\n");
}

describe("parseDuration", () => {
  it.each([
    [1500, 1500],
    ["500ms", 500],
    ["30s", 30_000],
    ["4m", 4 * MIN],
    ["2h", 2 * HOUR],
    ["1d", DAY],
    ["250", 250],
  ] as const)("reads %s", (input, ms) => {
    expect(parseDuration(input)).toBe(ms);
  });

  it("refuses what is not a duration", () => {
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration(-1)).toBeNull();
  });
});

describe("cronPeriodMs", () => {
  it.each([
    ["*/5 * * * * *", 5000],
    ["* * * * * *", 1000],
    ["15 * * * * *", MIN],
    ["*/10 * * * *", 10 * MIN],
    ["0 * * * * *", MIN],
    ["0 30 * * * *", HOUR],
    ["0 0 9 * * *", DAY],
    ["0 30 9 * * *", DAY],
    ["0 0 0 * * *", DAY],
  ])("puts %s at %i ms apart", (pattern, ms) => {
    expect(cronPeriodMs(pattern)).toBe(ms);
  });

  it("has no steady period for weekday or uneven schedules", () => {
    expect(cronPeriodMs("0 0 9 * * 1-5")).toBeNull();
    expect(cronPeriodMs("0 0,30 * * * *")).toBeNull();
    expect(cronPeriodMs("nonsense")).toBeNull();
  });
});

describe("runWindowMs", () => {
  it("takes the larger of the budget and the period", () => {
    expect(runWindowMs(compiled({ timing: '"*/5 * * * *"' }))).toBe(5 * MIN);
    expect(runWindowMs(compiled({ timing: '"*/5 * * * *"', budget: '"20m"' }))).toBe(20 * MIN);
    expect(runWindowMs(compiled({ budget: '"3m"' }))).toBe(3 * MIN);
  });

  it("falls back to a day when neither can be read", () => {
    expect(runWindowMs(compiled({ timing: '"0 0 9 * * 1-5"' }))).toBe(UNKNOWN_WINDOW_MS);
    expect(runWindowMs(null)).toBe(UNKNOWN_WINDOW_MS);
  });
});

describe("isStalled", () => {
  const now = Date.UTC(2026, 10, 5);
  const open = (startedAgo: number) => ({
    status: "running",
    started_at: now - startedAgo,
    created_at: now - startedAgo,
    ended_at: null,
  });

  it("calls a run Stalled once it is past its window, twice over", () => {
    expect(STALL_FACTOR).toBe(2);
    expect(isStalled(open(9 * DAY), now, 5 * MIN)).toBe(true);
    expect(isStalled(open(11 * MIN), now, 5 * MIN)).toBe(true);
  });

  it("leaves a long run alone while it is still inside its window", () => {
    expect(isStalled(open(9 * MIN), now, 5 * MIN)).toBe(false);
    expect(isStalled(open(30 * HOUR), now, UNKNOWN_WINDOW_MS)).toBe(false);
  });

  it("calls a run Stalled at once when a lock it held stopped being renewed", () => {
    expect(isStalled(open(MIN), now, 5 * MIN, true)).toBe(true);
  });

  it("never calls a finished or skipped run Stalled", () => {
    expect(isStalled({ ...open(9 * DAY), ended_at: now }, now, MIN)).toBe(false);
    expect(isStalled({ ...open(9 * DAY), status: "skipped" }, now, MIN)).toBe(false);
  });

  it("reads as Stalled, or as the run's own status", () => {
    expect(runStateLabel("running", true)).toBe("Stalled");
    expect(runStateLabel("running", false)).toBe("Running");
  });
});
