import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDbClient, type Client } from "@apisurf/ngn-persistence";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openQueue, type Queue } from "../src/runtime/queue/queue.js";
import { createHarness } from "./helpers.js";

let dir: string;
let client: Client;
let q: Queue<number>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "ngn-work-test-"));
  client = openDbClient(`file:${join(dir, "data.db")}`);
  q = await openQueue<number>(client, "jobs", {}, { nextAt: null });
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, n) => sum + n, 0);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Jobs `${group}${n}` for each group, n from 1. */
const jobsFor = (groups: Record<string, number>) =>
  Object.entries(groups).flatMap(([group, count]) =>
    Array.from({ length: count }, (_, i) => ({ key: `${group}${i + 1}`, group, payload: i + 1 })),
  );

async function statuses() {
  const { rows } = await client.execute("SELECT key, status FROM _ngn_jobs ORDER BY key");
  return Object.fromEntries(rows.map((row) => [row.key, row.status]));
}

describe("work", () => {
  it("works the queue empty and reports what it did", async () => {
    await q.add(jobsFor({ a: 2, b: 1 }));
    const seen: string[] = [];

    const summary = await q.work(async (job) => {
      seen.push(job.key!);
    });

    expect(seen.toSorted()).toEqual(["a1", "a2", "b1"]);
    expect(summary).toMatchObject({
      done: 3,
      failed: 0,
      released: 0,
      remaining: 0,
      oldestAgeMs: null,
      stoppedBy: "empty",
    });
  });

  it("fails a job whose handler throws, and counts the ones that died", async () => {
    const dying = await openQueue<number>(client, "dying", { maxAttempts: 1 }, { nextAt: null });
    await dying.add([{ key: "ok" }, { key: "bad" }]);

    const summary = await dying.work(async (job) => {
      if (job.key === "bad") throw new Error("broken page");
    });

    expect(summary).toMatchObject({ done: 1, failed: 1, dead: 1 });
    expect((await dying.get("bad"))?.lastError).toBe("broken page");
  });

  it("never works two jobs of one group at once, and spreads across groups", async () => {
    await q.add(jobsFor({ a: 4, b: 4, c: 4 }));
    const inFlight = new Map<string, number>();
    let overlap = false;
    let peak = 0;

    await q.work(
      async (job) => {
        const now = (inFlight.get(job.group!) ?? 0) + 1;
        inFlight.set(job.group!, now);
        if (now > 1) overlap = true;
        peak = Math.max(peak, total(inFlight));
        await sleep(5);
        inFlight.set(job.group!, now - 1);
      },
      { concurrency: 3 },
    );

    expect(overlap).toBe(false);
    expect(peak).toBe(3);
    expect(Object.values(await statuses()).every((status) => status === "done")).toBe(true);
  });

  it("stops at max and at perGroup, leaving the rest ready", async () => {
    await q.add(jobsFor({ a: 3, b: 3 }));
    const capped = await q.work(async () => {}, { max: 2 });
    expect(capped).toMatchObject({ done: 2, stoppedBy: "max", remaining: 4 });

    const perGroup = await q.work(async () => {}, { perGroup: 1 });
    expect(perGroup).toMatchObject({ done: 2, remaining: 2 });
  });

  it("gives each group its own cap when perGroup is a function", async () => {
    await q.add(jobsFor({ fast: 4, slow: 4, off: 2 }));
    const caps: Record<string, number> = { fast: 3, slow: 1, off: 0 };

    const summary = await q.work(async () => {}, { perGroup: (group) => caps[group] });

    expect(summary.done).toBe(4);
    const { rows } = await client.execute(
      "SELECT grp, COUNT(*) AS n FROM _ngn_jobs WHERE status = 'done' GROUP BY grp ORDER BY grp",
    );
    expect(rows.map((row) => [row.grp, row.n])).toEqual([
      ["fast", 3],
      ["slow", 1],
    ]);
    const { rows: off } = await client.execute(
      "SELECT status, attempts FROM _ngn_jobs WHERE grp = 'off'",
    );
    expect(off.map((row) => [row.status, row.attempts])).toEqual([
      ["ready", 0],
      ["ready", 0],
    ]);
  });

  it("stops taking jobs at the deadline, finishing the one in hand", async () => {
    await q.add(jobsFor({ a: 5 }));
    const controller = new AbortController();

    const summary = await q.work(
      async (job) => {
        if (job.key === "a2") controller.abort();
        await sleep(1);
      },
      { until: controller.signal },
    );

    expect(summary).toMatchObject({ done: 2, stoppedBy: "deadline", remaining: 3 });
    expect(await q.stats()).toMatchObject({ leased: 0, ready: 3 });
  });

  it("takes an epoch-ms until as well as a signal", async () => {
    await q.add(jobsFor({ a: 3 }));
    const summary = await q.work(async () => {}, { until: Date.now() - 1 });
    expect(summary).toMatchObject({ done: 0, stoppedBy: "deadline" });
  });

  it("stops a group and hands its jobs back without spending attempts", async () => {
    await q.add(jobsFor({ walled: 3, open: 2 }));
    const seen: string[] = [];

    const summary = await q.work(
      async (job, worker) => {
        seen.push(job.key!);
        if (job.group === "walled") worker.stopGroup();
      },
      { concurrency: 2 },
    );

    expect(seen.filter((key) => key.startsWith("walled"))).toHaveLength(1);
    expect(summary.stoppedGroups).toEqual(["walled"]);
    expect(summary.done).toBe(2);
    const { rows } = await client.execute(
      "SELECT status, attempts FROM _ngn_jobs WHERE grp = 'walled'",
    );
    expect(rows.map((row) => [row.status, row.attempts])).toEqual([
      ["ready", 0],
      ["ready", 0],
      ["ready", 0],
    ]);
  });

  it("tries a job once per call, even when its backoff has already passed", async () => {
    // No next tick to back off to, as under run:once: a failed job is due again at once.
    const flaky = await openQueue<number>(client, "flaky", { maxAttempts: 3 }, { nextAt: null });
    await flaky.add([{ key: "x" }]);
    let calls = 0;

    const summary = await flaky.work(async () => {
      calls++;
      throw new Error("down");
    });

    expect(calls).toBe(1);
    expect(summary).toMatchObject({ failed: 1, dead: 0, remaining: 1 });
    expect((await flaky.get("x"))?.attempts).toBe(1);
  });

  it("releases one job on request", async () => {
    await q.add([{ key: "x" }]);
    const summary = await q.work(async (_job, worker) => worker.release({ delay: "1h" }));
    expect(summary).toMatchObject({ done: 0, released: 1, remaining: 0 });
    expect((await q.get("x"))?.status).toBe("ready");
  });

  it("sets each worker up on its first job only, and tears it down", async () => {
    const events: string[] = [];
    const worker = {
      setup: (index: number) => {
        events.push(`setup ${index}`);
        return `tab ${index}`;
      },
      teardown: (resource: string) => {
        events.push(`teardown ${resource}`);
      },
    };

    await q.work(async () => {}, { worker });
    expect(events).toEqual([]);

    await q.add([{ key: "x" }]);
    const resources: string[] = [];
    await q.work(async (_job, handle) => resources.push(handle.resource), { worker });
    expect(resources).toEqual(["tab 0"]);
    expect(events).toEqual(["setup 0", "teardown tab 0"]);
  });

  it("hands back claimed jobs it never started when a worker breaks", async () => {
    await q.add(jobsFor({ a: 1, b: 1, c: 1 }));
    let setups = 0;
    let handled = 0;

    await expect(
      q.work(
        async () => {
          handled++;
          await sleep(5);
        },
        {
          concurrency: 3,
          worker: {
            setup: () => {
              if (++setups === 2) throw new Error("no browser");
            },
          },
        },
      ),
    ).rejects.toThrow("no browser");

    expect(await q.stats()).toMatchObject({ leased: 0 });
    const { rows } = await client.execute("SELECT SUM(attempts) AS spent FROM _ngn_jobs");
    // Only jobs that a handler actually ran have spent an attempt.
    expect(handled).toBeGreaterThan(0);
    expect(Number(rows[0].spent)).toBe(handled);
  });
});

describe("ctx.queue work", () => {
  it("stops at the run's deadline by default, and its summary is the run's result", async () => {
    const h = await createHarness();
    const task = await h.task(
      "tasks/drain.ts",
      `export const budget = 50;
       export const task = async (ctx) => {
         const q = await ctx.queue("slow");
         await q.add(Array.from({ length: 20 }, (_, i) => ({ key: "k" + i })));
         return q.work(() => new Promise((resolve) => setTimeout(resolve, 20)));
       };`,
    );

    const summary = (await task.execute()) as {
      done: number;
      stoppedBy: string;
      remaining: number;
    };
    expect(summary.stoppedBy).toBe("deadline");
    expect(summary.done).toBeGreaterThan(0);
    expect(summary.done + summary.remaining).toBe(20);

    const [run] = await h.query<{ result: string }>("SELECT result FROM task_runs");
    expect(JSON.parse(run.result)).toMatchObject({ stoppedBy: "deadline" });
    h.dispose();
  });
});
