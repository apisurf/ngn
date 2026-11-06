import { describe, expect, it } from "vitest";
import { explainRun, formatRunQuery, parseRunQuery } from "../src/describe/index";

const now = new Date(2026, 10, 5, 12, 0).getTime();

describe("parseRunQuery", () => {
  it("reads key:value tokens, exclusions and free text", () => {
    const { tokens, errors } = parseRunQuery("task:extract status:failed -origin:editor sync", now);
    expect(errors).toEqual([]);
    expect(tokens).toEqual([
      { key: "task", value: "extract", negate: false },
      { key: "status", value: "failed", negate: false },
      { key: "origin", value: "editor", negate: true },
      { key: "text", value: "sync", negate: false },
    ]);
  });

  it("takes stored and everyday spellings of a status", () => {
    const statuses = parseRunQuery("status:failure status:success status:open", now).tokens;
    expect(statuses.map((t) => t.value)).toEqual(["failed", "succeeded", "running"]);
  });

  it("anchors times to now, or reads a date", () => {
    const [since, until] = parseRunQuery("since:24h until:2026-11-01", now).tokens;
    expect(since).toMatchObject({ key: "since", at: now - 86_400_000 });
    expect(until).toMatchObject({ key: "until", at: new Date(2026, 10, 1).getTime() });
  });

  it("reports what it cannot read, and keeps the rest", () => {
    const { tokens, errors } = parseRunQuery("color:red status:meh since:soon task:a", now);
    expect(tokens).toEqual([{ key: "task", value: "a", negate: false }]);
    expect(errors).toEqual([
      expect.stringContaining('unknown filter "color:"'),
      expect.stringContaining('unknown status "meh"'),
      expect.stringContaining('"since:soon" is not a time'),
    ]);
  });

  it("writes tokens back as text it reads the same way", () => {
    const text = 'task:"api sync" -status:skipped version:3 since:7d';
    const { tokens } = parseRunQuery(text, now);
    expect(formatRunQuery(tokens)).toBe(text);
    expect(parseRunQuery(formatRunQuery(tokens), now).tokens).toEqual(tokens);
  });
});

describe("explainRun", () => {
  const base = {
    id: 4,
    status: "skipped",
    stalled: false,
    skip_reason: null,
    blocked_by: null,
    attempt: 1,
  };
  const context = {
    attempts: [{ id: 4, status: "skipped" }],
    failure: null,
    hasOnError: false,
    stall: null,
    locks: [],
  };

  it("says why a run was skipped, naming the run it waited on", () => {
    const story = explainRun(
      { ...base, skip_reason: "previous run still in progress", blocked_by: 2 },
      context,
      now,
    );
    expect(story).toMatchObject({ title: "Skipped — the previous run was still going" });
    expect(story?.detail).toContain("Run #2 was still going");
  });

  it("leads a failure with what it threw, titled by where", () => {
    const failed = { ...base, status: "failure" };
    expect(explainRun(failed, { ...context, failure: "upstream 503" }, now)).toMatchObject({
      tone: "bad",
      title: "The task failed",
      detail: "upstream 503",
    });
    expect(
      explainRun(failed, { ...context, failure: "Failed in shouldSkip: Error: no config" }, now),
    ).toMatchObject({
      title: "shouldSkip threw",
      detail: "Failed in shouldSkip: Error: no config",
    });
    expect(explainRun(failed, context, now)?.detail).toContain("No error was recorded");
  });

  it("calls a stalled run what it is", () => {
    const stall = {
      started_at: now - 3_600_000,
      window_ms: 300_000,
      skipped_since: 2,
      lease_expired: false,
    };
    const story = explainRun(
      { ...base, status: "running", stalled: true },
      { ...context, stall },
      now,
    );
    expect(story).toMatchObject({ tone: "warn", title: "Stalled — no end recorded" });
    expect(story?.detail).toContain("held back 2 ticks");
  });

  it("has nothing to say about a plain success", () => {
    expect(explainRun({ ...base, status: "success" }, context, now)).toBeNull();
  });
});
