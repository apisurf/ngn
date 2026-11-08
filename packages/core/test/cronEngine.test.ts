// The DST changes the spec names are Europe's: 29 March and 25 October 2026.
process.env.TZ = "Europe/Zagreb";

import { Cron } from "croner";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTiming } from "../src/runtime/timing.js";
import { timingRule } from "../src/runtime/timingRule.js";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import {
  createFakeClock,
  createGates,
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

/**
 * What `ngn run` fired on before the engine: croner's own scheduler, which
 * after each run asks `nextRun(currentRun)`. (Its `nextRuns()` is not the
 * same: it repeats a slot after the spring change.)
 */
const croner = (pattern: string, from: Date, n: number) => {
  const cron = new Cron(pattern, { mode: "5-or-6-parts", paused: true });
  const fired: number[] = [];
  let at: Date | null = from;
  while (fired.length < n && (at = cron.nextRun(at))) fired.push(at.getTime());
  return fired;
};

/** What the engine fires on: each tick ends at once, and the next is the first slot that fits. */
const engine = (pattern: string, from: Date, n: number) => {
  const rule = timingRule(resolveTiming(pattern, "t.ts"), pattern);
  const fired: number[] = [];
  let at = rule.first(from.getTime()).nextAt;
  while (fired.length < n) {
    fired.push(at);
    at = rule.decide({ plannedAt: at, endedAt: at + 1, anchor: null }).nextAt;
  }
  return fired;
};

const local = (times: number[]) => times.map((t) => new Date(t).toString().slice(0, 33));

describe("cron slots", () => {
  const PATTERNS = [
    "*/20 * * * * *", // seconds first
    "*/30 * * * *", // minutes first
    "0 30 1-3 * * *", // a range across the missing and repeated hours
    "0 0 2 * * *", // the hour that does not exist on 29 March
    "15,45 */2 * * *", // a list and a step
    "0 9 13 * 5", // day of month or day of week, croner's default
  ];

  it.each([
    ["the spring change", new Date(2026, 2, 28, 22, 0, 0)],
    ["the autumn change", new Date(2026, 9, 24, 22, 0, 0)],
  ])("fire where croner's own scheduler fired them, across %s", (_, from) => {
    for (const pattern of PATTERNS) {
      expect(engine(pattern, from, 60), pattern).toEqual(croner(pattern, from, 60));
    }
  });

  it("move a slot in the hour that does not exist forward, and fire once in the hour that repeats", () => {
    expect(local(engine("0 30 2 * * *", new Date(2026, 2, 28, 12), 2))).toEqual([
      "Sun Mar 29 2026 03:30:00 GMT+0200",
      "Mon Mar 30 2026 02:30:00 GMT+0200",
    ]);
    expect(local(engine("0 */30 * * * *", new Date(2026, 9, 25, 1, 59), 4))).toEqual([
      "Sun Oct 25 2026 02:00:00 GMT+0200",
      "Sun Oct 25 2026 02:30:00 GMT+0200",
      "Sun Oct 25 2026 03:00:00 GMT+0100",
      "Sun Oct 25 2026 03:30:00 GMT+0100",
    ]);
  });
});

describe("cron tasks on the engine", () => {
  const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime();
  let h: Harness;
  let clock: FakeClock;
  let scheduler: TaskLibraryScheduler | null;

  beforeEach(async () => {
    h = await createHarness();
    clock = createFakeClock(T0);
    scheduler = null;
  });

  afterEach(async () => {
    await scheduler?.stop({ graceMs: 0 });
    await expectScheduleInvariants(h);
    h.dispose();
  });

  async function start(sources: Record<string, string>) {
    const started = await startScheduler(h, sources, { clock });
    scheduler = started.scheduler;
    return started;
  }

  const decidedCount = async () =>
    (await eventNames(h, "tasks/c.ts")).filter((e) => e === "decided").length;

  const statuses = async () =>
    (await h.query<{ status: string }>("SELECT status FROM task_runs ORDER BY id")).map(
      (r) => r.status,
    );

  it("waits for the pattern's first slot, then follows it", async () => {
    await start({
      "tasks/c.ts": `export const timing = "0 */5 * * * *"; export const task = async () => {};`,
    });
    expect(await scheduleRow(h, "tasks/c.ts")).toMatchObject({
      state: "waiting",
      next_at: T0 + 5 * MIN,
    });
    clock.advance(5 * MIN);
    await until(async () => (await decidedCount()) === 1);
    expect((await scheduleRow(h, "tasks/c.ts"))?.next_at).toBe(T0 + 10 * MIN);
  });

  it("follows a run that overran with the first slot after it ended, recording no skipped runs", async () => {
    const gates = createGates();
    await start({
      "tasks/c.ts": `export const timing = "0 */5 * * * *";
        export const task = async () => { await globalThis.__gates.wait("slow"); };`,
    });
    clock.advance(5 * MIN);
    await until(() => gates.isWaiting("slow"));
    clock.advance(12 * MIN); // past the slots at 10:10 and 10:15
    gates.open("slow");
    await until(async () => (await decidedCount()) === 1);

    expect(await scheduleRow(h, "tasks/c.ts")).toMatchObject({
      next_at: T0 + 20 * MIN,
      reason: "ran past 2 slots; next 10:20:00",
    });
    expect(await statuses()).toEqual(["success"]);
  });

  it("skips to the next slot after downtime, logging the miss, with no catch-up run", async () => {
    const source = `export const timing = "0 */5 * * * *"; export const task = async () => {};`;
    await start({ "tasks/c.ts": source });
    await scheduler!.stop();
    clock.set(T0 + 23 * MIN);
    await start({ "tasks/c.ts": source });

    const events = await scheduleEvents(h, "tasks/c.ts");
    expect(events.at(-1)).toMatchObject({
      event: "overdue",
      previous_next_at: T0 + 5 * MIN,
      next_at: T0 + 25 * MIN,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await statuses()).toEqual([]);
  });

  it("keeps the breaker's skipped runs, each a claimed tick of its own", async () => {
    await start({
      "tasks/c.ts": `export const timing = "0 */5 * * * *";
        export const retry = { breaker: { after: 1 } };
        export const task = async () => { throw new Error("down"); };`,
    });
    for (let n = 1; n <= 2; n++) {
      clock.advance(5 * MIN);
      await until(async () => (await decidedCount()) === n);
    }
    expect(await statuses()).toEqual(["failure", "skipped"]);
    const [skip] = await h.query<{ skip_reason: string; next_at: number }>(
      "SELECT skip_reason, next_at FROM task_runs WHERE status = 'skipped'",
    );
    expect(skip).toEqual({
      skip_reason: "circuit open after repeated failures",
      next_at: T0 + 15 * MIN,
    });
    expect(await eventNames(h, "tasks/c.ts")).toEqual([
      "scheduled",
      "started",
      "decided",
      "started",
      "decided",
    ]);
  });
});
