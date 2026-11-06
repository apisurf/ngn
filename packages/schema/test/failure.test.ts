import { describe, expect, it } from "vitest";
import {
  errorFrames,
  errorSummary,
  failureLine,
  failureMessage,
  readFailureLine,
} from "../src/describe/index.js";

const error = (message: string, stack: string[]) =>
  Object.assign(new TypeError(message), { stack: [`TypeError: ${message}`, ...stack].join("\n") });

describe("what a run threw", () => {
  it("names the error, whatever was thrown", () => {
    expect(errorSummary(new TypeError("bad"))).toBe("TypeError: bad");
    expect(errorSummary(new Error(""))).toBe("Error");
    expect(errorSummary("plain string")).toBe("plain string");
    expect(errorSummary({ code: 5 })).toBe('{"code":5}');
    // An error from the task's VM context is not `instanceof Error` here.
    expect(errorSummary({ name: "RangeError", message: "far" })).toBe("RangeError: far");
  });

  it("keeps the task's frames and stops at ngn's", () => {
    const thrown = error("x", [
      "    at task (evalmachine.<anonymous>:30:75)",
      "    at helper (evalmachine.<anonymous>:12:3)",
      "    at async Task.executeOnce (file:///p/node_modules/@apisurf/ngn-core/dist/core.js:1446:21)",
      "    at async later (file:///p/x.js:1:1)",
    ]);
    expect(errorFrames(thrown)).toEqual([
      "    at task (evalmachine.<anonymous>:30:75)",
      "    at helper (evalmachine.<anonymous>:12:3)",
    ]);
  });

  it("writes the stage and error first, then the cause and the frames", () => {
    const thrown = Object.assign(error("closed", ["    at task (evalmachine.<anonymous>:3:1)"]), {
      cause: new Error("SQLITE_MISUSE"),
    });
    expect(failureLine("task", thrown)).toBe(
      [
        "Failed in task: TypeError: closed",
        "Caused by: Error: SQLITE_MISUSE",
        "    at task (evalmachine.<anonymous>:3:1)",
      ].join("\n"),
    );
  });

  it("reads back the lines it wrote, and nothing else", () => {
    expect(readFailureLine("Failed in shouldSkip: Error: no\n    at x")).toEqual({
      stage: "shouldSkip",
      message: "Error: no",
    });
    expect(readFailureLine("Failed in parsing: not ours")).toBeNull();
    expect(readFailureLine("Task failed")).toBeNull();
  });

  it("explains a failed run by what it threw, before anything the task logged", () => {
    const logs = [
      { status: "info", value: "Task started" },
      { status: "error", value: "Failed in task: Error: boom\n    at task (x:1:1)" },
      { status: "error", value: "Task failed" },
      { status: "error", value: "onError says: boom" },
      { status: "error", value: "Failed in onError: Error: mail down" },
    ];
    expect(failureMessage(logs)).toBe("Failed in task: Error: boom");
  });

  it("falls back to the last error the task logged on runs from before", () => {
    const logs = [
      { status: "error", value: "upstream 503" },
      { status: "error", value: "Task failed" },
    ];
    expect(failureMessage(logs)).toBe("upstream 503");
  });
});
