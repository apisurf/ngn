import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
// A whole hour, so grid slots read as round clock times.
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

async function start(sources: Record<string, string>, options = {}) {
  const started = await startScheduler(h, sources, { clock, ...options });
  scheduler = started.scheduler;
  return started;
}

const runs = () =>
  h.query<{ id: number; status: string; retry_of: number | null; next_at: number | null }>(
    "SELECT id, status, retry_of, next_at FROM task_runs ORDER BY id",
  );

const runCount = async () => (await runs()).length;

/** The `started` events' times, relative to T0, in minutes. */
const startedAt = async (path: string) =>
  (await scheduleEvents(h, path))
    .filter((e) => e.event === "started")
    .map((e) => (e.at - T0) / MIN);

/** Wait until the task's latest tick has its decision stored. */
const decided = async (path: string, n: number) =>
  until(async () => (await eventNames(h, path)).filter((e) => e === "decided").length >= n);

/** A task that waits for gate `run<n>` on its nth run, so a test controls when each ends. */
const gated = (timing: string, extra = "") => `
export const timing = ${timing};
${extra}
export const task = async (ctx) => {
  const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
  await ctx.kv.set("n", String(n));
  await globalThis.__gates.wait("run" + n);
  return n;
};`;

describe("the trailing edge", () => {
  const TRAILING = `{ every: "5m", edge: "trailing" }`;

  it("runs on start, then `every` after each run ends, however long it took", async () => {
    const gates = createGates();
    await start({ "tasks/t.ts": gated(TRAILING) });

    await until(() => gates.isWaiting("run1"));
    clock.advance(2 * MIN); // a slow run
    gates.open("run1");
    await decided("tasks/t.ts", 1);
    expect((await scheduleRow(h, "tasks/t.ts"))?.next_at).toBe(T0 + 7 * MIN);

    clock.advance(4 * MIN);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await runCount()).toBe(1);

    clock.advance(1 * MIN);
    await until(() => gates.isWaiting("run2"));
    expect(await startedAt("tasks/t.ts")).toEqual([0, 7]);
    gates.open("run2");
    await decided("tasks/t.ts", 2);
  });

  it("measures from the end of a tick's final attempt, retries included", async () => {
    await start({
      "tasks/t.ts": `
        export const timing = { every: "5m", edge: "trailing" };
        export const retry = { attempts: 3 };
        export const task = async (ctx) => {
          const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
          await ctx.kv.set("n", String(n));
          if (n === 1) throw new Error("flaky");
          await globalThis.__gates.wait("retry");
        };`,
    });
    const gates = createGates();

    await until(() => gates.isWaiting("retry"));
    clock.advance(3 * MIN);
    gates.open("retry");
    await decided("tasks/t.ts", 1);

    const [first, retry] = await runs();
    expect(retry).toMatchObject({ status: "success", retry_of: first!.id });
    // The next run is recorded on the tick's final run.
    expect(retry!.next_at).toBe(T0 + 8 * MIN);
    expect(first!.next_at).toBeNull();
  });

  it("waits for a Run now run in progress instead of starting beside it, and records no skip", async () => {
    const gates = createGates();
    const { scheduler: running } = await start({ "tasks/t.ts": gated(TRAILING) });
    gates.open("run1");
    await decided("tasks/t.ts", 1);

    expect(await running.runNow("tasks/t.ts")).toEqual({ started: true });
    await until(() => gates.isWaiting("run2"));
    clock.advance(6 * MIN); // the scheduled run comes due during it
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await runs()).map((r) => r.status)).toEqual(["success", "running"]);

    gates.open("run2");
    await until(() => gates.isWaiting("run3"));
    expect((await runs()).map((r) => r.status)).toEqual(["success", "success", "running"]);
    gates.open("run3");
    await decided("tasks/t.ts", 2);
    expect(await eventNames(h, "tasks/t.ts")).toEqual([
      "scheduled",
      "started",
      "decided",
      "started",
      "ended",
      "started",
      "decided",
    ]);
  });

  it("gives a run no nextAt, and a deadline of its budget, or of `every` without one", async () => {
    await start({
      "tasks/plain.ts": recorder(""),
      "tasks/budget.ts": recorder(`export const budget = "30s";`),
    });
    await until(
      async () => (await h.query("SELECT 1 FROM task_runs WHERE status = 'success'")).length === 2,
    );
    const results = await h.query<{ path: string; result: string }>(
      "SELECT t.path, r.result FROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id ORDER BY t.path",
    );
    expect(results.map((r) => [r.path, JSON.parse(r.result)])).toEqual([
      ["tasks/budget.ts", { nextAt: null, deadline: 30_000 }],
      ["tasks/plain.ts", { nextAt: null, deadline: 5 * MIN }],
    ]);
  });

  it("applies a change to `every` from the next decision, without a restart", async () => {
    (globalThis as Record<string, unknown>).__every = "5m";
    await start({
      "tasks/t.ts": `
        export const timing = { every: globalThis.__every, edge: "trailing" };
        export const task = async () => {};`,
    });
    await decided("tasks/t.ts", 1);
    expect((await scheduleRow(h, "tasks/t.ts"))?.next_at).toBe(T0 + 5 * MIN);

    (globalThis as Record<string, unknown>).__every = "1m";
    clock.advance(5 * MIN);
    await decided("tasks/t.ts", 2);
    expect(await scheduleRow(h, "tasks/t.ts")).toMatchObject({
      next_at: T0 + 6 * MIN,
      reason: "every minute, trailing",
    });
  });

  it("starts a run that fell due during a sleep as soon as the clock is read again", async () => {
    await start({
      "tasks/t.ts": `export const timing = { every: "2h", edge: "trailing" }; export const task = async () => {};`,
    });
    await decided("tasks/t.ts", 1);
    // The machine sleeps through the next run: no timer fires, then the clock has jumped.
    clock.set(T0 + 5 * 60 * MIN);
    await decided("tasks/t.ts", 2);
    expect(await startedAt("tasks/t.ts")).toEqual([0, 300]);
  });
});

