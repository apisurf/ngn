import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRefusal } from "../src/db/services/schedule.js";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import {
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

const decided = async (path: string, n: number) =>
  until(async () => (await eventNames(h, path)).filter((e) => e === "decided").length >= n);

describe("the state table", () => {
  it("refuses a transition it does not allow, leaving the row and the log as they were", async () => {
    const { library } = await start({
      "tasks/t.ts": `export const timing = { every: "5m" }; export const task = async () => {};`,
    });
    await decided("tasks/t.ts", 1);
    const [task] = library.getTasks();
    const taskId = await task!.register();
    const before = {
      row: await scheduleRow(h, "tasks/t.ts"),
      log: await eventNames(h, "tasks/t.ts"),
    };

    const result = await task!.scheduling.store.transition(taskId, {
      event: "decided",
      at: clock.now(),
      set: { next_at: 1 },
    });

    expect(isRefusal(result) && result.refused).toBe("decided is not allowed from waiting");
    expect({
      row: await scheduleRow(h, "tasks/t.ts"),
      log: await eventNames(h, "tasks/t.ts"),
    }).toEqual(before);
  });

  it("refuses a second schedule for a task that has one", async () => {
    const { library } = await start({
      "tasks/t.ts": `export const timing = { every: "5m" }; export const task = async () => {};`,
    });
    const [task] = library.getTasks();
    const result = await task!.scheduling.store.transition(await task!.register(), {
      event: "scheduled",
      at: clock.now(),
    });
    expect(isRefusal(result)).toBe(true);
  });
});

describe("a tick", () => {
  it("holds the task running from before its first run until after its last hook", async () => {
    const gates = createGates();
    await start({
      "tasks/t.ts": `
        export const timing = { every: "5m" };
        export const task = async () => { await globalThis.__gates.wait("task"); };
        export const onComplete = async () => { await globalThis.__gates.wait("hook"); };`,
    });

    await until(() => gates.isWaiting("task"));
    expect((await scheduleRow(h, "tasks/t.ts"))?.state).toBe("running");
    gates.open("task");
    await until(() => gates.isWaiting("hook"));
    expect((await scheduleRow(h, "tasks/t.ts"))?.state).toBe("running");
    gates.open("hook");
    await decided("tasks/t.ts", 1);
    expect((await scheduleRow(h, "tasks/t.ts"))?.state).toBe("waiting");
  });

  it("records the decision on the tick's final run", async () => {
    await start({
      "tasks/t.ts": `export const timing = "0 */5 * * * *"; export const task = async () => {};`,
    });
    clock.advance(5 * MIN);
    await decided("tasks/t.ts", 1);
    const [run] = await h.query<{ next_at: number; next_reason: string }>(
      "SELECT next_at, next_reason FROM task_runs",
    );
    expect(run).toEqual({ next_at: T0 + 10 * MIN, next_reason: "every 5 minutes" });
  });
});

describe("stopping", () => {
  it("lets a run that heeds its signal end, and decides its next run as usual", async () => {
    const gates = createGates();
    await start({
      "tasks/t.ts": `
        export const timing = { every: "5m" };
        export const task = async (ctx) => {
          await new Promise((resolve) => ctx.run.signal.addEventListener("abort", resolve));
          await ctx.kv.set("why", String(ctx.run.signal.reason.message));
        };`,
    });
    void gates;
    await until(async () => (await scheduleRow(h, "tasks/t.ts"))?.state === "running");

    await scheduler!.stop();
    scheduler = null;

    expect(await eventNames(h, "tasks/t.ts")).toEqual(["scheduled", "started", "decided"]);
    const [why] = await h.query<{ value: string }>("SELECT value FROM kvs WHERE key = 'why'");
    expect(why?.value).toBe("ngn is stopping");
    await expectScheduleInvariants(h, { stopped: true });
  });

  it("closes a run still going after the grace period as failed in interrupted, due again at once", async () => {
    const gates = createGates();
    await start({
      "tasks/t.ts": `
        export const timing = { every: "5m" };
        export const task = async () => { await globalThis.__gates.wait("never"); };`,
    });
    await until(() => gates.isWaiting("never"));
    clock.advance(MIN);

    const stopping = scheduler!.stop();
    scheduler = null;
    await until(() => clock.sleeping > 0);
    clock.advance(10_000);
    await stopping;

    const events = await scheduleEvents(h, "tasks/t.ts");
    expect(events.at(-1)).toMatchObject({ event: "interrupted", next_at: T0 + MIN + 10_000 });
    const [run] = await h.query<{ id: number; status: string }>("SELECT id, status FROM task_runs");
    expect(run?.status).toBe("failure");
    expect(events.at(-1)?.run_id).toBe(run?.id);
    const errors = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE status = 'error' ORDER BY id",
    );
    expect(errors.map((l) => l.value.split("\n")[0])).toEqual([
      "Failed in interrupted: Error: ngn stopped before the run ended",
      "Task failed",
    ]);
    await expectScheduleInvariants(h, { stopped: true });

    // The run that finally ends finds its row closed, and says how it came out.
    gates.open("never");
    await until(() => hasLogLine(h, "finished after ngn closed it as interrupted"));
    expect((await h.query<{ status: string }>("SELECT status FROM task_runs"))[0]?.status).toBe(
      "failure",
    );
  });
});
