import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOnce } from "../src/runtime/taskSchedule.js";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import {
  countEvents,
  createFakeClock,
  createGates,
  createHarness,
  eventNames,
  hasLogLine,
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
  h = await createHarness({ file: true });
  clock = createFakeClock(T0);
  schedulers = [];
});

afterEach(async () => {
  await Promise.all(schedulers.map((s) => s.stop({ graceMs: 0 })));
  await expectScheduleInvariants(h);
  h.dispose();
});

async function start(
  sources: Record<string, string>,
  options: Parameters<typeof startScheduler>[2] = {},
) {
  const started = await startScheduler(h, sources, { clock, ...options });
  schedulers.push(started.scheduler);
  return started;
}

const runs = () =>
  h.query<{ id: number; status: string }>("SELECT id, status FROM task_runs ORDER BY id");

const GATED = `
export const timing = { every: "5m" };
export const task = async (ctx) => {
  const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
  await ctx.kv.set("n", String(n));
  await globalThis.__gates.wait("run" + n);
};`;

const snapshot = async () => ({
  runs: await runs(),
  events: await eventNames(h, "tasks/t.ts"),
});

describe("Run now and --once", () => {
  it("refuse with the holding run's id while a run is going, writing nothing", async () => {
    const gates = createGates();
    const { scheduler } = await start({ "tasks/t.ts": GATED });
    await until(() => gates.isWaiting("run1"));
    const [run] = await runs();
    const before = await snapshot();
    const busy = `run ${run!.id} of tasks/t.ts is in progress`;

    expect(await scheduler.runNow("tasks/t.ts")).toEqual({ started: false, reason: busy });
    const other = await h.connect();
    const once = await runOnce(await other.task("tasks/t.ts", GATED), {
      clock,
      onProblem: () => {},
    });
    expect(once).toEqual({ busy });
    expect(await snapshot()).toEqual(before);

    gates.open("run1");
  });

  it("log started and ended, and leave the next run where it was", async () => {
    const gates = createGates();
    gates.open("run1");
    const { scheduler } = await start({ "tasks/t.ts": GATED });
    await until(async () => (await eventNames(h, "tasks/t.ts")).includes("decided"));
    const nextAt = (await scheduleRow(h, "tasks/t.ts"))?.next_at;

    await scheduler.runNow("tasks/t.ts");
    await until(() => gates.isWaiting("run2"));
    gates.open("run2");
    await until(async () => (await eventNames(h, "tasks/t.ts")).includes("ended"));

    const other = await h.connect();
    gates.open("run3");
    const outcome = await runOnce(await other.task("tasks/t.ts", GATED), {
      clock,
      onProblem: () => {},
    });
    expect(outcome).toMatchObject({ status: "success" });

    const events = await scheduleEvents(h, "tasks/t.ts");
    expect(events.slice(3).map((e) => [e.event, e.origin])).toEqual([
      ["started", "manual"],
      ["ended", null],
      ["started", "manual"],
      ["ended", null],
    ]);
    expect(events.slice(3).every((e) => e.next_at === nextAt)).toBe(true);
  });
});

describe("two processes on one database", () => {
  it("start each due run once between them", async () => {
    const source = `export const timing = { every: "5m" }; export const task = async (ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    };`;
    await start({ "tasks/t.ts": source });
    await start({ "tasks/t.ts": source }, { via: await h.connect() });

    for (let period = 1; period <= 4; period++) {
      await until(async () => (await countEvents(h, "tasks/t.ts", "decided")) === period);
      clock.advance(5 * MIN);
    }
    await until(async () => (await countEvents(h, "tasks/t.ts", "decided")) === 5);
    // One run per slot, whichever process got it.
    expect((await runs()).length).toBe(5);
    const started = (await scheduleEvents(h, "tasks/t.ts")).filter((e) => e.event === "started");
    expect(started.map((e) => (e.at - T0) / MIN)).toEqual([0, 5, 10, 15, 20]);
  });
});

