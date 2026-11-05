import { describe, expect, it } from "vitest";
import { runsQueryOf, withWindow } from "../src/lib/runs-query";

describe("runsQueryOf", () => {
  it("keeps the filter text", () => {
    expect(runsQueryOf({ q: "task:extract status:failed" })).toBe("task:extract status:failed");
    expect(runsQueryOf({})).toBeUndefined();
  });

  it("turns the separate params older links carry into filter tokens", () => {
    expect(runsQueryOf({ status: "stalled" })).toBe("status:stalled");
    expect(runsQueryOf({ q: "sync", origin: "editor" })).toBe("sync origin:editor");
    expect(runsQueryOf({ hideLive: true })).toBe("origin:scheduled");
  });
});

describe("withWindow", () => {
  const since = new Date(2026, 9, 27, 22, 0).getTime();
  const until = new Date(2026, 9, 27, 23, 30).getTime();

  it("replaces the time window and keeps every other token", () => {
    expect(withWindow("task:extract since:7d", { since, until })).toBe(
      "task:extract since:2026-10-27T22:00 until:2026-10-27T23:30",
    );
  });

  it("clears it", () => {
    expect(withWindow("since:24h status:failed until:1h", null)).toBe("status:failed");
  });
});
