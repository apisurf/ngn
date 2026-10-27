import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toMs } from "../src/runtime/duration.js";
import { deadlineSignal, runDeadline } from "../src/runtime/runWindow.js";
import { createHarness, type Harness } from "./helpers.js";

describe("toMs", () => {
  it("reads milliseconds and unit strings", () => {
    expect(toMs(250)).toBe(250);
    expect(toMs("500ms")).toBe(500);
    expect(toMs("30s")).toBe(30_000);
    expect(toMs("4m")).toBe(240_000);
    expect(toMs("1.5h")).toBe(5_400_000);
  });

  it("refuses anything else, saying what it was for", () => {
    expect(() => toMs("soon", "budget")).toThrow(/Invalid budget "soon"/);
    expect(() => toMs(-1)).toThrow();
  });
});

describe("runDeadline", () => {
  const T = 1_000_000;

  it("leaves a tenth of the period before the next tick, at most five seconds", () => {
    expect(runDeadline({ startedAt: T, scheduledAt: T, nextAt: T + 10_000, budgetMs: null })).toBe(
      T + 9_000,
    );
    expect(runDeadline({ startedAt: T, scheduledAt: T, nextAt: T + 300_000, budgetMs: null })).toBe(
      T + 295_000,
    );
  });

  it("lets a budget bring it closer, never push it past the next tick", () => {
    const window = { startedAt: T, scheduledAt: T, nextAt: T + 300_000 };
    expect(runDeadline({ ...window, budgetMs: 60_000 })).toBe(T + 60_000);
    expect(runDeadline({ ...window, budgetMs: 600_000 })).toBe(T + 295_000);
  });

  it("has none without a schedule or budget", () => {
    expect(
      runDeadline({ startedAt: T, scheduledAt: null, nextAt: null, budgetMs: null }),
    ).toBeNull();
    expect(runDeadline({ startedAt: T, scheduledAt: null, nextAt: null, budgetMs: 5_000 })).toBe(
      T + 5_000,
    );
  });
});

describe("deadlineSignal", () => {
  it("aborts at the deadline", async () => {
    const { signal } = deadlineSignal(Date.now() + 20);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(true);
  });

  it("aborts straight away when the deadline has passed, and never without one", () => {
    expect(deadlineSignal(Date.now() - 1).signal.aborted).toBe(true);
    expect(deadlineSignal(null).signal.aborted).toBe(false);
  });

  it("stays quiet once disposed", async () => {
    const { signal, dispose } = deadlineSignal(Date.now() + 20);
    dispose();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(false);
  });
});

describe("ctx.run", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.dispose());

  const REPORT = `export const task = async (ctx) => ({
    id: ctx.run.id, scheduledAt: ctx.run.scheduledAt, nextAt: ctx.run.nextAt,
    deadline: ctx.run.deadline, aborted: ctx.run.signal.aborted,
  });`;

  it("carries the tick's schedule and a deadline before the next one", async () => {
    const task = await h.task("tasks/report.ts", REPORT);
    const now = Date.now();
    const seen = await task.execute({ scheduledAt: now, nextAt: now + 60_000 });
    const [run] = await h.query<{ id: number }>("SELECT id FROM task_runs");

    expect(seen).toEqual({
      id: run.id,
      scheduledAt: now,
      nextAt: now + 60_000,
      deadline: now + 55_000,
      aborted: false,
    });
  });

  it("has no deadline for a run with no schedule", async () => {
    const task = await h.task("tasks/report.ts", REPORT);
    expect(await task.execute()).toMatchObject({ nextAt: null, deadline: null });
  });

  it("caps the deadline with a budget export", async () => {
    const task = await h.task("tasks/report.ts", `export const budget = "2s";\n${REPORT}`);
    const before = Date.now();
    const seen = (await task.execute()) as { deadline: number };
    expect(seen.deadline).toBeGreaterThanOrEqual(before + 2_000);
    expect(seen.deadline).toBeLessThanOrEqual(Date.now() + 2_000);
  });

  it("refuses a bad budget when the task is checked for scheduling", async () => {
    const task = await h.task("tasks/report.ts", `export const budget = "later";\n${REPORT}`);
    await task.loadEntry();
    expect(() => task.validateExports()).toThrow(/Invalid budget for tasks\/report\.ts "later"/);
  });
});
