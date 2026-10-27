import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { breakerSkips, resolveRetry, retryFits } from "../src/runtime/retry.js";
import { tick } from "../src/runtime/schedule.js";
import { createHarness, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

const runs = () =>
  h.query<{ id: number; status: string; retry_of: number | null; skip_reason: string | null }>(
    "SELECT id, status, retry_of, skip_reason FROM task_runs ORDER BY id",
  );

/** Fails until it has been called `succeedOn` times in total. */
const flaky = (retry: string, succeedOn: number, extra = "") => `
export const retry = ${retry};
${extra}
export const task = async (ctx) => {
  const calls = Number((await ctx.kv.get("calls")) ?? 0) + 1;
  await ctx.kv.set("calls", String(calls));
  if (calls < ${succeedOn}) throw new Error("flaky " + calls);
  return calls;
};`;

const scheduled = () => ({ scheduledAt: Date.now(), nextAt: Date.now() + 60_000 });

describe("resolveRetry", () => {
  it("fills in defaults and refuses bad values, naming the task", () => {
    expect(resolveRetry(undefined, "t.ts")).toEqual({ attempts: 1, delayMs: 0, breaker: null });
    expect(resolveRetry({ attempts: 3, delay: "1s", breaker: { after: 2 } }, "t.ts")).toEqual({
      attempts: 3,
      delayMs: 1000,
      breaker: { after: 2, maxSkip: 32 },
    });
    expect(() => resolveRetry({ attempts: 0 }, "t.ts")).toThrow(/Invalid retry for t\.ts/);
    expect(() => resolveRetry({ breaker: { after: "x" } }, "t.ts")).toThrow(/breaker\.after/);
  });

  it("retries only while one would start before the next tick", () => {
    const retry = resolveRetry({ attempts: 3, delay: 1000 }, "t.ts");
    expect(retryFits({ attempt: 1, retry, nextAt: 5000, now: 0 })).toBe(true);
    expect(retryFits({ attempt: 1, retry, nextAt: 900, now: 0 })).toBe(false);
    expect(retryFits({ attempt: 3, retry, nextAt: null, now: 0 })).toBe(false);
  });

  it("skips 1, 2, 4… ticks up to maxSkip", () => {
    const breaker = { after: 3, maxSkip: 4 };
    expect([2, 3, 4, 5, 6, 9].map((n) => breakerSkips(n, breaker))).toEqual([0, 1, 2, 4, 4, 4]);
  });
});

describe("retry", () => {
  it("retries a failed run, each attempt its own row pointing at the first", async () => {
    const task = await h.task("tasks/flaky.ts", flaky(`{ attempts: 3 }`, 3));

    expect(await task.execute()).toBe(3);
    const [first, ...rest] = await runs();
    expect(first).toMatchObject({ status: "failure", retry_of: null });
    expect(rest).toEqual([
      expect.objectContaining({ status: "failure", retry_of: first.id }),
      expect.objectContaining({ status: "success", retry_of: first.id }),
    ]);
  });

  it("gives up after its attempts", async () => {
    const task = await h.task("tasks/flaky.ts", flaky(`{ attempts: 2 }`, 10));
    await expect(task.execute()).rejects.toThrow("flaky 2");
    expect((await runs()).map((run) => run.status)).toEqual(["failure", "failure"]);
  });

  it("does not retry when the retry would run into the next tick", async () => {
    const task = await h.task("tasks/flaky.ts", flaky(`{ attempts: 3, delay: "1m" }`, 3));
    await expect(
      task.execute({ scheduledAt: Date.now(), nextAt: Date.now() + 5_000 }),
    ).rejects.toThrow("flaky 1");
    expect(await runs()).toHaveLength(1);
  });

  it("lets shouldRetry stop it, with the error that failed the run", async () => {
    const task = await h.task(
      "tasks/flaky.ts",
      flaky(
        `{ attempts: 5 }`,
        10,
        `export const shouldRetry = async (error, ctx) => {
           await ctx.log.info("asked about " + error.message);
           return !error.message.endsWith("2");
         };`,
      ),
    );
    await expect(task.execute()).rejects.toThrow("flaky 2");
    const asked = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE value LIKE 'asked about%' ORDER BY id",
    );
    expect(asked.map((log) => log.value)).toEqual(["asked about flaky 1", "asked about flaky 2"]);
  });

  it("changes nothing without a retry export", async () => {
    const task = await h.task(
      "tasks/once.ts",
      `export const task = async () => { throw new Error("no"); };`,
    );
    await expect(task.execute()).rejects.toThrow("no");
    expect(await runs()).toHaveLength(1);
  });
});

describe("circuit breaker", () => {
  const BROKEN = `
export const retry = { breaker: { after: 2, maxSkip: 2 } };
export const task = async (ctx) => {
  if ((await ctx.kv.get("fixed")) !== "yes") throw new Error("down");
  return "up";
};`;

  const ticks = async (task: Awaited<ReturnType<Harness["task"]>>, n: number) => {
    for (let i = 0; i < n; i++) await tick(task, () => {}, scheduled());
  };
  const pattern = async () =>
    (await runs()).map((run) => (run.status === "skipped" ? "skip" : run.status[0])).join(" ");

  it("skips 1, then 2 ticks after repeated failures, and closes on a success", async () => {
    const task = await h.task("tasks/down.ts", BROKEN);
    await task.loadEntry();

    // f f -> open: skip 1, probe fails -> skip 2, probe fails -> skip 2 (maxSkip)
    await ticks(task, 9);
    expect(await pattern()).toBe("f f skip f skip skip f skip skip");
    const skip = (await runs()).find((run) => run.status === "skipped")!;
    expect(skip.skip_reason).toBe("circuit open after repeated failures");

    // The service comes back.
    await h.db.execute(
      "INSERT INTO kvs (file_task_id, key, value) SELECT file_task_id, 'fixed', 'yes' FROM task_runs LIMIT 1",
    );
    await ticks(task, 2);
    expect(await pattern()).toBe("f f skip f skip skip f skip skip s s");
  });

  it("survives a restart, reading the streak from the run history", async () => {
    const task = await h.task("tasks/down.ts", BROKEN);
    await task.loadEntry();
    await ticks(task, 2);

    // A fresh Task over the same database, as after restarting `ngn run`.
    const restarted = await h.task("tasks/down.ts", BROKEN);
    await restarted.loadEntry();
    await ticks(restarted, 1);
    expect(await pattern()).toBe("f f skip");
  });

  it("does not hold back a run that is not a scheduled tick", async () => {
    const task = await h.task("tasks/down.ts", BROKEN);
    await task.loadEntry();
    await ticks(task, 2);
    await expect(task.execute()).rejects.toThrow("down");
    expect(await pattern()).toBe("f f f");
  });
});