/** A trailing task that returns the window its run got. */
const recorder = (budget: string) => `
  export const timing = { every: "5m", edge: "trailing" };
  ${budget}
  export const task = async (ctx) => ({ nextAt: ctx.run.nextAt, deadline: ctx.run.deadline - ctx.run.scheduledAt });`;

/** A task that does nothing, on `timing`. */
const task = (timing: string, extra = "") =>
  `export const timing = ${timing}; ${extra} export const task = async () => {};`;

describe("validation", () => {
  it("refuses a bad interval timing at schedule time, naming what is wrong", async () => {
    const { report } = await start({
      "tasks/key.ts": task(`{ every: "5m", min: "1m", cadence: 2 }`),
      "tasks/duration.ts": task(`{ every: "5 minutes" }`),
      "tasks/short.ts": task(`{ every: "500ms" }`),
      "tasks/edge.ts": task(`{ every: "5m", edge: "middle" }`),
      "tasks/overlap.ts": task(`{ every: "5m" }`, `export const overlap = "allow";`),
      "tasks/breaker.ts": task(
        `{ every: "5m" }`,
        `export const retry = { breaker: { after: 3 } };`,
      ),
      "tasks/ok.ts": task(`{ every: "5m", edge: "trailing" }`),
    });

    expect(report.scheduled).toEqual([
      { path: "tasks/ok.ts", timing: { every: "5m", edge: "trailing" } },
    ]);
    expect(Object.fromEntries(report.failed.map((f) => [f.path, f.reason]))).toEqual({
      "tasks/breaker.ts":
        "retry.breaker: an interval task does not skip ticks; remove the breaker and use timing.backoff, which slows a failing interval task down",
      "tasks/duration.ts": expect.stringContaining('Invalid timing.every "5 minutes"'),
      "tasks/edge.ts": 'Invalid timing: edge must be "leading" or "trailing", got "middle"',
      "tasks/key.ts": "Invalid timing: unknown key cadence",
      "tasks/overlap.ts": expect.stringContaining(
        'overlap "allow": ngn runs one run of a task at a time',
      ),
      "tasks/short.ts": "Invalid timing: every must be at least 1s",
    });
  });
});

