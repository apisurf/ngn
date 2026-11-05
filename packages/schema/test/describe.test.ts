import { describe, expect, it } from "vitest";
import {
  configOf,
  cronOf,
  describeCron,
  describeTask,
  formatMs,
  formatSpan,
  hooksOf,
  isLifecycle,
  logLevel,
  percentile,
  readSkip,
  runLabel,
  sourceOf,
} from "../src/describe/index";

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

  it("reads the scheduling exports, literal or not", () => {
    const code = `
  __export(x_exports, {
    budget: () => budget,
    exclusive: () => exclusive,
    overlap: () => overlap,
    retry: () => retry,
    task: () => task
  });
  var overlap = "allow";
  var budget = "2m";
  var exclusive = ["browser", 'screenshots'];
  var retry = {
    attempts: 3,
    delay: "30s",
    breaker: { after: 5 },
  };`;
    expect(configOf(code)).toEqual({
      overlap: "allow",
      budget: "2m",
      exclusive: ["browser", "screenshots"],
      retry: { attempts: 3, delay: "30s", breaker: { after: 5, maxSkip: 32 } },
      computed: [],
    });
    // A value worked out at load time is there, but not readable from the code.
    const computed = `__export(x_exports, { exclusive: () => exclusive, retry: () => retry });
  var exclusive = "lock-" + host;
  var retry = { attempts: 1 };`;
    expect(configOf(computed)).toMatchObject({
      exclusive: [],
      retry: null,
      computed: ["exclusive"],
    });
    // The defaults, for a task that exports none of them — or a variable named alike.
    expect(
      configOf(`__export(x_exports, { task: () => task });\n  var retry = { attempts: 9 };`),
    ).toEqual({
      overlap: "skip",
      budget: null,
      exclusive: [],
      retry: null,
      computed: [],
    });
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
  it("gives each status the glossary's word", () => {
    expect(["success", "failure", "skipped", "running", "pending"].map(runLabel)).toEqual([
      "Succeeded",
      "Failed",
      "Skipped",
      "Running",
      "Running",
    ]);
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
    expect(isLifecycle('Skipped: lock "browser" is held')).toBe(true);
  });

  it("reads why ngn skipped a run", () => {
    expect(readSkip(null)).toMatchObject({ cause: "shouldSkip" });
    expect(readSkip("previous run still in progress")).toMatchObject({ cause: "overlap" });
    expect(readSkip("circuit open after repeated failures")).toMatchObject({ cause: "breaker" });
    expect(readSkip('lock "site:a.com" is held')).toEqual({
      cause: "lock",
      short: "lock site:a.com",
      lock: "site:a.com",
    });
    expect(readSkip("something new")).toMatchObject({ cause: "other", short: "something new" });
  });
});

describe("task paths", () => {
  it("splits a path for display", () => {
    expect(describeTask("tasks/api/health.ts")).toEqual({
      dir: "tasks/api/",
      file: "health.ts",
      editor: false,
    });
  });

  it("recognises the Editor's throwaway files, and only at the root", () => {
    expect(describeTask("live-task-1790441764927-awldveehhzi.ts").editor).toBe(true);
    expect(describeTask("tasks/live-task-1790441764927-awldveehhzi.ts").editor).toBe(false);
    expect(describeTask("live-task-notes.ts").editor).toBe(false);
  });
});

describe("numbers", () => {
  it("takes nearest-rank percentiles", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("reads a duration at the scale it happened on", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(0.42)).toBe("0.42 ms");
    expect(formatMs(318)).toBe("318 ms");
    expect(formatMs(4210)).toBe("4.21 s");
    expect(formatMs(290_000)).toBe("4m 50s");
    expect(formatMs(59 * 60_000 + 59_600)).toBe("1h");
    expect(formatMs(300_000)).toBe("5m");
    expect(formatMs(3 * 3_600_000 + 12 * 60_000)).toBe("3h 12m");
    expect(formatMs(742_909_000)).toBe("8d 14h");
  });

  it("reads how long something has been going on, roughly", () => {
    expect(formatSpan(12_000)).toBe("12 s");
    expect(formatSpan(30 * 60_000)).toBe("30 min");
    expect(formatSpan(5 * 3_600_000)).toBe("5 h");
    expect(formatSpan(9 * 86_400_000)).toBe("9 d");
  });
});
