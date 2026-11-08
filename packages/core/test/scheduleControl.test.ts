import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScheduleStore } from "../src/db/services/schedule.js";
import { LockService } from "../src/db/services/lock.js";
import { TaskLease } from "../src/runtime/lease.js";
import { controlSchedule, type ScheduleCommand } from "../src/runtime/scheduleControl.js";
import { runOnce } from "../src/runtime/taskSchedule.js";
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
const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime();
const PATH = "tasks/t.ts";

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

/** A task that waits for gate `run<n>` on its nth run. */
const gated = (timing: string) => `
export const timing = ${timing};
export const task = async (ctx) => {
  const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
  await ctx.kv.set("n", String(n));
  await globalThis.__gates.wait("run" + n);
  return n;
};`;

async function start(source: string) {
  const started = await startScheduler(h, { [PATH]: source }, { clock, random: () => 0.5 });
  scheduler = started.scheduler;
  return started;
}

async function taskId() {
  const [row] = await h.query<{ id: number }>("SELECT id FROM file_tasks WHERE path = ?", [PATH]);
  return row!.id;
}

/** What `ngn pause`, `resume` or `next` does, as the CLI calls it. */
async function command(
  cmd: ScheduleCommand,
  { pattern = null as string | null, store = new ScheduleStore(h.db) } = {},
) {
  return controlSchedule(
    { store, taskId: await taskId(), name: "t", pattern, now: clock.now() },
    cmd,
  );
}

const PAUSE = { kind: "pause" } as const;
const RESUME = { kind: "resume" } as const;
const next = (delayMs: number) => ({ kind: "next", delayMs }) as const;

const decided = (n: number) =>
  until(async () => (await eventNames(h, PATH)).filter((e) => e === "decided").length >= n);

const runCount = async () =>
  (await h.query<{ n: number }>("SELECT COUNT(*) AS n FROM task_runs"))[0]!.n;

/** Move the fake clock on by `ms`, then let the scheduler's loop take a few steps. */
async function steps(ms = 0) {
  clock.advance(ms);
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    clock.advance(1_000);
  }
}

describe("while the task waits", () => {
  it("pause holds it: no runs, nothing recorded, until resume runs what came due meanwhile", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);

    expect(await command(PAUSE)).toMatchObject({ applied: true, event: "paused" });
    await steps(10 * MIN);
    expect(await runCount()).toBe(1);
    expect((await scheduleRow(h, PATH))?.state).toBe("paused");

    const resumed = await command(RESUME);
    expect(resumed).toMatchObject({ applied: true, event: "resumed" });
    expect((await scheduleRow(h, PATH))?.next_at).toBe(clock.now());
    gates.open("run2");
    await decided(2);
    expect(await eventNames(h, PATH)).toEqual([
      "scheduled",
      "started",
      "decided",
      "paused",
      "resumed",
      "started",
      "decided",
    ]);
  });

  it("resume keeps a next run that has not come yet", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);
    await command(PAUSE);
    await command(RESUME);
    expect((await scheduleRow(h, PATH))?.next_at).toBe(T0 + 5 * MIN);
  });

  it("resume and a second pause say there is nothing to do", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);
    expect(await command(RESUME)).toEqual({
      applied: false,
      error: false,
      message: "t isn't paused (waiting)",
    });
    await command(PAUSE);
    expect(await command(PAUSE)).toEqual({
      applied: false,
      error: false,
      message: "t is already paused",
    });
  });

  it("next moves the next run, and the moved run starts a new grid on the leading edge", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);

    clock.advance(MIN);
    expect(await command(next(90_000))).toMatchObject({ applied: true, event: "rescheduled" });
    const moved = await scheduleRow(h, PATH);
    expect(moved).toMatchObject({
      next_at: T0 + MIN + 90_000,
      anchor: T0 + MIN + 90_000,
      source: "cli",
      reason: "moved with ngn next: in 1m 30s",
    });

    await steps(90_000);
    gates.open("run2");
    await decided(2);
    expect((await scheduleRow(h, PATH))?.next_at).toBe(T0 + MIN + 90_000 + 5 * MIN);
  });

  it("next now runs it at once", async () => {
    const gates = createGates();
    await start(gated(`{ every: "1h" }`));
    gates.open("run1");
    await decided(1);
    await command(next(0));
    await steps(1_000);
    gates.open("run2");
    await decided(2);
    expect(await runCount()).toBe(2);
  });

  it("refuses next on a paused task", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);
    await command(PAUSE);
    expect(await command(next(0))).toEqual({
      applied: false,
      error: true,
      message: "t is paused; run ngn resume t first",
    });
  });
});

