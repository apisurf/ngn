import { describe, expect, it } from "vitest";
import {
  describeDecision,
  nextReason,
  describeDuration,
  describeEvent,
  describeNext,
  describeTiming,
  foldSchedule,
  formatClock,
  invalidStep,
  runWindowMs,
  timingOf,
  timingPeriodMs,
  timingSource,
} from "../src/describe/index";

const MIN = 60_000;

/** A task's compiled code the way esbuild emits it, with these exports. */
function compiled(exports: Record<string, string>): string {
  const names = Object.keys(exports);
  return [
    `__export(t_exports, { ${names.map((n) => `${n}: () => ${n}`).join(", ")} });`,
    ...names.map((n) => `var ${n} = ${exports[n]};`),
  ].join("\n");
}

describe("timingOf", () => {
  it("reads a cron pattern or an interval literal out of compiled code", () => {
    expect(timingOf(compiled({ timing: '"*/5 * * * *"' }))).toBe("*/5 * * * *");
    expect(timingOf(compiled({ timing: '{\n  every: "5m",\n  edge: "trailing"\n}' }))).toEqual({
      every: "5m",
      edge: "trailing",
    });
    expect(timingOf(compiled({ timing: "computeIt()" }))).toBeNull();
    expect(timingOf(null)).toBeNull();
  });
});

describe("describeTiming", () => {
  it.each([
    ["*/5 * * * *", "every 5 minutes"],
    ["0 0 9 * * 1-5", "0 0 9 * * 1-5"],
    [{ every: "5m" }, "every 5 minutes"],
    [{ every: "5h", edge: "leading" }, "every 5 hours"],
    [{ every: "5h", edge: "trailing" }, "every 5 hours, trailing"],
    [{ every: 90_000 }, "every 90 seconds"],
    [{ every: "1h" }, "every hour"],
  ] as const)("puts %j as %j", (timing, words) => {
    expect(describeTiming(timing)).toBe(words);
  });

  it("shows how the timing was written, for a tooltip", () => {
    expect(timingSource("*/5 * * * *")).toBe('"*/5 * * * *"');
    expect(timingSource({ every: "5m", edge: "trailing" })).toBe(
      '{ every: "5m", edge: "trailing" }',
    );
  });

  it("reads a duration in the biggest unit that divides it", () => {
    expect([1_000, 90_000, 2 * 3_600_000, 86_400_000, 1_500].map(describeDuration)).toEqual([
      "1 second",
      "90 seconds",
      "2 hours",
      "1 day",
      "1500 milliseconds",
    ]);
  });
});

describe("the stall window of an interval task", () => {
  it("is its `every`, or its budget when that is longer", () => {
    expect(timingPeriodMs({ every: "10m" })).toBe(10 * MIN);
    expect(runWindowMs(compiled({ timing: '{ every: "10m" }' }))).toBe(10 * MIN);
    expect(runWindowMs(compiled({ timing: '{ every: "10m" }', budget: '"30m"' }))).toBe(30 * MIN);
  });
});

describe("describeNext", () => {
  const NOW = 1_000_000;
  it.each([
    [{ state: "waiting", next_at: NOW + 4 * MIN, reason: null }, "in 4m"],
    [{ state: "waiting", next_at: NOW - 2 * MIN, reason: null }, "overdue"],
    [{ state: "waiting", next_at: NOW - 1_000, reason: null }, "now"],
    [{ state: "running", next_at: NOW, reason: null }, "running"],
    [{ state: "blocked", next_at: NOW, reason: null }, "blocked"],
    [{ state: "paused", next_at: null, reason: null }, "paused"],
  ])("says %j as %j", (row, words) => {
    expect(describeNext(row, NOW)).toBe(words);
  });

  it("says nothing for a task with no schedule", () => {
    expect(describeNext(null, NOW)).toBe("—");
  });
});

/** An event as the log stores it, with the row it left. */
const step = (event: string, from: string | null, to: string, next_at = 1) => ({
  event,
  from_state: from,
  to_state: to,
  next_at,
  reason: null,
  source: "policy",
  holder: null,
  anchor: null,
  request: null,
});

describe("the schedule log", () => {
  it("folds to the row as its last event left it", () => {
    const events = [
      step("scheduled", null, "waiting", 1),
      step("started", "waiting", "running", 1),
    ];
    expect(foldSchedule(events)).toMatchObject({ state: "running", next_at: 1 });
    expect(foldSchedule([])).toBeNull();
  });

  it("finds the first event that is not a path through the state table", () => {
    const ok = [
      step("scheduled", null, "waiting"),
      step("started", "waiting", "running"),
      step("decided", "running", "waiting"),
    ];
    expect(invalidStep(ok)).toBeNull();
    const bad = [step("scheduled", null, "waiting"), step("decided", "waiting", "waiting")];
    expect(invalidStep(bad)).toBe(bad[1]);
  });

  it("puts each event into words", () => {
    const base = {
      origin: null,
      next_at: 10 * MIN,
      previous_next_at: null,
      reason: "every 5 minutes",
      source: "policy",
      holder: "4242:abc",
      first_run_id: 40,
      run_id: 41,
    };
    expect(describeEvent({ ...base, event: "decided" })).toBe(
      `decided (runs #40–#41): next ${formatClock(10 * MIN)}, every 5 minutes`,
    );
    expect(describeEvent({ ...base, event: "started", origin: "catch-up" })).toBe(
      "started (catch-up) in process 4242",
    );
    expect(describeEvent({ ...base, event: "blocked", first_run_id: null })).toBe(
      "blocked: due, but run #41 in process 4242 holds the task",
    );
    expect(describeDecision(10 * MIN, "every 5 minutes")).toBe(
      `next run ${formatClock(10 * MIN)}: every 5 minutes`,
    );
  });

  it("says who chose a next run when it was not the policy", () => {
    expect(describeDecision(10 * MIN, "312 jobs left", "hook")).toBe(
      `next run ${formatClock(10 * MIN)}, set by the next hook: 312 jobs left`,
    );
    expect(describeDecision(10 * MIN, "moved", "policy")).toBe(
      `next run ${formatClock(10 * MIN)}: moved`,
    );
    expect(
      describeEvent({
        event: "decided",
        origin: null,
        next_at: 10 * MIN,
        previous_next_at: null,
        reason: "312 jobs left",
        source: "hook",
        holder: null,
        first_run_id: null,
        run_id: 41,
      }),
    ).toBe(`decided (run #41): next ${formatClock(10 * MIN)}, set by the next hook, 312 jobs left`);
  });

  it("gives a next run's reason only when the schedule does not already explain it", () => {
    expect(nextReason({ reason: "every 5 minutes" }, "every 5 minutes")).toBeNull();
    expect(nextReason({ reason: "first run" }, "every 5 minutes")).toBeNull();
    expect(nextReason(null, "every 5 minutes")).toBeNull();
    expect(
      nextReason({ reason: "backing off after 3 failures in a row: 40m" }, "every 5 minutes"),
    ).toBe("backing off after 3 failures in a row: 40m");
  });
});