describe("the leading edge", () => {
  const LEADING = `{ every: "5m" }`;

  it("runs on a grid from the first run's start, however long each run takes", async () => {
    const gates = createGates();
    await start({ "tasks/l.ts": gated(LEADING) });
    expect((await scheduleRow(h, "tasks/l.ts"))?.anchor).toBe(T0);

    for (const n of [1, 2, 3]) {
      await until(() => gates.isWaiting(`run${n}`));
      clock.advance(2 * MIN);
      gates.open(`run${n}`);
      await decided("tasks/l.ts", n);
      clock.advance(3 * MIN);
    }
    await until(() => gates.isWaiting("run4"));
    expect(await startedAt("tasks/l.ts")).toEqual([0, 5, 10, 15]);
    gates.open("run4");
    await decided("tasks/l.ts", 4);
  });

  it("follows a run that overran its slot with the first slot after it ended, saying by how much", async () => {
    const gates = createGates();
    await start({ "tasks/l.ts": gated(LEADING) });

    await until(() => gates.isWaiting("run1"));
    clock.advance(7 * MIN); // past the 5m slot
    gates.open("run1");
    await decided("tasks/l.ts", 1);
    expect(await scheduleRow(h, "tasks/l.ts")).toMatchObject({
      next_at: T0 + 10 * MIN,
      reason: "ran 2m past its slot; next slot 10:10:00",
    });

    clock.advance(3 * MIN);
    await until(() => gates.isWaiting("run2"));
    clock.advance(17 * MIN); // past three slots
    gates.open("run2");
    await decided("tasks/l.ts", 2);
    expect(await scheduleRow(h, "tasks/l.ts")).toMatchObject({
      next_at: T0 + 30 * MIN,
      reason: "ran 12m past its slot; next slot 10:30:00",
    });
    // Missed slots are neither made up nor recorded as skipped runs.
    expect((await runs()).map((r) => r.status)).toEqual(["success", "success"]);
  });

  it("gives a run its next slot as nextAt, the deadline before it, and keeps retries inside it", async () => {
    await start({
      "tasks/l.ts": `
        export const timing = { every: "5m" };
        export const retry = { attempts: 5, delay: "6m" };
        export const task = async (ctx) => {
          await ctx.kv.set("window", JSON.stringify({ nextAt: ctx.run.nextAt, deadline: ctx.run.deadline }));
          throw new Error("down");
        };`,
    });
    await decided("tasks/l.ts", 1);
    const [stored] = await h.query<{ value: string }>("SELECT value FROM kvs WHERE key = 'window'");
    expect(JSON.parse(stored!.value)).toEqual({
      nextAt: T0 + 5 * MIN,
      deadline: T0 + 5 * MIN - 5_000,
    });
    // A 6m retry would start after the next slot, so there is none.
    expect(await runCount()).toBe(1);
  });

  it("catches up once after downtime that missed slots, then carries on the original grid", async () => {
    await start({
      "tasks/l.ts": `export const timing = { every: "5m" }; export const task = async () => {};`,
    });
    await decided("tasks/l.ts", 1);
    await scheduler!.stop();

    // ngn is down from 10:00 to 10:23.
    clock.set(T0 + 23 * MIN);
    await start({
      "tasks/l.ts": `export const timing = { every: "5m" }; export const task = async () => {};`,
    });
    await decided("tasks/l.ts", 2);

    const events = await scheduleEvents(h, "tasks/l.ts");
    expect(events.map((e) => [e.event, e.origin])).toEqual([
      ["scheduled", null],
      ["started", "scheduled"],
      ["decided", null],
      ["overdue", null],
      ["started", "catch-up"],
      ["decided", null],
    ]);
    expect(events[3]).toMatchObject({ previous_next_at: T0 + 5 * MIN, next_at: T0 + 23 * MIN });
    expect((await scheduleRow(h, "tasks/l.ts"))?.next_at).toBe(T0 + 25 * MIN);
  });

  it("waits for a next run still to come after a restart, writing nothing", async () => {
    const source = `export const timing = { every: "5m" }; export const task = async () => {};`;
    await start({ "tasks/l.ts": source });
    await decided("tasks/l.ts", 1);
    await scheduler!.stop();

    clock.set(T0 + 2 * MIN);
    await start({ "tasks/l.ts": source });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await eventNames(h, "tasks/l.ts")).toEqual(["scheduled", "started", "decided"]);
    clock.advance(3 * MIN);
    await decided("tasks/l.ts", 2);
    expect(await startedAt("tasks/l.ts")).toEqual([0, 5]);
  });

  it("reclamps a next run further off than the timing allows, after the clock went back", async () => {
    const source = `export const timing = { every: "5m" }; export const task = async () => {};`;
    await start({ "tasks/l.ts": source });
    await decided("tasks/l.ts", 1);
    await scheduler!.stop();

    clock.set(T0 - 2 * 60 * MIN); // the clock went back two hours
    await start({ "tasks/l.ts": source });
    const events = await scheduleEvents(h, "tasks/l.ts");
    expect(events.at(-1)).toMatchObject({
      event: "reclamped",
      previous_next_at: T0 + 5 * MIN,
      next_at: T0 - 2 * 60 * MIN + 5 * MIN,
    });
  });
});