describe("while a run is going", () => {
  it("pause waits for the run to end, then decided and paused are written together", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    await until(() => gates.isWaiting("run1"));

    expect(await command(PAUSE)).toMatchObject({ applied: true, event: "pause_requested" });
    expect(await command(RESUME)).toMatchObject({ applied: false });
    gates.open("run1");
    await until(async () => (await scheduleRow(h, PATH))?.state === "paused");
    const events = await scheduleEvents(h, PATH);
    expect(events.map((e) => e.event)).toEqual([
      "scheduled",
      "started",
      "pause_requested",
      "decided",
      "paused",
    ]);
    // One write: both events at the same time, and the request cleared.
    expect(events.at(-1)!.at).toBe(events.at(-2)!.at);
    expect((await scheduleRow(h, PATH))?.request).toBeNull();

    await steps(10 * MIN);
    expect(await runCount()).toBe(1);
  });

  it("next replaces the run's own decision, and the decision says so", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    await until(() => gates.isWaiting("run1"));

    expect(await command(next(30_000))).toMatchObject({
      applied: true,
      event: "override_requested",
    });
    gates.open("run1");
    await decided(1);
    const decision = (await scheduleEvents(h, PATH)).find((e) => e.event === "decided")!;
    expect(decision).toMatchObject({
      next_at: T0 + 30_000,
      source: "cli",
      request: null,
    });
    expect(decision.reason).toMatch(/^moved with ngn next to /);
  });
});

describe("while blocked on another run", () => {
  it("pause stops it waiting, and next moves it", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);

    // Something else holds the task's lease as its next run comes due.
    const held = await TaskLease.take(new LockService(h.db), PATH);
    if ("busy" in held) throw new Error("expected the lease");
    clock.advance(5 * MIN);
    await until(async () => (await scheduleRow(h, PATH))?.state === "blocked");

    expect(await command(next(MIN))).toMatchObject({ event: "rescheduled" });
    expect(await scheduleRow(h, PATH)).toMatchObject({ state: "waiting", holder: null });

    clock.advance(MIN);
    await until(async () => (await scheduleRow(h, PATH))?.state === "blocked");
    expect(await command(PAUSE)).toMatchObject({ event: "paused" });
    await held.release();
    await steps(5_000);
    expect(await runCount()).toBe(1);
    expect((await scheduleRow(h, PATH))?.state).toBe("paused");
  });
});

describe("--once on a paused task", () => {
  it("runs it through the lease, logs it, and leaves it paused", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);
    await command(PAUSE);

    gates.open("run2");
    const task = await h.task(PATH, gated(`{ every: "5m" }`));
    const outcome = await runOnce(task, { clock, onProblem: () => {} });
    expect(outcome).toMatchObject({ status: "success" });
    expect((await eventNames(h, PATH)).slice(-4)).toEqual(["paused", "started", "ended", "paused"]);
    expect((await scheduleRow(h, PATH))?.state).toBe("paused");
  });
});

describe("cron tasks", () => {
  const CRON = `"*/5 * * * *"`;

  it("resume takes the next slot after now rather than running what was missed", async () => {
    createGates();
    await start(gated(CRON));
    await command(PAUSE);
    clock.advance(12 * MIN);
    expect(await command(RESUME, { pattern: "*/5 * * * *" })).toMatchObject({ applied: true });
    expect((await scheduleRow(h, PATH))?.next_at).toBe(T0 + 15 * MIN);
    expect(await runCount()).toBe(0);
  });

  it("goes back to its pattern after a moved run", async () => {
    const gates = createGates();
    await start(gated(CRON));
    clock.advance(MIN);
    await command(next(MIN));
    await steps(MIN);
    gates.open("run1");
    await decided(1);
    expect((await scheduleRow(h, PATH))?.next_at).toBe(T0 + 5 * MIN);
  });
});

describe("a command that races the scheduler", () => {
  it("reads the row again and acts on the new state, once", async () => {
    const gates = createGates();
    await start(gated(`{ every: "5m" }`));
    gates.open("run1");
    await decided(1);
    await scheduler!.stop({ graceMs: 0 });
    scheduler = null;

    // Between the command's read and its write, a run starts.
    const store = new ScheduleStore(h.db);
    const original = store.transition.bind(store);
    let raced = false;
    store.transition = async (id, change) => {
      if (!raced) {
        raced = true;
        await original(id, { event: "started", at: clock.now(), set: { holder: "other" } });
      }
      return original(id, change);
    };
    expect(await command(PAUSE, { store })).toMatchObject({
      applied: true,
      event: "pause_requested",
    });

    // Close the run the race opened, as its tick would.
    await original(await taskId(), {
      event: "ended",
      at: clock.now(),
      set: { holder: null, request: null },
      followedBy: { event: "paused", at: clock.now() },
    });
  });
});

describe("a task with no schedule yet", () => {
  it("says it has not been scheduled", async () => {
    const task = await h.task(PATH, gated(`{ every: "5m" }`));
    await task.register();
    expect(await command(PAUSE)).toEqual({
      applied: false,
      error: true,
      message: "t has not been scheduled yet: ngn run schedules it",
    });
  });
});
