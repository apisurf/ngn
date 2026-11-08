import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import { resolveTiming } from "../src/runtime/timing.js";
import { backoffDelay, timingRule } from "../src/runtime/timingRule.js";
import {
  countEvents,
  createFakeClock,
  createHarness,
  eventNames,
  scheduleEvents,
  scheduleRow,
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
let schedulers: TaskLibraryScheduler[];

beforeEach(async () => {
  h = await createHarness();
  clock = createFakeClock(T0);
  schedulers = [];
});

afterEach(async () => {
  for (const scheduler of schedulers) await scheduler.stop({ graceMs: 0 });
  await expectScheduleInvariants(h);
  h.dispose();
});

/** No jitter: `random() * 2 - 1` is 0. */
const NO_JITTER = () => 0.5;

async function start(sources: Record<string, string>, options = {}) {
  const started = await startScheduler(h, sources, { clock, random: NO_JITTER, ...options });
  schedulers.push(started.scheduler);
  return started;
}

/** A task that fails or succeeds on each run as `plan` says, then succeeds. */
const planned = (timing: string, plan: Array<"fail" | "ok">) => `
export const timing = ${timing};
const plan = ${JSON.stringify(plan)};
export const task = async (ctx) => {
  const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
  await ctx.kv.set("n", String(n));
  if (plan[n - 1] === "fail") throw new Error("down");
  return n;
};`;

const decisions = async (path: string) =>
  (await scheduleEvents(h, path)).filter((e) => e.event === "decided");

const decided = (path: string, n: number) => until(async () => (await decisions(path)).length >= n);

/** Let the tick that is due run, and wait for its decision; returns the delay it chose, in minutes. */
async function nextDelay(path: string, n: number) {
  await decided(path, n);
  const last = (await decisions(path)).at(-1)!;
  return { minutes: (last.next_at! - last.at) / MIN, reason: last.reason, source: last.source };
}

describe("the default backoff policy", () => {
  it("multiplies the gap by `factor` per failed tick up to `max`, and goes back to `every` after one success", async () => {
    const path = "tasks/t.ts";
    await start({
      [path]: planned(`{ every: "1m", max: "10m", edge: "trailing" }`, [
        "fail",
        "fail",
        "fail",
        "fail",
        "ok",
      ]),
    });

    const gaps: number[] = [];
    for (let tick = 1; tick <= 5; tick++) {
      const { minutes } = await nextDelay(path, tick);
      gaps.push(minutes);
      clock.advance(minutes * MIN);
    }
    expect(gaps).toEqual([2, 4, 8, 10, 1]);

    const reasons = (await decisions(path)).map((e) => [e.source, e.reason]);
    expect(reasons).toEqual([
      ["policy", "backing off after a failure: 2m"],
      ["policy", "backing off after 2 failures in a row: 4m"],
      ["policy", "backing off after 3 failures in a row: 8m"],
      ["policy", "backing off after 4 failures in a row: 10m"],
      ["policy", "every minute, trailing"],
    ]);
  });

  it("keeps failures on `every` with `backoff: false`", async () => {
    const path = "tasks/t.ts";
    await start({
      [path]: planned(`{ every: "5m", edge: "trailing", backoff: false }`, ["fail", "fail"]),
    });
    expect((await nextDelay(path, 1)).minutes).toBe(5);
    clock.advance(5 * MIN);
    expect((await nextDelay(path, 2)).minutes).toBe(5);
  });

  it("starts a new grid on the leading edge: the success after a backoff runs `every` after it", async () => {
    const path = "tasks/t.ts";
    // The most jitter there is: 10m × 1.1.
    await start({ [path]: planned(`{ every: "5m" }`, ["fail", "ok"]) }, { random: () => 1 });

    const backoff = await nextDelay(path, 1);
    expect(backoff.minutes).toBe(11);
    expect((await scheduleRow(h, path))?.anchor).toBe(T0 + 11 * MIN);

    clock.advance(11 * MIN);
    await decided(path, 2);
    expect((await scheduleRow(h, path))?.next_at).toBe(T0 + 16 * MIN);
  });

  it("counts the streak from the run history, so a restart does not reset it", async () => {
    const path = "tasks/t.ts";
    const source = planned(`{ every: "1m", edge: "trailing" }`, ["fail", "fail", "fail"]);
    const first = await start({ [path]: source });
    expect((await nextDelay(path, 1)).minutes).toBe(2);
    clock.advance(2 * MIN);
    expect((await nextDelay(path, 2)).minutes).toBe(4);

    await first.scheduler.stop({ graceMs: 0 });
    schedulers.length = 0;
    await start({ [path]: source });
    // The stored next run is within what a streak of 2 allows, so it stands.
    expect(await eventNames(h, path)).not.toContain("reclamped");

    clock.advance(4 * MIN);
    expect(await nextDelay(path, 3)).toMatchObject({
      minutes: 8,
      reason: "backing off after 3 failures in a row: 8m",
    });
  });

  it("counts a recovered tick in the streak", async () => {
    const path = "tasks/t.ts";
    // Fails twice, then hangs until the process running it dies.
    const source = `
      export const timing = { every: "1m", edge: "trailing" };
      export const task = async (ctx) => {
        const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
        await ctx.kv.set("n", String(n));
        if (n <= 2) throw new Error("down");
        await new Promise(() => {});
      };`;
    const dead = await start({ [path]: source }, { leaseTtlMs: 100 });
    clock.advance((await nextDelay(path, 1)).minutes * MIN);
    clock.advance((await nextDelay(path, 2)).minutes * MIN);
    await until(async () => (await countEvents(h, path, "started")) === 3);
    dead.scheduler.abandon();
    schedulers.length = 0;

    await new Promise((resolve) => setTimeout(resolve, 150)); // its lease runs out
    await start({ [path]: source }, { leaseTtlMs: 100 });
    await until(async () => (await eventNames(h, path)).includes("recovered"));
    const recovered = (await scheduleEvents(h, path)).find((e) => e.event === "recovered");
    expect(recovered?.reason).toBe(
      "the process running it stopped; backing off after 3 failures in a row: 8m",
    );
  });
});

/** `timing`, resolved as the interval it must be. */
function interval(timing: object) {
  const resolved = resolveTiming(timing, "tasks/t.ts");
  if (resolved.kind !== "interval") throw new Error("expected an interval");
  return resolved;
}

describe("backoff's arithmetic", () => {
  it("keeps jitter within ±jitter of the delay, and the result within [min, max]", () => {
    const timing = interval({ every: "1m", max: "1h", backoff: { factor: 3, jitter: 0.2 } });
    for (let n = 1; n <= 6; n++) {
      const base = Math.min(60 * MIN, MIN * 3 ** n);
      for (let i = 0; i < 200; i++) {
        const delay = backoffDelay(timing, n, Math.random);
        expect(delay).toBeGreaterThanOrEqual(Math.max(timing.minMs, base * 0.8 - 1));
        expect(delay).toBeLessThanOrEqual(Math.min(timing.maxMs, base * 1.2 + 1));
      }
    }
    expect(backoffDelay(timing, 1, () => 0)).toBe(144_000);
    expect(backoffDelay(timing, 1, () => 1)).toBe(216_000);
  });

  it("leaves successes and skips to the schedule", () => {
    const timing = interval({ every: "5m", edge: "trailing" });
    const rule = timingRule(timing, { every: "5m", edge: "trailing" }, NO_JITTER);
    for (const status of ["success", "skipped"] as const) {
      expect(
        rule.decide({ plannedAt: T0, endedAt: T0, anchor: null, status, failedInARow: 4 }),
      ).toMatchObject({ nextAt: T0 + 5 * MIN });
    }
  });

  it("has defaults: min is every, max is every × 32, backoff doubles with 10% jitter", () => {
    expect(interval({ every: "5m" })).toMatchObject({
      minMs: 5 * MIN,
      maxMs: 160 * MIN,
      backoff: { factor: 2, jitter: 0.1 },
    });
  });

  it.each([
    [{ every: "5m", min: "500ms" }, "min must be at least 1s"],
    [{ every: "5m", min: "10m" }, "min must not be more than every"],
    [{ every: "5m", max: "1m" }, "every must not be more than max"],
    [{ every: "5m", backoff: { factor: 0.5 } }, "backoff.factor must be a number of at least 1"],
    [{ every: "5m", backoff: { jitter: 2 } }, "backoff.jitter must be a number from 0 to 1"],
    [{ every: "5m", backoff: { speed: 2 } }, "unknown backoff key speed"],
    [{ every: "5m", backoff: "fast" }, "backoff must be false or an object"],
  ])("refuses %j, naming the task", (timing, message) => {
    expect(() => resolveTiming(timing, "tasks/t.ts")).toThrow(
      `Invalid timing for tasks/t.ts: ${message}`,
    );
  });
});
