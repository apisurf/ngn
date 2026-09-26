import { describe, expect, it } from "vitest";
import { parseStructured, prettyJson } from "../src/lib/json";
import {
  cronOf,
  describeCron,
  describeTask,
  hooksOf,
  isLifecycle,
  logLevel,
  percentile,
  runLabel,
  runTone,
  seriesSlot,
  sourceOf,
} from "../src/lib/ngn";

/** What esbuild emits for a task file, as ngn stores it. */
const COMPILED = `var __exports = (() => {
  var __defProp = Object.defineProperty;
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tasks/api/sync-users.ts
  var sync_users_exports = {};
  __export(sync_users_exports, {
    onError: () => onError,
    shouldSkip: () => shouldSkip,
    task: () => task,
    timing: () => timing
  });
  var timing = "*/3 * * * * *";
  var task = async (ctx) => {
    await ctx.log.info("fetching users");
  };
  var shouldSkip = async () => false;
  var onError = async (err, ctx) => {
    await ctx.log.error(\`sync failed: \${err.message}\`);
  };
  return __toCommonJS(sync_users_exports);
})();
`;

describe("compiled code", () => {
  it("reads the schedule out of a string-literal export", () => {
    expect(cronOf(COMPILED)).toBe("*/3 * * * * *");
    expect(cronOf("var timing = computeIt();")).toBeNull();
    expect(cronOf(null)).toBeNull();
  });

  it("lists the optional hooks a task exports", () => {
    expect(hooksOf(COMPILED)).toEqual(["shouldSkip", "onError"]);
    expect(hooksOf("")).toEqual([]);
  });

  it("peels esbuild's wrapper and export table off, leaving the task", () => {
    expect(sourceOf(COMPILED)).toBe(`var timing = "*/3 * * * * *";
var task = async (ctx) => {
  await ctx.log.info("fetching users");
};
var shouldSkip = async () => false;
var onError = async (err, ctx) => {
  await ctx.log.error(\`sync failed: \${err.message}\`);
};`);
  });

  it("returns code of any other shape whole", () => {
    expect(sourceOf("export const task = () => 1;")).toBe("export const task = () => 1;");
  });
});

describe("describeCron", () => {
  it.each([
    ["*/5 * * * * *", "every 5 seconds"],
    ["* * * * * *", "every second"],
    ["0 */15 * * * *", "every 15 minutes"],
    ["0 * * * * *", "every minute"],
    ["0 0 * * * *", "every hour"],
    ["0 30 * * * *", "hourly at :30"],
    ["0 0 9 * * *", "daily at 09:00"],
    ["0 30 9 * * *", "daily at 09:30"],
    ["0 0 0 * * *", "daily at midnight"],
    ["*/10 * * * *", "every 10 minutes"],
  ])("reads %s as %s", (pattern, words) => {
    expect(describeCron(pattern)).toBe(words);
  });

  it("leaves anything more particular to the pattern itself", () => {
    expect(describeCron("0 0 9 * * 1-5")).toBeNull();
    expect(describeCron("15 * * * * *")).toBeNull();
    expect(describeCron("not a cron")).toBeNull();
  });
});

describe("runs and logs", () => {
  it("gives each status a tone and a label", () => {
    expect([
      runTone("success"),
      runTone("failure"),
      runTone("skipped"),
      runTone("running"),
    ]).toEqual(["ok", "bad", "neutral", "info"]);
    expect(runLabel("failure")).toBe("Failed");
    expect(runLabel(null)).toBe("Never ran");
  });

  it("reads `warning` and `warn` as one level", () => {
    expect([logLevel("warning"), logLevel("warn"), logLevel("error"), logLevel("?")]).toEqual([
      "warn",
      "warn",
      "error",
      "info",
    ]);
  });

  it("knows ngn's own lines from a task's", () => {
    expect(isLifecycle("Task failed")).toBe(true);
    expect(isLifecycle("Task failed: upstream")).toBe(false);
  });
});

describe("task paths", () => {
  it("splits a path for display", () => {
    expect(describeTask("tasks/api/health.ts")).toEqual({
      dir: "tasks/api/",
      file: "health.ts",
      live: false,
    });
  });

  it("recognises the live editor's throwaway files, and only at the root", () => {
    expect(describeTask("live-task-1790441764927-awldveehhzi.ts").live).toBe(true);
    expect(describeTask("tasks/live-task-1790441764927-awldveehhzi.ts").live).toBe(false);
    expect(describeTask("live-task-notes.ts").live).toBe(false);
  });
});

describe("numbers", () => {
  it("takes nearest-rank percentiles", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("gives a label the same colour slot every time", () => {
    expect(seriesSlot("fetch")).toBe(seriesSlot("fetch"));
    expect(seriesSlot("fetch")).toBeGreaterThanOrEqual(0);
    expect(seriesSlot("fetch")).toBeLessThan(8);
  });
});

describe("json", () => {
  it("parses objects and arrays, and leaves scalars as text", () => {
    expect(parseStructured('{"a":1}')).toEqual({ a: 1 });
    expect(parseStructured(" [1, 2] ")).toEqual([1, 2]);
    expect(parseStructured("42")).toBeUndefined();
    expect(parseStructured("{not json")).toBeUndefined();
  });

  it("pretty-prints what parses and returns the rest unchanged", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("plain")).toBe("plain");
  });
});
