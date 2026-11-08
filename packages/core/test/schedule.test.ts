import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCronPatternValid } from "../src/runtime/cron.js";
import { createHarness, startScheduler, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

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

const withOverlap = (overlap: string) => `
  export const timing = "0 0 1 1 *";
  export const overlap = ${JSON.stringify(overlap)};
  export const task = async () => {};`;

describe("overlap", () => {
  it('refuses overlap = "allow" when scheduling, saying why', async () => {
    const { report, scheduler } = await startScheduler(h, {
      "tasks/both.ts": withOverlap("allow"),
    });
    await scheduler.stop();
    expect(report.failed).toEqual([
      {
        path: "tasks/both.ts",
        reason:
          'overlap "allow": ngn runs one run of a task at a time, across every process on the database, so a task cannot run beside itself',
      },
    ]);
  });

  it("refuses an unknown overlap value when scheduling, naming the task", async () => {
    const { report, scheduler } = await startScheduler(h, { "tasks/typo.ts": withOverlap("skp") });
    await scheduler.stop();
    expect(report.failed).toEqual([
      { path: "tasks/typo.ts", reason: 'Invalid overlap "skp": expected "skip"' },
    ]);
  });

  it('keeps accepting overlap = "skip", which is what ngn does anyway', async () => {
    const { report, scheduler } = await startScheduler(h, { "tasks/ok.ts": withOverlap("skip") });
    await scheduler.stop();
    expect(report.scheduled.map((t) => t.path)).toEqual(["tasks/ok.ts"]);
  });
});
