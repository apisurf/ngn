import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGates, createHarness, until, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

// Each run logs which gate it holds, waits on it, then times itself.
const GATED = `
export const task = async (ctx) => {
  const gate = (await ctx.kv.get("last-gate")) === "a" ? "b" : "a";
  await ctx.kv.set("last-gate", gate);
  await ctx.log.info("holding " + gate);
  const end = ctx.timing.start("wait " + gate);
  await globalThis.__gates.wait(gate);
  await end();
  return gate;
};
`;

describe("one context per run", () => {
  it("keeps overlapping runs of one task apart", async () => {
    const gates = createGates();
    const task = await h.task("tasks/gated.ts", GATED);
    await task.loadEntry();

    const first = task.execute();
    await until(() => gates.isWaiting("a"));
    const second = task.execute();
    await until(() => gates.isWaiting("b"));

    // Finish them in the opposite order to the one they started in.
    gates.open("b");
    expect(await second).toBe("b");
    gates.open("a");
    expect(await first).toBe("a");

    const runs = await h.query<{ id: number; status: string }>(
      "SELECT id, status FROM task_runs ORDER BY id",
    );
    expect(runs.map((run) => run.status)).toEqual(["success", "success"]);

    const [a, b] = runs.map((run) => run.id);
    const logs = await h.query<{ task_run_id: number; value: string }>(
      "SELECT task_run_id, value FROM logs WHERE value LIKE 'holding %' ORDER BY id",
    );
    expect(logs).toEqual([
      { task_run_id: a, value: "holding a" },
      { task_run_id: b, value: "holding b" },
    ]);

    const timings = await h.query<{ task_run_id: number; label: string }>(
      "SELECT task_run_id, label FROM timings ORDER BY task_run_id",
    );
    expect(timings).toEqual([
      { task_run_id: a, label: "wait a" },
      { task_run_id: b, label: "wait b" },
    ]);
  });

  it("shares kv across runs of one task", async () => {
    const task = await h.task(
      "tasks/count.ts",
      `export const task = async (ctx) => {
        const n = Number((await ctx.kv.get("n")) ?? 0) + 1;
        await ctx.kv.set("n", String(n));
        return n;
      };`,
    );

    expect(await task.execute()).toBe(1);
    expect(await task.execute()).toBe(2);
  });

  it("throws a load failure without touching task_runs", async () => {
    const task = await h.task("tasks/broken.ts", `throw new Error("bad module");`);

    await expect(task.execute()).rejects.toThrow();
    expect(await h.query("SELECT * FROM task_runs")).toEqual([]);
  });

  it("marks a failing run as failed, with its own logs", async () => {
    const task = await h.task(
      "tasks/fails.ts",
      `export const task = async (ctx) => { await ctx.log.info("trying"); throw new Error("nope"); };`,
    );

    await expect(task.execute()).rejects.toThrow("nope");
    const [run] = await h.query<{ id: number; status: string }>("SELECT id, status FROM task_runs");
    expect(run.status).toBe("failure");
    const logs = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE task_run_id = ? ORDER BY id",
      [run.id],
    );
    expect(logs.map((log) => log.value)).toEqual(["Task started", "trying", "Task failed"]);
  });
});
