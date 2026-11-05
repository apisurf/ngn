import { afterEach, describe, expect, it } from "vitest";
import { TaskLibrary } from "../src/runtime/taskLibrary.js";
import { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import { failedRunId } from "../src/runtime/task.js";
import { createHarness, type Harness } from "./helpers.js";

let harness: Harness;
let scheduler: TaskLibraryScheduler | null = null;

afterEach(async () => {
  await scheduler?.stop();
  harness?.dispose();
});

describe("TaskLibraryScheduler.start", () => {
  it("says which tasks it scheduled, on what, and which it left out and why", async () => {
    harness = await createHarness();
    const library = new TaskLibrary();
    library.add([
      await harness.task(
        "tasks/ok.ts",
        `export const timing = "0 0 9 * * *"; export const task = async () => {};`,
      ),
      await harness.task("tasks/untimed.ts", `export const task = async () => {};`),
      await harness.task(
        "tasks/bad.ts",
        `export const timing = "nope"; export const task = async () => {};`,
      ),
    ]);
    scheduler = new TaskLibraryScheduler({ taskLibrary: library });

    const report = await scheduler.start();

    expect(report.scheduled).toEqual([{ path: "tasks/ok.ts", pattern: "0 0 9 * * *" }]);
    expect(report.failed).toEqual([
      { path: "tasks/bad.ts", reason: "Invalid cron pattern: nope" },
      { path: "tasks/untimed.ts", reason: "timing pattern is missing" },
    ]);
  });
});

describe("failedRunId", () => {
  it("names the run a thrown error was recorded as", async () => {
    harness = await createHarness();
    const task = await harness.task(
      "tasks/boom.ts",
      `export const timing = "* * * * * *"; export const task = async () => { throw new Error("boom"); };`,
    );
    const error = await task.execute().catch((e: unknown) => e);
    const [run] = await harness.query<{ id: number }>(
      "SELECT id FROM task_runs ORDER BY id DESC LIMIT 1",
    );
    expect(failedRunId(error)).toBe(run!.id);
    expect(failedRunId(new Error("other"))).toBeNull();
  });
});
