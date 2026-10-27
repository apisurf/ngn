import { openDbClient } from "@apisurf/ngn-persistence";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LockService } from "../src/db/services/lock.js";
import { createRunLocks } from "../src/runtime/locks.js";
import { createGates, createHarness, until, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness({ file: true });
});

afterEach(() => h.dispose());

const statuses = async () =>
  (await h.query<{ status: string }>("SELECT status FROM task_runs ORDER BY id")).map(
    (run) => run.status,
  );

/** Takes "site:x", noting when it gets in and out, and holds it until its gate opens. */
const lockingTask = (label: string) => `
  export const overlap = "allow";
  export const task = async (ctx) => ctx.lock("site:x", async () => {
    globalThis.__order.push("${label} in");
    await globalThis.__gates.wait("${label}");
    globalThis.__order.push("${label} out");
  });`;

describe("ctx.lock", () => {
  it("makes a second holder wait, then run once the first lets go", async () => {
    const gates = createGates();
    const order: string[] = [];
    (globalThis as Record<string, unknown>).__order = order;
    const a = await h.task("tasks/a.ts", lockingTask("a"));
    const b = await h.task("tasks/b.ts", lockingTask("b"));

    const first = a.execute();
    await until(() => order.includes("a in"));
    const second = b.execute();
    gates.open("b");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(order).toEqual(["a in"]);

    gates.open("a");
    await Promise.all([first, second]);
    expect(order).toEqual(["a in", "a out", "b in", "b out"]);
    expect(await h.query("SELECT * FROM locks")).toEqual([]);
  });

  it("is held against another process on the same file", async () => {
    const other = openDbClient(h.dbUrl);
    const otherLocks = new LockService(other);
    expect(await otherLocks.tryAcquire("site:x", 60_000, null)).not.toBeNull();

    const task = await h.task(
      "tasks/a.ts",
      `export const task = async (ctx) => {
        try { await ctx.lock("site:x", () => "got it", { wait: "100ms" }); }
        catch (error) { return error.name; }
      };`,
    );
    expect(await task.execute()).toBe("LockBusyError");
    other.close();
  });

  it("takes over a lease that has expired", async () => {
    const service = new LockService(h.db);
    expect(await service.tryAcquire("site:x", 10, null)).not.toBeNull();
    expect(await service.tryAcquire("site:x", 60_000, null)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await service.tryAcquire("site:x", 60_000, null)).not.toBeNull();
  });

  it("renews the lease while held", async () => {
    const service = new LockService(h.db);
    const locks = createRunLocks(service, 1);
    const expiries: number[] = [];
    await locks.lock(
      "site:x",
      async () => {
        for (let i = 0; i < 3; i++) {
          const [row] = await h.query<{ expires_at: number }>("SELECT expires_at FROM locks");
          expiries.push(row.expires_at);
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      },
      { ttl: 60 },
      null,
    );
    expect(expiries[2]).toBeGreaterThan(expiries[0]);
  });

  it("releases when fn throws", async () => {
    const task = await h.task(
      "tasks/a.ts",
      `export const task = async (ctx) => ctx.lock("site:x", () => { throw new Error("boom"); });`,
    );
    await expect(task.execute()).rejects.toThrow("boom");
    expect(await h.query("SELECT * FROM locks")).toEqual([]);
  });
});

describe("exclusive", () => {
  it("records a run as skipped while another run holds its lock", async () => {
    const gates = createGates();
    const holder = await h.task(
      "tasks/holder.ts",
      `export const exclusive = ["browser"];
       export const task = async () => { await globalThis.__gates.wait("done"); };`,
    );
    const blocked = await h.task(
      "tasks/blocked.ts",
      `export const exclusive = "browser";
       export const shouldSkip = async (ctx) => { await ctx.kv.set("asked", "yes"); return false; };
       export const task = async () => "ran";`,
    );

    const first = holder.execute();
    await until(async () => (await statuses()).includes("running"));
    expect(await blocked.execute()).toBeUndefined();
    expect(await statuses()).toEqual(["running", "skipped"]);
    const reasons = await h.query<{ value: string }>(
      "SELECT value FROM logs WHERE value LIKE 'Skipped:%'",
    );
    expect(reasons.map((log) => log.value)).toEqual(['Skipped: lock "browser" is held']);
    expect(await h.query("SELECT * FROM kvs")).toEqual([]);

    gates.open("done");
    await first;
    expect(await blocked.execute()).toBe("ran");
    expect(await h.query("SELECT * FROM locks")).toEqual([]);
  });

  it("refuses a malformed exclusive when the task is checked", async () => {
    const task = await h.task(
      "tasks/bad.ts",
      `export const exclusive = [""]; export const task = async () => {};`,
    );
    await task.loadEntry();
    expect(() => task.validateExports()).toThrow(/Invalid exclusive for tasks\/bad\.ts/);
  });
});

describe("locks without a file", () => {
  it("still work within one process", async () => {
    const memory = await createHarness();
    const service = new LockService(memory.db);
    expect(await service.tryAcquire("x", 60_000, null)).not.toBeNull();
    expect(await service.tryAcquire("x", 60_000, null)).toBeNull();
    memory.dispose();
  });
});
