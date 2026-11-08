import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LockService } from "../src/db/services/lock.js";
import { runFailure } from "../src/runtime/task.js";
import { createHarness, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

const runIds = async () =>
  (await h.query<{ id: number }>("SELECT id FROM task_runs ORDER BY id")).map((r) => r.id);

const scheduled = () => ({ scheduledAt: Date.now(), nextAt: Date.now() + 60_000 });

describe("a tick's outcome", () => {
  it("is a success with what the task returned, its run and when it ended", async () => {
    const task = await h.task("tasks/ok.ts", `export const task = async () => ({ n: 3 });`);
    const before = Date.now();

    const outcome = await task.executeTick();
    const [id] = await runIds();

    expect(outcome).toMatchObject({
      status: "success",
      result: { n: 3 },
      error: undefined,
      skipReason: null,
      firstRunId: id,
      runId: id,
      attempts: 1,
    });
    expect(outcome.endedAt).toBeGreaterThanOrEqual(before);
  });

  it.each([
    ["load", `throw new Error("bad module"); export const task = async () => {};`, "bad module"],
    [
      "shouldSkip",
      `export const shouldSkip = async () => { throw new Error("no config"); };
       export const task = async () => {};`,
      "no config",
    ],
    ["task", `export const task = async () => { throw new Error("boom"); };`, "boom"],
  ])("is a failure in %s, with the error the run recorded", async (stage, source, message) => {
    const task = await h.task("tasks/fails.ts", source);

    const outcome = await task.executeTick();
    const [id] = await runIds();

    expect(outcome).toMatchObject({ status: "failure", runId: id, attempts: 1 });
    expect((outcome.error as Error).message).toBe(message);
    expect(runFailure(outcome.error)).toEqual({ runId: id, stage });
  });

  it("is a failure with the error shouldRetry threw, when it throws", async () => {
    const task = await h.task(
      "tasks/fails.ts",
      `export const retry = { attempts: 3 };
       export const shouldRetry = () => { throw new Error("cannot decide"); };
       export const task = async () => { throw new Error("boom"); };`,
    );

    const outcome = await task.executeTick();

    expect(outcome.status).toBe("failure");
    expect((outcome.error as Error).message).toBe("cannot decide");
    await expect(task.execute()).rejects.toThrow("cannot decide");
  });

  it("is a skip with no reason when shouldSkip said so", async () => {
    const task = await h.task(
      "tasks/skips.ts",
      `export const shouldSkip = async () => true; export const task = async () => {};`,
    );

    expect(await task.executeTick()).toMatchObject({
      status: "skipped",
      skipReason: null,
      runId: (await runIds())[0],
    });
  });

  it("is a skip naming the lock when an exclusive lock is held", async () => {
    const task = await h.task(
      "tasks/locked.ts",
      `export const exclusive = "browser"; export const task = async () => {};`,
    );
    await new LockService(h.db).tryAcquire("browser", 60_000, null);

    expect(await task.executeTick()).toMatchObject({
      status: "skipped",
      skipReason: 'lock "browser" is held',
    });
  });

  it("is a skip with the breaker's reason when the circuit is open", async () => {
    const task = await h.task(
      "tasks/breaks.ts",
      `export const retry = { breaker: { after: 1 } };
       export const task = async () => { throw new Error("down"); };`,
    );

    expect((await task.executeTick(scheduled())).status).toBe("failure");
    expect(await task.executeTick(scheduled())).toMatchObject({
      status: "skipped",
      skipReason: "circuit open after repeated failures",
    });
  });

  it("names the first and final attempts of a retry that succeeds after a failure", async () => {
    const task = await h.task(
      "tasks/flaky.ts",
      `export const retry = { attempts: 3 };
       export const task = async (ctx) => {
         const calls = Number((await ctx.kv.get("calls")) ?? 0) + 1;
         await ctx.kv.set("calls", String(calls));
         if (calls < 2) throw new Error("flaky");
         return calls;
       };`,
    );

    const outcome = await task.executeTick(scheduled());
    const [first, second] = await runIds();

    expect(outcome).toMatchObject({
      status: "success",
      result: 2,
      firstRunId: first,
      runId: second,
      attempts: 2,
    });
  });

  it("is a failure with no run when the task cannot be registered", async () => {
    const task = await h.task("tasks/ok.ts", `export const task = async () => {};`);
    await h.db.execute("DROP TABLE task_runs");

    const outcome = await task.executeTick();

    expect(outcome).toMatchObject({ status: "failure", firstRunId: null, runId: null });
    expect(runFailure(outcome.error)).toBeNull();
  });
});