describe("a process that dies", () => {
  it("has its tick recovered by the next one: its runs closed as interrupted, and the next run decided", async () => {
    const gates = createGates();
    const dead = await start({ "tasks/t.ts": GATED }, { leaseTtlMs: 100 });
    await until(() => gates.isWaiting("run1"));
    dead.scheduler.abandon();
    schedulers.length = 0;

    await new Promise((resolve) => setTimeout(resolve, 150)); // its lease runs out
    await start(
      { "tasks/t.ts": GATED },
      { via: await h.connect(), leaseTtlMs: 100, random: () => 0.5 },
    );
    await until(async () => (await eventNames(h, "tasks/t.ts")).includes("recovered"));

    const [run] = await h.query<{ id: number; status: string }>("SELECT id, status FROM task_runs");
    expect(run?.status).toBe("failure");
    const recovered = (await scheduleEvents(h, "tasks/t.ts")).find((e) => e.event === "recovered");
    expect(recovered).toMatchObject({
      run_id: run!.id,
      // A recovered tick failed, so the task backs off: every × 2, with no jitter at 0.5.
      next_at: recovered!.at + 10 * MIN,
      reason: "the process running it stopped; backing off after a failure: 10m",
    });
    const lines = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE task_run_id = ? ORDER BY id",
      [run!.id],
    );
    expect(lines.map((l) => l.value.split("\n")[0])).toContain(
      "Failed in interrupted: Error: the ngn process running it stopped",
    );

    // The dead tick's late end does not overwrite what recovery recorded.
    gates.open("run1");
    await until(() => hasLogLine(h, "finished after ngn closed it as interrupted: succeeded"));
    expect((await runs())[0]?.status).toBe("failure");
  });
});

describe("a process that loses its lease", () => {
  it("aborts the run's signal, logs lease_lost, and discards its decision", async () => {
    const gates = createGates();
    await start(
      {
        "tasks/t.ts": `
          export const timing = { every: "5m" };
          export const task = async (ctx) => {
            await new Promise((resolve) => ctx.run.signal.addEventListener("abort", resolve));
            await ctx.kv.set("why", ctx.run.signal.reason.message);
            await globalThis.__gates.wait("end");
            return "done";
          };`,
      },
      { leaseTtlMs: 90 },
    );
    await until(async () => (await scheduleRow(h, "tasks/t.ts"))?.state === "running");

    // Another process takes the task, as if this one had been frozen past its lease.
    await h.db.execute(
      "UPDATE locks SET holder = 'other', expires_at = ? WHERE name = 'ngn:task:tasks/t.ts'",
      [Date.now() + 60_000],
    );
    await until(async () => (await eventNames(h, "tasks/t.ts")).includes("lease_lost"));
    const [why] = await h.query<{ value: string }>("SELECT value FROM kvs WHERE key = 'why'");
    expect(why?.value).toBe("the run lost its lease");

    gates.open("end");
    await until(async () => (await runs())[0]?.status === "success");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await eventNames(h, "tasks/t.ts")).toEqual(["scheduled", "started", "lease_lost"]);
    await h.db.execute("DELETE FROM locks");
  });
});

describe("reserved lock names", () => {
  it("refuses ngn: names for exclusive, naming the task, and for ctx.lock", async () => {
    const { report } = await start({
      "tasks/x.ts": `export const timing = "0 0 1 1 *"; export const exclusive = "ngn:task:tasks/y.ts";
                     export const task = async () => {};`,
    });
    expect(report.failed[0]?.reason).toBe(
      'Invalid exclusive: "ngn:task:tasks/y.ts" starts with "ngn:", which ngn keeps for itself',
    );

    const task = await h.task(
      "tasks/lock.ts",
      `export const task = async (ctx) => ctx.lock("ngn:mine", async () => {});`,
    );
    await expect(task.execute()).rejects.toThrow(
      `Lock "ngn:mine": names starting with "ngn:" are ngn's own`,
    );
  });
});
