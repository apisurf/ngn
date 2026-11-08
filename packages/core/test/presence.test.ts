import { spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskLibraryScheduler } from "../src/runtime/taskLibraryScheduler.js";
import {
  countEvents,
  createFakeClock,
  createHarness,
  scheduleEvents,
  scheduleRow,
  startScheduler,
  until,
  type FakeClock,
  type Harness,
} from "./helpers.js";
import { expectScheduleInvariants } from "./invariants.js";

const MIN = 60_000;
const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime();
const PATH = "tasks/t.ts";
const SOURCE = `export const timing = { every: "5m" }; export const task = async () => {};`;

let h: Harness;
let clock: FakeClock;
let schedulers: TaskLibraryScheduler[];

beforeEach(async () => {
  h = await createHarness({ file: true });
  clock = createFakeClock(T0);
  schedulers = [];
});

afterEach(async () => {
  await Promise.all(schedulers.map((s) => s.stop({ graceMs: 0 })));
  await expectScheduleInvariants(h);
  h.dispose();
});

async function start(options: Parameters<typeof startScheduler>[2] = {}) {
  const started = await startScheduler(h, { [PATH]: SOURCE }, { clock, ...options });
  schedulers.push(started.scheduler);
  return started;
}

const presence = () =>
  h.query<{ name: string }>("SELECT name FROM locks WHERE name LIKE 'ngn:process:%'");

/** A presence lease as another process would have left it. */
const leftBehind = (name: string, expiresAt: number) =>
  h.db.execute({
    sql: "INSERT INTO locks (name, holder, task_run_id, acquired_at, expires_at) VALUES (?, 'x', NULL, 0, ?)",
    args: [`ngn:process:${name}`, expiresAt],
  });

/** Run the task once, stop, and move the clock on: a stored next run of 10:05 still to come. */
async function ranOnceThenStopped() {
  const { scheduler } = await start();
  await until(async () => (await countEvents(h, PATH, "decided")) === 1);
  await scheduler.stop();
  schedulers.length = 0;
  clock.set(T0 + 2 * MIN);
}

const lastEvent = async () => (await scheduleEvents(h, PATH)).at(-1);

describe("an ngn run's presence", () => {
  it("is held while it runs and released when it stops", async () => {
    const { scheduler } = await start();
    expect(await presence()).toHaveLength(1);
    await scheduler.stop();
    schedulers.length = 0;
    expect(await presence()).toEqual([]);
  });

  it("makes a second ngn run keep the interval schedules it finds", async () => {
    await start();
    await until(async () => (await countEvents(h, PATH, "decided")) === 1);
    clock.set(T0 + 2 * MIN);

    await start({ via: await h.connect() });
    expect(await lastEvent()).toMatchObject({ event: "decided", next_at: T0 + 5 * MIN });
    expect(await presence()).toHaveLength(2);
  });

  it("is cleared at once when its process on this machine has ended", async () => {
    await ranOnceThenStopped();
    const { pid } = spawnSync(process.execPath, ["-e", ""]);
    await leftBehind(`${hostname()}:${pid}:dead`, Date.now() + 60 * MIN);

    await start();
    expect(await lastEvent()).toMatchObject({ event: "rescheduled", next_at: T0 + 2 * MIN });
    expect((await presence()).map((l) => l.name)).not.toContain(
      `ngn:process:${hostname()}:${pid}:dead`,
    );
  });

  it("is cleared once it expires when its process ran elsewhere", async () => {
    await ranOnceThenStopped();
    await leftBehind("elsewhere:1:expired", Date.now() - 1);

    await start();
    expect(await lastEvent()).toMatchObject({ event: "rescheduled", next_at: T0 + 2 * MIN });
    expect(await presence()).toHaveLength(1);
  });

  it("counts until it expires when its process ran elsewhere", async () => {
    await ranOnceThenStopped();
    await leftBehind("elsewhere:1:live", Date.now() + 60 * MIN);

    await start();
    expect(await lastEvent()).toMatchObject({ event: "decided", next_at: T0 + 5 * MIN });
    expect((await scheduleRow(h, PATH))?.next_at).toBe(T0 + 5 * MIN);
  });
});
