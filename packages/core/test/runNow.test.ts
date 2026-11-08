import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskLibrary } from "../src/runtime/taskLibrary.js";
import { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import { createGates, createHarness, until, type Harness } from "./helpers.js";

let h: Harness;
let running: TaskLibraryScheduler | null = null;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  await running?.stop({ graceMs: 1_000 });
  running = null;
  h.dispose();
});

// Once a year, so no tick fires while the test runs: every run is one it asked for.
const gatedTask = `
export const timing = "0 0 1 1 *";
export const task = async () => { await globalThis.__gates.wait("done"); return "ran"; };
`;

const statuses = async () =>
  (await h.query<{ status: string }>("SELECT status FROM task_runs ORDER BY id")).map(
    (run) => run.status,
  );

async function start() {
  const library = new TaskLibrary();
  library.add(await h.task("tasks/report.ts", gatedTask));
  const errors: unknown[] = [];
  running = new TaskLibraryScheduler({
    taskLibrary: library,
    onRunError: (_path, error) => errors.push(error),
  });
  await running.start();
  return { scheduler: running, errors };
}

describe("runNow", () => {
  it("starts a run of a scheduled task outside its schedule, and returns before it ends", async () => {
    const gates = createGates();
    const { scheduler, errors } = await start();

    expect(await scheduler.runNow("tasks/report.ts")).toEqual({ started: true });
    await until(async () => (await statuses()).includes("running"));

    gates.open("done");
    await until(async () => (await statuses()).includes("success"));
    expect(await statuses()).toEqual(["success"]);
    expect(errors).toEqual([]);
  });

  it("says so, rather than recording a skip, while a run of it is still going", async () => {
    const gates = createGates();
    const { scheduler } = await start();

    await scheduler.runNow("tasks/report.ts");
    await until(async () => (await statuses()).includes("running"));
    const [run] = await h.query<{ id: number }>("SELECT id FROM task_runs");
    expect(await scheduler.runNow("tasks/report.ts")).toEqual({
      started: false,
      reason: `run ${run!.id} of tasks/report.ts is in progress`,
    });
    expect(await statuses()).toEqual(["running"]);

    gates.open("done");
    await until(async () => (await statuses()).includes("success"));
  });

  it("refuses a task this scheduler does not run", async () => {
    const { scheduler } = await start();
    expect(await scheduler.runNow("tasks/other.ts")).toEqual({
      started: false,
      reason: "tasks/other.ts is not scheduled by this ngn run",
    });
  });
});
