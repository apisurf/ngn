import { describe, expect, it } from "vitest";
import { formatAgo, formatDay, plural, verdict } from "../src/describe/index";

const now = new Date(2026, 10, 5, 12, 0, 0).getTime();
const day = 86_400_000;

describe("verdict", () => {
  it("says all is well, or that nothing is scheduled", () => {
    expect(verdict({ tasks: 2, failing: 0, stalled: [], stale: 0 }, now)).toEqual({
      tone: "ok",
      text: "All 2 tasks healthy",
    });
    expect(verdict({ tasks: 0, failing: 0, stalled: [], stale: 0 }, now).text).toBe(
      "Nothing scheduled yet",
    );
  });

  it("mentions paused tasks without counting them as a problem", () => {
    expect(verdict({ tasks: 3, failing: 0, stalled: [], stale: 0, paused: 2 }, now)).toEqual({
      tone: "ok",
      text: "All 3 tasks healthy · 2 paused",
    });
    expect(verdict({ tasks: 3, failing: 1, stalled: [], stale: 0, paused: 1 }, now)).toEqual({
      tone: "bad",
      text: "1 task failing · 1 paused",
    });
  });

  it("names stalled runs and what they hold back, in amber", () => {
    const started = new Date(2026, 9, 27, 22, 0).getTime();
    expect(
      verdict(
        {
          tasks: 2,
          failing: 0,
          stalled: [{ started_at: started, file: "extract.ts", skipped_since: 2 }],
          stale: 0,
        },
        now,
      ),
    ).toEqual({ tone: "warn", text: "1 run stalled since 27 Oct · extract.ts skipping ticks" });
  });

  it("is red once anything fails", () => {
    expect(verdict({ tasks: 3, failing: 1, stalled: [], stale: 2 }, now)).toEqual({
      tone: "bad",
      text: "1 task failing · 2 locks left behind",
    });
  });
});

describe("time", () => {
  it("reads how long ago, then a date", () => {
    expect(formatAgo(now, now - 5000)).toBe("just now");
    expect(formatAgo(now, now - 4 * 60_000)).toBe("4 min ago");
    expect(formatAgo(now, now - 3 * day)).toBe("3 d ago");
    expect(formatDay(now, now - 30 * day)).toBe("6 Oct");
    expect(plural(1, "run")).toBe("1 run");
    expect(plural(1200, "run")).toBe("1,200 runs");
  });
});
