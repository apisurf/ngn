import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileDescriptor } from "@apisurf/ngn-os";
import { Compiler } from "../src/source/compiler.js";
import { createControlsGenerator } from "../src/runtime/generateControls.js";
import { runFailure, Task } from "../src/runtime/task.js";
import { createTaskSqlite, releaseTaskDatabases } from "../src/runtime/taskSqlite.js";
import type { RunProblem } from "../src/runtime/types.js";
import { createHarness, type Harness } from "./helpers.js";

let h: Harness;
let problems: RunProblem[];

beforeEach(async () => {
  h = await createHarness();
  problems = [];
});

afterEach(() => h.dispose());

/** A task whose problems are collected in `problems`, as the CLI would print them. */
async function reportingTask(relativePath: string, source: string, env: unknown = {}) {
  const descriptor = createFileDescriptor({ rootDir: h.rootDir, path: relativePath });
  const compiler = new Compiler({ minify: false, silent: true });
  const compiledCode = await compiler.compileFromSource(source, descriptor.path.absolute);
  return new Task({
    buildConfigFn: createControlsGenerator({
      dbClient: h.db,
      env: env as Record<string, string> | null,
      report: (problem) => problems.push(problem),
    }),
    entryParams: { compiledCode, descriptor, tasksRootDir: h.rootDir },
  });
}

async function onlyRun() {
  const [run] = await h.query<{ id: number; status: string; ended_at: number | null }>(
    "SELECT id, status, ended_at FROM task_runs",
  );
  const logs = await h.query<{ status: string; value: string }>(
    "SELECT status, value FROM logs WHERE task_run_id = ? ORDER BY id",
    [run!.id],
  );
  const errors = logs.filter((l) => l.status === "error").map((l) => l.value);
  // The first line of each: the frames under it are checked once, below.
  return { ...run!, errors, heads: errors.map((value) => value.split("\n")[0]) };
}

describe("where a run failed", () => {
  it("records what the task threw, its stage and frames, and reports it once", async () => {
    const task = await reportingTask(
      "tasks/t.ts",
      `export const task = async (ctx) => Object.keys(ctx.missing);`,
    );

    const thrown = await task.execute().catch((error: unknown) => error);
    const run = await onlyRun();

    expect(run.status).toBe("failure");
    expect(run.errors[0]).toMatch(/^Failed in task: TypeError: .+\n {4}at /);
    expect(run.errors[1]).toBe("Task failed");
    expect(runFailure(thrown)).toEqual({ runId: run.id, stage: "task" });
    expect(problems).toMatchObject([
      { path: "tasks/t.ts", runId: run.id, stage: "task", fatal: true },
    ]);
  });

  it("ends a run whose shouldSkip throws, instead of leaving it pending", async () => {
    const task = await reportingTask(
      "tasks/t.ts",
      `export const shouldSkip = async () => { throw new Error("no config"); };
       export const task = async () => "never";`,
    );

    await expect(task.execute()).rejects.toThrow("no config");
    const run = await onlyRun();

    expect(run).toMatchObject({ status: "failure" });
    expect(run.ended_at).not.toBeNull();
    expect(run.heads[0]).toBe("Failed in shouldSkip: Error: no config");
  });

  it("fails a file that exports no task in load", async () => {
    const task = await reportingTask("tasks/t.ts", `export const timing = "* * * * *";`);

    await expect(task.execute()).rejects.toThrow("exports no task function");
    expect((await onlyRun()).heads[0]).toBe(
      "Failed in load: Error: tasks/t.ts exports no task function",
    );
  });

  it("records a throwing onSuccess without failing a run that succeeded", async () => {
    const task = await reportingTask(
      "tasks/t.ts",
      `export const task = async () => 7;
       export const onSuccess = async () => { throw new Error("mail down"); };`,
    );

    await expect(task.execute()).resolves.toBe(7);
    const run = await onlyRun();

    expect(run.status).toBe("success");
    expect(run.heads).toEqual(["Failed in onSuccess: Error: mail down"]);
    expect(problems).toMatchObject([{ stage: "onSuccess", fatal: false }]);
  });

  it("keeps the task's error when onError throws too", async () => {
    const task = await reportingTask(
      "tasks/t.ts",
      `export const task = async () => { throw new Error("boom"); };
       export const onError = async () => { throw new Error("hook broke"); };`,
    );

    await expect(task.execute()).rejects.toThrow("boom");
    expect((await onlyRun()).heads).toEqual([
      "Failed in task: Error: boom",
      "Task failed",
      "Failed in onError: Error: hook broke",
    ]);
  });

  it("gives a task an empty env when there is no env file", async () => {
    const task = await reportingTask(
      "tasks/t.ts",
      `export const task = async (ctx) => Object.keys(ctx.env).length;`,
      null,
    );

    await expect(task.execute()).resolves.toBe(0);
  });
});

describe("releasing one task's databases", () => {
  it("closes only what no other task still holds", async () => {
    const scheduled = createTaskSqlite(`${h.rootDir}/tasks/scheduled.ts`);
    const editor = createTaskSqlite(`${h.rootDir}/tasks/live-task-1-a.ts`);

    const shared = await scheduled.initDB({ file: "shared.db" });
    await editor.initDB({ file: "shared.db" });
    const own = await editor.initDB({ file: "own.db" });

    releaseTaskDatabases(`${h.rootDir}/tasks/live-task-1-a.ts`);

    await expect(shared.execute("SELECT 1")).resolves.toBeTruthy();
    await expect(own.execute("SELECT 1")).rejects.toThrow();
  });
});
