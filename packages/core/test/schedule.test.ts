import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCronPatternValid, scheduleTask, tick } from "../src/runtime/schedule.js";
import { createGates, createHarness, until, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

const gatedTask = (overlap?: string) => `
${overlap ? `export const overlap = ${JSON.stringify(overlap)};` : ""}
export const shouldSkip = async (ctx) => { await ctx.kv.set("asked", "yes"); return false; };
export const task = async () => { await globalThis.__gates.wait("done"); };
`;

const isRunning = (status: string) => status === "running";

const statuses = async () =>
  (await h.query<{ status: string }>("SELECT status FROM task_runs ORDER BY id")).map(
    (run) => run.status,
  );

describe("cron patterns", () => {
  it("accepts the five- and six-field patterns ngn always has", () => {
    for (const pattern of ["*/5 * * * * *", "*/2 * * * *", "2,12,22 * * * *", "0 9 * * mon-fri"]) {
      expect(isCronPatternValid(pattern), pattern).toBe(true);
    }
  });

  it("rejects garbage and seven-field patterns", () => {
    for (const pattern of ["", "every minute", "* * *", "0 0 0 1 1 * 2030"]) {
      expect(isCronPatternValid(pattern), pattern).toBe(false);
    }
  });
});

describe("overlap", () => {
  it("skips a tick while the previous run is going, without calling the task's code", async () => {
    const gates = createGates();
    const task = await h.task("tasks/slow.ts", gatedTask());
    await task.loadEntry();
    const errors: unknown[] = [];

    const first = tick(task, (error) => errors.push(error));
    await until(async () => (await statuses()).includes("running"));
    await h.db.execute("DELETE FROM kvs");

    await tick(task, (error) => errors.push(error));
    expect(await statuses()).toEqual(["running", "skipped"]);
    expect(await h.query("SELECT * FROM kvs WHERE key = 'asked'")).toEqual([]);
    const reasons = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE value LIKE 'Skipped:%'",
    );
    expect(reasons.map((log) => log.value)).toEqual(["Skipped: previous run still in progress"]);

    gates.open("done");
    await first;
    expect(await statuses()).toEqual(["success", "skipped"]);
    expect(errors).toEqual([]);
  });

  it('runs beside the previous one with overlap = "allow"', async () => {
    const gates = createGates();
    const task = await h.task("tasks/slow.ts", gatedTask("allow"));
    await task.loadEntry();

    const first = tick(task, () => {});
    await until(async () => (await statuses()).includes("running"));
    const second = tick(task, () => {});
    await until(async () => (await statuses()).filter(isRunning).length === 2);

    gates.open("done");
    await Promise.all([first, second]);
    expect(await statuses()).toEqual(["success", "success"]);
  });

  it("refuses an unknown overlap value when scheduling, naming the task", async () => {
    const task = await h.task("tasks/typo.ts", gatedTask("skp"));
    await task.loadEntry();

    const schedule = () => scheduleTask(task, "* * * * *", () => {});
    expect(schedule).toThrow(/Invalid overlap "skp" for tasks\/typo\.ts/);
  });

  it("hands a failing run's error to onError and is free for the next tick", async () => {
    const task = await h.task(
      "tasks/fails.ts",
      `export const task = async () => { throw new Error("nope"); };`,
    );
    await task.loadEntry();
    const errors: unknown[] = [];

    await tick(task, (error) => errors.push(error));
    await tick(task, (error) => errors.push(error));

    expect(errors.map((error) => (error as Error).message)).toEqual(["nope", "nope"]);
    expect(task.isRunning).toBe(false);
    expect(await statuses()).toEqual(["failure", "failure"]);
  });
});
