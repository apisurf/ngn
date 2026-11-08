import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import { parseNextDecision } from "../src/runtime/timing.js";
import {
  createFakeClock,
  createGates,
  createHarness,
  hasLogLine,
  scheduleEvents,
  startScheduler,
  until,
  type FakeClock,
  type Harness,
} from "./helpers.js";
import { expectScheduleInvariants } from "./invariants.js";

const MIN = 60_000;
const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime();

let h: Harness;
let clock: FakeClock;
let scheduler: TaskLibraryScheduler | null;
let seen: unknown[];

beforeEach(async () => {
  h = await createHarness();
  clock = createFakeClock(T0);
  scheduler = null;
  seen = [];
  (globalThis as { __seen?: unknown[] }).__seen = seen;
});

afterEach(async () => {
  await scheduler?.stop({ graceMs: 0 });
  await expectScheduleInvariants(h);
  h.dispose();
});

async function start(sources: Record<string, string>, options = {}) {
  const started = await startScheduler(h, sources, { clock, random: () => 0.5, ...options });
  scheduler = started.scheduler;
  return started;
}

const PATH = "tasks/t.ts";

/** A task on `timing` whose `next` hook is `next`; it fails when `fail` is set. */
const withNext = (
  next: string,
  { timing = `{ every: "5m", min: "15s", max: "2h" }`, fail = false } = {},
) => `
export const timing = ${timing};
export const task = async () => {
  ${fail ? 'throw new Error("429 too many requests");' : ""}
  return { remaining: 312 };
};
export const next = ${next};`;

const firstDecision = async () => {
  await until(async () => (await scheduleEvents(h, PATH)).some((e) => e.event === "decided"));
  const decided = (await scheduleEvents(h, PATH)).find((e) => e.event === "decided")!;
  return {
    minutes: (decided.next_at! - decided.at) / MIN,
    seconds: (decided.next_at! - decided.at) / 1000,
    reason: decided.reason,
    source: decided.source,
  };
};

