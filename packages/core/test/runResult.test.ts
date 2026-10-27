import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./helpers.js";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.dispose());

async function storedResult(source: string) {
  const task = await h.task("tasks/result.ts", source);
  await task.execute();
  const [run] = await h.query<{ result: string | null }>("SELECT result FROM task_runs");
  return run.result;
}

describe("task_runs.result", () => {
  it("stores what the task returned, as JSON", async () => {
    expect(await storedResult(`export const task = async () => ({ fetched: 3, ok: true });`)).toBe(
      '{"fetched":3,"ok":true}',
    );
  });

  it("stores NULL when the task returns nothing", async () => {
    expect(await storedResult(`export const task = async () => {};`)).toBeNull();
  });

  it("stores a value JSON cannot carry as its string form, and the run still succeeds", async () => {
    const result = await storedResult(
      `export const task = async () => { const a = {}; a.self = a; return a; };`,
    );
    expect(result).toBe("[object Object]");
    const [run] = await h.query<{ status: string }>("SELECT status FROM task_runs");
    expect(run.status).toBe("success");
  });
});
