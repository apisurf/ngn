import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDbClient, type Client } from "@apisurf/ngn-persistence";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openQueue, type Queue } from "../src/runtime/queue/queue.js";
import { createHarness } from "./helpers.js";

let dir: string;
let client: Client;
let nextTick: number | null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ngn-queue-test-"));
  client = openDbClient(`file:${join(dir, "data.db")}`);
  nextTick = null;
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

const open = <T = { url: string }>(options = {}) =>
  openQueue<T>(client, "pages", options, {
    get nextAt() {
      return nextTick;
    },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function statusOf(q: Queue<unknown>, key: string) {
  return (await q.get(key))?.status;
}

describe("add", () => {
  it("skips a key that is already in the queue, and says so", async () => {
    const q = await open();
    expect(await q.add({ key: "a", payload: { url: "https://a" } })).toBe(1);
    expect(await q.add([{ key: "a" }, { key: "b" }])).toBe(1);
    expect((await q.stats()).ready).toBe(2);
  });

  it("keeps queues of different names apart", async () => {
    const pages = await open();
    const other = await openQueue(client, "other", {}, { nextAt: null });
    await pages.add({ key: "a" });
    expect(await other.add({ key: "a" })).toBe(1);
  });

  it("goes in the same batch as your own row", async () => {
    const q = await open();
    await client.execute("CREATE TABLE links (url TEXT PRIMARY KEY)");
    await client.batch(
      [
        { sql: "INSERT INTO links (url) VALUES (?)", args: ["https://a"] },
        q.addStatement({ key: "https://a", payload: { url: "https://a" } }),
      ],
      "write",
    );
    expect((await q.get("https://a"))?.payload).toEqual({ url: "https://a" });
  });

  it("round-trips payloads as JSON", async () => {
    const q = await open<{ n: number; tags: string[] }>();
    await q.add({ key: "a", payload: { n: 1, tags: ["x"] } });
    const [job] = await q.claim({ limit: 1 });
    expect(job.payload).toEqual({ n: 1, tags: ["x"] });
  });
});

describe("claim", () => {
  it("counts an attempt and leases the job", async () => {
    const q = await open();
    await q.add({ key: "a" });
    const [job] = await q.claim({ limit: 5 });
    expect(job.attempts).toBe(1);
    expect(await statusOf(q, "a")).toBe("leased");
    expect(await q.claim({ limit: 5 })).toEqual([]);
  });

  it("never hands one job to two claimers", async () => {
    const q = await open();
    await q.add(Array.from({ length: 20 }, (_, i) => ({ key: `k${i}` })));
    const other = openDbClient(`file:${join(dir, "data.db")}`);
    const q2 = await openQueue(other, "pages", {}, { nextAt: null });

    const [a, b] = await Promise.all([q.claim({ limit: 15 }), q2.claim({ limit: 15 })]);
    const ids = [...a, ...b].map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
    other.close();
  });

  it("makes a job claimable again once its lease expires, with the attempt spent", async () => {
    const q = await open({ lease: 20 });
    await q.add({ key: "a" });
    await q.claim({ limit: 1 });
    await sleep(30);
    const [again] = await q.claim({ limit: 1 });
    expect(again.attempts).toBe(2);
  });

  it("marks a job dead when its last attempt's lease expires", async () => {
    const q = await open({ lease: 20, maxAttempts: 1 });
    await q.add({ key: "a" });
    await q.claim({ limit: 1 });
    await sleep(30);
    expect(await q.claim({ limit: 1 })).toEqual([]);
    expect(await statusOf(q, "a")).toBe("dead");
    expect((await q.get("a"))?.lastError).toBe("lease expired");
  });

  it("serves groups a job at a time, and caps each with perGroup", async () => {
    const q = await open();
    await q.add([
      ...["a1", "a2", "a3"].map((key) => ({ key, group: "a" })),
      ...["b1", "b2"].map((key) => ({ key, group: "b" })),
      { key: "c1", group: "c" },
    ]);

    const first = await q.claim({ limit: 3 });
    expect(first.map((job) => job.group).toSorted()).toEqual(["a", "b", "c"]);

    const rest = await q.claim({ limit: 10, perGroup: 1 });
    expect(rest.map((job) => job.key).toSorted()).toEqual(["a2", "b2"]);
  });

  it("leaves skipped jobs alone", async () => {
    const q = await open();
    await q.add([{ key: "a" }, { key: "b" }]);
    const a = await q.get("a");
    const jobs = await q.claim({ limit: 10, skipIds: [a!.id] });
    expect(jobs.map((job) => job.key)).toEqual(["b"]);
  });

  it("leaves skipped groups alone", async () => {
    const q = await open();
    await q.add([
      { key: "a1", group: "a" },
      { key: "b1", group: "b" },
    ]);
    const jobs = await q.claim({ limit: 10, skipGroups: ["a"] });
    expect(jobs.map((job) => job.key)).toEqual(["b1"]);
  });

  it("takes higher priority first, then oldest", async () => {
    const q = await open();
    await q.add([{ key: "old" }, { key: "urgent", priority: 5 }]);
    await sleep(2);
    await q.add({ key: "new" });
    const jobs = await q.claim({ limit: 3 });
    expect(jobs.map((job) => job.key)).toEqual(["urgent", "old", "new"]);
  });

  it("waits for a delayed job", async () => {
    const q = await open();
    await q.add({ key: "later", delay: "1h" });
    expect(await q.claim({ limit: 1 })).toEqual([]);
    expect((await q.stats()).due).toBe(0);
  });
});

describe("settling a job", () => {
  it("completes it", async () => {
    const q = await open();
    await q.add({ key: "a" });
    const [job] = await q.claim({ limit: 1 });
    expect(await q.complete(job)).toBe(true);
    expect(await statusOf(q, "a")).toBe("done");
  });

  it("backs a failure off to the next tick, then gives up at maxAttempts", async () => {
    const q = await open({ maxAttempts: 2 });
    nextTick = Date.now() + 60_000;
    await q.add({ key: "a" });

    const [first] = await q.claim({ limit: 1 });
    await q.fail(first, new Error("timeout"));
    expect(await statusOf(q, "a")).toBe("ready");
    expect(await q.claim({ limit: 1 })).toEqual([]);
    expect((await q.get("a"))?.lastError).toBe("timeout");

    // The next tick has come.
    await client.execute("UPDATE _ngn_jobs SET run_after = 0");
    const [second] = await q.claim({ limit: 1 });
    await q.fail(second, "still broken");
    expect(await statusOf(q, "a")).toBe("dead");
  });

  it("backs off exponentially when asked", async () => {
    const q = await open({ backoff: { base: "1s", max: "3s" } });
    await q.add({ key: "a" });
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      await client.execute("UPDATE _ngn_jobs SET run_after = 0");
      const [job] = await q.claim({ limit: 1 });
      const before = Date.now();
      await q.fail(job, "x");
      const { rows } = await client.execute("SELECT run_after FROM _ngn_jobs");
      delays.push(Math.round((Number(rows[0].run_after) - before) / 1000));
    }
    expect(delays).toEqual([1, 2, 3]);
  });

  it("refunds the attempt on release", async () => {
    const q = await open();
    await q.add({ key: "a" });
    const [job] = await q.claim({ limit: 1 });
    await q.release(job);
    const [again] = await q.claim({ limit: 1 });
    expect(again.attempts).toBe(1);
  });

  it("will not settle a job whose lease moved on", async () => {
    const q = await open({ lease: 20 });
    await q.add({ key: "a" });
    const [stale] = await q.claim({ limit: 1 });
    await sleep(30);
    const [fresh] = await q.claim({ limit: 1 });

    expect(await q.complete(stale)).toBe(false);
    expect(await statusOf(q, "a")).toBe("leased");
    expect(await q.complete(fresh)).toBe(true);
  });
});

describe("park, reopen, prune", () => {
  it("parks by group and reopens with attempts reset", async () => {
    const q = await open();
    await q.add([{ key: "a", group: "readable" }, { key: "b", group: "unknown" }, { key: "c" }]);

    expect(await q.park({ groupNotIn: ["readable"] }, "no extractor")).toBe(2);
    expect((await q.claim({ limit: 10 })).map((job) => job.key)).toEqual(["a"]);
    expect((await q.get("b"))?.lastError).toBe("no extractor");

    expect(await q.reopen({ group: "unknown" })).toBe(1);
    expect((await q.claim({ limit: 10 })).map((job) => job.key)).toEqual(["b"]);
  });

  it("reopens dead jobs when asked", async () => {
    const q = await open({ maxAttempts: 1 });
    await q.add({ key: "a" });
    const [job] = await q.claim({ limit: 1 });
    await q.fail(job, "x");
    expect(await q.reopen({}, { from: ["dead"] })).toBe(1);
    expect((await q.claim({ limit: 1 }))[0].attempts).toBe(1);
  });

  it("prunes finished jobs, freeing their keys", async () => {
    const q = await open();
    await q.add({ key: "a" });
    await q.complete((await q.claim({ limit: 1 }))[0]);
    await sleep(5);
    expect(await q.prune({ olderThan: 1 })).toBe(1);
    expect(await q.add({ key: "a" })).toBe(1);
  });
});

describe("stats", () => {
  it("counts by status and ages the oldest ready job", async () => {
    const q = await open();
    await q.add([{ key: "a" }, { key: "b" }, { key: "c", delay: "1h" }]);
    await q.complete((await q.claim({ limit: 1 }))[0]);
    await sleep(5);

    const stats = await q.stats();
    expect(stats).toMatchObject({ ready: 2, due: 1, leased: 0, done: 1, dead: 0, parked: 0 });
    expect(stats.oldestReadyAgeMs).toBeGreaterThan(0);
  });
});

describe("ctx.queue", () => {
  it("opens a queue in the task's own database, shared between tasks there", async () => {
    const h = await createHarness();
    const producer = await h.task(
      "tasks/produce.ts",
      `export const task = async (ctx) => {
        const q = await ctx.queue("work", { db: await ctx.sqlite.initDB({ file: "shared.db" }) });
        return q.add([{ key: "x", payload: 1 }, { key: "y", payload: 2 }]);
      };`,
    );
    const consumer = await h.task(
      "tasks/consume.ts",
      `export const task = async (ctx) => {
        const q = await ctx.queue("work", { db: await ctx.sqlite.initDB({ file: "shared.db" }) });
        const jobs = await q.claim({ limit: 10 });
        for (const job of jobs) await q.complete(job);
        return jobs.map((job) => job.payload).sort();
      };`,
    );

    expect(await producer.execute()).toBe(2);
    expect(await consumer.execute()).toEqual([1, 2]);
    h.dispose();
  });
});