describe("the next hook", () => {
  it("is told how the tick went, with the final attempt's ctx", async () => {
    await start({
      [PATH]: withNext(
        `(outcome, ctx) => { globalThis.__seen.push({ ...outcome, error: outcome.error?.message, ctxRun: ctx.run.id }); }`,
        { fail: true },
      ),
    });
    await firstDecision();
    const [run] = await h.query<{ id: number }>("SELECT id FROM task_runs");
    expect(seen).toEqual([
      {
        status: "failure",
        result: undefined,
        error: "429 too many requests",
        skipReason: null,
        failedInARow: 1,
        previousDelayMs: 0,
        runId: run!.id,
        ctxRun: run!.id,
      },
    ]);
  });

  it.each([
    ["a duration string", `"30s"`, 30, "next hook: 30s"],
    ["milliseconds", `90_000`, 90, "next hook: 1m 30s"],
    ["min", `"min"`, 15, "next hook: min, 15s"],
    ["max", `"max"`, 7200, "next hook: max, 2h"],
    ["{ in, reason }", `{ in: "min", reason: "312 jobs left" }`, 15, "312 jobs left"],
  ])(
    "sets the next run from %s, measured from when the tick ended",
    async (_, value, seconds, reason) => {
      await start({ [PATH]: withNext(`() => (${value})`) });
      expect(await firstDecision()).toMatchObject({ seconds, reason, source: "hook" });
    },
  );

  it("takes `every` on the leading edge to mean the next grid slot", async () => {
    await start({ [PATH]: withNext(`() => "every"`) });
    clock.advance(MIN); // the tick ends a minute into its slot
    expect(await firstDecision()).toMatchObject({
      reason: "next hook: every 5 minutes",
      source: "hook",
    });
    const decided = (await scheduleEvents(h, PATH)).find((e) => e.event === "decided")!;
    expect(decided.next_at).toBe(T0 + 5 * MIN);
  });

  it("starts a new grid on the leading edge for anything but `every`", async () => {
    await start({ [PATH]: withNext(`() => "40s"`) });
    await firstDecision();
    const decided = (await scheduleEvents(h, PATH)).find((e) => e.event === "decided")!;
    expect(decided.anchor).toBe(decided.next_at);
  });

  it("keeps whatever it returns within [min, max], and says so", async () => {
    await start({ [PATH]: withNext(`() => ({ in: "1s", reason: "hurry" })`) });
    expect(await firstDecision()).toMatchObject({
      seconds: 15,
      reason: "hurry (1s kept to min 15s)",
    });
  });

  it("leaves the decision to the policy when it returns undefined", async () => {
    await start({ [PATH]: withNext(`() => undefined`, { fail: true }) });
    expect(await firstDecision()).toMatchObject({
      minutes: 10,
      reason: "backing off after a failure: 10m",
      source: "policy",
    });
  });

  it.each([
    ["throws", `() => { throw new Error("boom"); }`, "Failed in next: Error: boom"],
    ["returns something it may not", `() => "soon"`, 'Failed in next: Error: next returned "soon"'],
    [
      "takes too long",
      `() => new Promise(() => {})`,
      "Failed in next: Error: next took longer than 0.05s",
    ],
  ])("records a hook error and lets the policy decide when it %s", async (_, next, line) => {
    await start({ [PATH]: withNext(next) }, { nextTimeoutMs: 50 });
    expect(await firstDecision()).toMatchObject({ source: "policy", reason: "every 5 minutes" });
    expect(await hasLogLine(h, line)).toBe(true);
    // The run's outcome stands.
    const [run] = await h.query<{ status: string }>("SELECT status FROM task_runs");
    expect(run?.status).toBe("success");
  });

  it("is not called for a tick ngn interrupted", async () => {
    const gates = createGates();
    await start({
      [PATH]: `
        export const timing = { every: "5m" };
        export const task = () => globalThis.__gates.wait("never");
        export const next = () => { globalThis.__seen.push("called"); };`,
    });
    await until(() => gates.isWaiting("never"));
    await scheduler!.stop({ graceMs: 0 });
    scheduler = null;
    expect((await scheduleEvents(h, PATH)).map((e) => e.event)).toContain("interrupted");
    expect(seen).toEqual([]);
  });

  it("is not called for a tick that failed before it had a run", async () => {
    const task = await h.task(
      PATH,
      withNext(`() => { globalThis.__seen.push("called"); return "min"; }`),
    );
    await task.register();
    // The run's row cannot be written: the tick fails with no run to record it on.
    (task as unknown as { startRun: () => Promise<never> }).startRun = async () => {
      throw new Error("the database is gone");
    };
    const outcome = await task.executeTick({ next: { previousDelayMs: null } });
    expect(outcome).toMatchObject({ status: "failure", runId: null, next: null });
    expect(seen).toEqual([]);
  });

  it("fails at schedule time on a cron task, naming it", async () => {
    const { report } = await start({
      [PATH]: withNext(`() => "max"`, { timing: `"*/5 * * * *"` }),
    });
    expect(report.failed).toEqual([
      {
        path: PATH,
        reason:
          "next: only an interval task can choose its next run; a cron task runs on its pattern",
      },
    ]);
  });
});

describe("what next may return", () => {
  it.each([
    [undefined, undefined],
    ["30s", { delay: 30_000, reason: null }],
    [90_000, { delay: 90_000, reason: null }],
    ["every", { delay: "every", reason: null }],
    [
      { in: "max", reason: "empty" },
      { delay: "max", reason: "empty" },
    ],
    [{ in: "2m" }, { delay: 120_000, reason: null }],
  ])("takes %j", (value, parsed) => {
    expect(parseNextDecision(value)).toEqual(parsed);
  });

  it.each([null, "later", -5, { in: "5m", why: "x" }, { in: "fast" }, { in: "5m", reason: 3 }, []])(
    "refuses %j",
    (value) => {
      expect(() => parseNextDecision(value)).toThrow(/^next returned /);
    },
  );
});
