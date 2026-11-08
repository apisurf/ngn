import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDbFileIfNotExists } from "@apisurf/ngn-persistence";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db";
import { schemaState } from "../src/server/db";
import { parseRunQuery } from "../src/lib/ngn";
import {
  activity,
  facetCounts,
  failingSpell,
  failureMessage,
  getRun,
  getRunResult,
  getTask,
  latestLiveRun,
  countTaskLines,
  listKeys,
  listLocks,
  listLogs,
  listRuns,
  listTasks,
  listVersions,
  listSchedules,
  recentOutcomes,
  runActivity,
  runDecision,
  scheduleEvents,
  runNeighbours,
  skipReasons,
  stalledRuns,
  tickAttempts,
  timingStats,
  workspaceCounts,
} from "../src/server/queries";

const T0 = 1_790_000_000_000;

let path: string;
let db: Db;

beforeEach(async () => {
  path = join(tmpdir(), `ngnui-test-${randomUUID()}.sqlite`);
  // The schema ngn itself creates, so a migration change breaks these tests.
  await initDbFileIfNotExists(`file:${path}`);
  const writer = new Database(path);
  seed(writer);
  writer.close();
  // The UI's own connection shape: read-only, query_only.
  db = new Database(path, { readonly: true });
  db.pragma("query_only = ON");
});

afterEach(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
});

/**
 * Two tasks and one live-editor run, written the way ngn's services write them:
 *
 *   tasks/api/sync.ts   v1: success, failure · v2: success, skipped
 *   tasks/report.ts     never ran
 *   live-task-….ts      one success
 */
function seed(w: Database.Database) {
  const task = w.prepare(
    "INSERT INTO file_tasks (path, parent_path, created_at, updated_at) VALUES (?, ?, ?, ?)",
  );
  const sync = Number(task.run("tasks/api/sync.ts", "tasks/api", T0, T0).lastInsertRowid);
  const report = Number(task.run("tasks/report.ts", "tasks", T0, T0).lastInsertRowid);
  const live = Number(
    task.run("live-task-1790000999000-abc123.ts", ".", T0 + 9000, T0 + 9000).lastInsertRowid,
  );

  const version = w.prepare(
    "INSERT INTO file_task_versions (file_task_id, version, md5_hash, compiled_code, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const v1 = Number(version.run(sync, 1, "aaa", COMPILED, T0).lastInsertRowid);
  const v2 = Number(version.run(sync, 2, "bbb", COMPILED, T0 + 5000).lastInsertRowid);
  version.run(report, 1, "ccc", COMPILED, T0);
  const lv = Number(version.run(live, 1, "ddd", COMPILED, T0 + 9000).lastInsertRowid);

  const run = w.prepare(
    "INSERT INTO task_runs (file_task_id, file_task_version_id, status, created_at, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const log = w.prepare(
    "INSERT INTO logs (file_task_id, task_run_id, status, value, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const timing = w.prepare(
    "INSERT INTO timings (file_task_id, task_run_id, label, value, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  const r1 = Number(run.run(sync, v1, "success", T0, T0, T0 + 100).lastInsertRowid);
  log.run(sync, r1, "info", "Task started", T0);
  log.run(sync, r1, "info", "synced 3 users", T0 + 50);
  log.run(sync, r1, "info", "Task succeeded", T0 + 100);
  timing.run(sync, r1, "fetch", 40, T0 + 60);

  const r2 = Number(run.run(sync, v1, "failure", T0 + 1000, T0 + 1000, T0 + 1300).lastInsertRowid);
  log.run(sync, r2, "info", "Task started", T0 + 1000);
  log.run(sync, r2, "warning", "rate limit close", T0 + 1100);
  log.run(sync, r2, "error", "sync failed: upstream returned 503", T0 + 1250);
  log.run(sync, r2, "error", "Task failed", T0 + 1300);
  timing.run(sync, r2, "fetch", 200, T0 + 1250);

  const r3 = Number(run.run(sync, v2, "success", T0 + 6000, T0 + 6000, T0 + 6050).lastInsertRowid);
  timing.run(sync, r3, "fetch", 30, T0 + 6040);
  timing.run(sync, r3, "write", 5, T0 + 6048);
  run.run(sync, v2, "skipped", T0 + 7000, null, T0 + 7000);

  const r5 = Number(run.run(live, lv, "success", T0 + 9000, T0 + 9000, T0 + 9010).lastInsertRowid);
  log.run(live, r5, "info", '{"rows":2}', T0 + 9005);

  const kv = w.prepare(
    "INSERT INTO kvs (file_task_id, key, value, created_at) VALUES (?, ?, ?, ?)",
  );
  kv.run(sync, "cursor", '{"page":2}', T0);
  kv.run(sync, "count", "3", T0);
}

const COMPILED = `var __exports = (() => {
  // tasks/api/sync.ts
  var sync_exports = {};
  __export(sync_exports, {
    onError: () => onError,
    task: () => task,
    timing: () => timing
  });
  var timing = "*/3 * * * * *";
  var task = async (ctx) => {
    await ctx.log.info("hi");
  };
  var onError = async () => {};
  return __toCommonJS(sync_exports);
})();`;

describe("schema", () => {
  it("recognises ngn's tables, and says which are missing from another file", () => {
    expect(schemaState(db)).toEqual({ state: "current", missing: [] });
    expect(schemaState(null).state).toBe("missing");

    const other = new Database(":memory:");
    other.exec("CREATE TABLE pages (url TEXT)");
    expect(schemaState(other).state).toBe("foreign");
    other.close();
  });
});

describe("workspace", () => {
  it("counts across the whole file, leaving ngn's lifecycle lines out of the logs", () => {
    expect(workspaceCounts(db)).toMatchObject({
      tasks: 3,
      runs: 5,
      succeeded: 3,
      failed: 1,
      skipped: 1,
      open: 0,
      logs: 4,
      errorLogs: 1,
      warnLogs: 1,
      timings: 4,
      keys: 2,
      versions: 4,
    });
  });
});

describe("tasks", () => {
  it("folds each task's runs into its record, most recently run first", () => {
    const tasks = listTasks(db);
    expect(tasks.map((t) => t.path)).toEqual([
      "live-task-1790000999000-abc123.ts",
      "tasks/api/sync.ts",
      "tasks/report.ts",
    ]);
    expect(tasks[1]).toMatchObject({
      version: 2,
      version_count: 2,
      run_count: 4,
      success_count: 2,
      failure_count: 1,
      skipped_count: 1,
      last_status: "skipped",
      max_ms: 300,
    });
    expect(tasks[2]).toMatchObject({ run_count: 0, last_run_id: null, last_outcome: null });
  });

  it("judges health by the latest run that reached a verdict, not by a skip", () => {
    expect(getTask(db, 1)?.last_outcome).toBe("success");
  });

  it("gives every version its own record", () => {
    expect(listVersions(db, 1).map((v) => [v.version, v.run_count, v.failure_count])).toEqual([
      [2, 2, 0],
      [1, 2, 1],
    ]);
  });

  it("lists stored keys", () => {
    expect(listKeys(db, 1).map((k) => k.key)).toEqual(["count", "cursor"]);
  });
});

describe("runs", () => {
  it("reads what a run returned, and nothing from a file without the column", () => {
    const writer = new Database(path);
    writer.prepare("UPDATE task_runs SET result = ? WHERE id = 1").run('{"n":2}');
    writer.close();
    expect(getRunResult(db, 1)).toBe('{"n":2}');
    expect(getRunResult(db, 2)).toBeNull();

    // A file the scheduler has not migrated since the column was added.
    const legacy = new Database(":memory:");
    legacy.exec("CREATE TABLE task_runs (id INTEGER PRIMARY KEY)");
    legacy.exec("INSERT INTO task_runs (id) VALUES (1)");
    expect(getRunResult(legacy, 1)).toBeNull();
    legacy.close();
  });

  it("returns runs newest first with their counts", () => {
    const runs = listRuns(db, { taskId: 1 });
    expect(runs.map((r) => r.status)).toEqual(["skipped", "success", "failure", "success"]);
    expect(runs[2]).toMatchObject({
      version: 1,
      duration_ms: 300,
      // "Task started" and "Task failed" are ngn's lines, not the task's.
      log_count: 2,
      error_count: 1,
      warn_count: 1,
      timing_count: 1,
    });
    // A skip never started: it is placed at the moment it was queued.
    expect(runs[0]).toMatchObject({ started_at: null, duration_ms: null, at: T0 + 7000 });
  });

  it("filters by status, path and origin", () => {
    expect(listRuns(db, { status: "failure" }).map((r) => r.id)).toEqual([2]);
    expect(listRuns(db, { q: "api/" })).toHaveLength(4);
    const scheduled = listRuns(db, { origin: "scheduled" });
    expect(scheduled).toHaveLength(4);
    expect(scheduled.some((r) => r.path.startsWith("live-task-"))).toBe(false);
    expect(listRuns(db, { origin: "editor" }).map((r) => r.id)).toEqual([5]);
  });

  it("walks a task's runs in order", () => {
    expect(runNeighbours(db, 1, 2)).toEqual({ prev: 1, next: 3 });
    expect(runNeighbours(db, 1, 1)).toEqual({ prev: null, next: 2 });
  });

  it("finds the run the live editor just made", () => {
    expect(latestLiveRun(db, T0 + 9000)).toBe(5);
    expect(latestLiveRun(db, T0 + 60_000)).toBeNull();
  });
});

describe("stalled runs", () => {
  /**
   * sync.ts ticks every 3 s. A run starts and never ends; two ticks behind it
   * are skipped as still running; a later run starts and is still in its window.
   */
  function seedStall() {
    const w = new Database(path);
    const run = w.prepare(
      `INSERT INTO task_runs (file_task_id, file_task_version_id, status, created_at, started_at, ended_at, skip_reason)
       VALUES (1, 2, ?, ?, ?, ?, ?)`,
    );
    const stuck = Number(run.run("running", T0 + 30_000, T0 + 30_000, null, null).lastInsertRowid);
    const skip = run.run(
      "skipped",
      T0 + 33_000,
      null,
      T0 + 33_000,
      "previous run still in progress",
    );
    run.run("skipped", T0 + 36_000, null, T0 + 36_000, "previous run still in progress");
    w.close();
    return { stuck, skipped: Number(skip.lastInsertRowid) };
  }

  it("calls a run Stalled once it is twice past its task's window", () => {
    const { stuck } = seedStall();
    // The window is the 3 s schedule: 5 s in it is still running, 7 s in it is not.
    expect(stalledRuns(db, T0 + 35_000).size).toBe(0);
    const stalled = stalledRuns(db, T0 + 37_000);
    expect(stalled.get(stuck)).toMatchObject({
      task_id: 1,
      window_ms: 3000,
      lease_expired: false,
      skipped_since: 2,
    });
    expect(getRun(db, stuck, T0 + 37_000)?.stalled).toBe(true);
    expect(getRun(db, stuck, T0 + 35_000)?.stalled).toBe(false);
    expect(getRun(db, 1, T0 + 37_000)?.stalled).toBe(false);
  });

  it("calls a run Stalled at once when its lock's lease ran out", () => {
    const { stuck } = seedStall();
    const w = new Database(path);
    w.prepare(
      "INSERT INTO locks (name, holder, task_run_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run("browser", "1:x", stuck, T0 + 30_000, T0 + 31_000);
    w.close();
    expect(stalledRuns(db, T0 + 32_000).get(stuck)).toMatchObject({ lease_expired: true });
  });

  it("filters Stalled runs apart from the ones still running", () => {
    const { stuck } = seedStall();
    const ids = (status: "open" | "stalled", now: number) =>
      listRuns(db, { status }, now).map((r) => r.id);
    expect(ids("open", T0 + 35_000)).toEqual([stuck]);
    expect(ids("stalled", T0 + 35_000)).toEqual([]);
    expect(ids("open", T0 + 37_000)).toEqual([]);
    expect(ids("stalled", T0 + 37_000)).toEqual([stuck]);
  });

  it("filters by the shared filter language and counts each facet's values", () => {
    const { stuck } = seedStall();
    const now = T0 + 37_000;
    const tokens = (q: string) => parseRunQuery(q, now).tokens;
    const ids = (q: string) => listRuns(db, { tokens: tokens(q) }, now).map((r) => r.id);
    expect(ids("status:stalled")).toEqual([stuck]);
    expect(ids("task:sync -status:skipped status:stalled")).toEqual([stuck]);
    expect(ids("origin:editor")).toEqual([5]);
    // Each facet ignores its own filter, so its counts say what picking a value would show.
    const facets = facetCounts(db, tokens("task:sync status:stalled"), now);
    expect(facets.status).toMatchObject({ stalled: 1, skipped: 3, succeeded: 2, failed: 1 });
    expect(facets.origin).toEqual({ scheduled: 1, editor: 0 });
  });

  it("buckets runs over time under every filter but the time ones", () => {
    seedStall();
    const now = T0 + 37_000;
    const scrub = runActivity(db, parseRunQuery("task:sync since:1m", now).tokens, now);
    // Under a minute of history: one-minute buckets, every sync.ts run counted.
    expect(scrub.bucketMs).toBe(60_000);
    const totals = scrub.buckets.reduce(
      (sum, b) => ({
        ok: sum.ok + b.success,
        bad: sum.bad + b.failure,
        skip: sum.skip + b.skipped,
        other: sum.other + b.other,
      }),
      { ok: 0, bad: 0, skip: 0, other: 0 },
    );
    expect(totals).toEqual({ ok: 2, bad: 1, skip: 3, other: 1 });
    expect(
      runActivity(db, parseRunQuery("task:nothing-like-this", now).tokens, now).buckets,
    ).toEqual([]);
  });

  it("links a still-running skip to the run it waited on", () => {
    const { stuck, skipped } = seedStall();
    const byId = new Map(listRuns(db, { taskId: 1 }).map((r) => [r.id, r]));
    expect(byId.get(skipped)?.blocked_by).toBe(stuck);
    expect(byId.get(1)?.blocked_by).toBeNull();
  });
});

describe("retries, skips and locks", () => {
  /** A tick of three tries — two failures, then a success — and two kinds of skip. */
  function seedRetries() {
    const w = new Database(path);
    const run = w.prepare(
      `INSERT INTO task_runs (file_task_id, file_task_version_id, status, created_at, started_at, ended_at, retry_of, skip_reason)
       VALUES (1, 2, ?, ?, ?, ?, ?, ?)`,
    );
    const first = Number(
      run.run("failure", T0 + 20_000, T0 + 20_000, T0 + 20_100, null, null).lastInsertRowid,
    );
    const second = Number(
      run.run("failure", T0 + 21_000, T0 + 21_000, T0 + 21_100, first, null).lastInsertRowid,
    );
    const third = Number(
      run.run("success", T0 + 22_000, T0 + 22_000, T0 + 22_050, first, null).lastInsertRowid,
    );
    run.run("skipped", T0 + 23_000, null, T0 + 23_000, null, 'lock "browser" is held');
    const breaker = Number(
      run.run(
        "skipped",
        T0 + 24_000,
        null,
        T0 + 24_000,
        null,
        "circuit open after repeated failures",
      ).lastInsertRowid,
    );
    w.prepare(
      "INSERT INTO locks (name, holder, task_run_id, acquired_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run("browser", "123:abc", third, T0 + 22_000, T0 + 82_000);
    w.close();
    return { first, second, third, breaker };
  }

  it("numbers each try of a tick", () => {
    const { first, second, third } = seedRetries();
    const byId = new Map(listRuns(db, { taskId: 1 }).map((r) => [r.id, r]));
    expect(byId.get(first)).toMatchObject({ attempt: 1, attempts: 3, retry_of: null });
    expect(byId.get(second)).toMatchObject({ attempt: 2, attempts: 3, retry_of: first });
    expect(byId.get(third)).toMatchObject({ attempt: 3, attempts: 3 });
    // A run that was never retried is its tick's only try.
    expect(byId.get(1)).toMatchObject({ attempt: 1, attempts: 1 });
    // The same, read alone.
    expect(getRun(db, second)).toMatchObject({ attempt: 2, attempts: 3 });
    expect(tickAttempts(db, { id: second, retry_of: first }).map((a) => a.id)).toEqual([
      first,
      second,
      third,
    ]);
  });

  it("counts retries and says why runs were skipped", () => {
    const { breaker } = seedRetries();
    expect(getTask(db, 1)).toMatchObject({
      retry_count: 2,
      last_run_id: breaker,
      last_skip_reason: "circuit open after repeated failures",
    });
    expect(skipReasons(db, 1)).toEqual([
      // The seed's own skip predates skip_reason: shouldSkip's.
      { reason: null, count: 1 },
      { reason: "circuit open after repeated failures", count: 1 },
      { reason: 'lock "browser" is held', count: 1 },
    ]);
  });

  it("lists locks with the run and task that hold them", () => {
    const { third } = seedRetries();
    expect(listLocks(db)).toEqual([
      {
        name: "browser",
        holder: "123:abc",
        run_id: third,
        task_id: 1,
        path: "tasks/api/sync.ts",
        acquired_at: T0 + 22_000,
        expires_at: T0 + 82_000,
      },
    ]);
  });

  it("reads a file from before retries, skip reasons and locks", () => {
    const legacy = new Database(":memory:");
    legacy.exec(`
      CREATE TABLE file_tasks (id INTEGER PRIMARY KEY, path TEXT, parent_path TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE file_task_versions (id INTEGER PRIMARY KEY, file_task_id INTEGER, version INTEGER);
      CREATE TABLE task_runs (id INTEGER PRIMARY KEY, file_task_id INTEGER, file_task_version_id INTEGER, status TEXT, created_at INTEGER, started_at INTEGER, ended_at INTEGER);
      CREATE TABLE logs (id INTEGER PRIMARY KEY, task_run_id INTEGER, file_task_id INTEGER, status TEXT, value TEXT, created_at INTEGER);
      CREATE TABLE timings (id INTEGER PRIMARY KEY, task_run_id INTEGER);
      INSERT INTO file_tasks VALUES (1, 'a.ts', '.', 'active', 0, 0);
      INSERT INTO task_runs VALUES (1, 1, 1, 'skipped', 0, NULL, 0);
    `);
    expect(listRuns(legacy)).toMatchObject([
      { id: 1, retry_of: null, skip_reason: null, attempt: 1, attempts: 1 },
    ]);
    expect(listTasks(legacy)[0]).toMatchObject({ retry_count: 0, last_skip_reason: null });
    expect(skipReasons(legacy, 1)).toEqual([{ reason: null, count: 1 }]);
    expect(tickAttempts(legacy, { id: 1, retry_of: null })).toHaveLength(1);
    expect(listLocks(legacy)).toEqual([]);
    legacy.close();
  });
});

describe("logs", () => {
  it("hides lifecycle lines unless asked", () => {
    expect(listLogs(db, { taskId: 1 }).map((l) => l.value)).toEqual([
      "sync failed: upstream returned 503",
      "rate limit close",
      "synced 3 users",
    ]);
    expect(listLogs(db, { runId: 2, lifecycle: true }).map((l) => l.value)[0]).toBe("Task started");
  });

  it("counts the lines a task wrote itself, across its runs", () => {
    expect(countTaskLines(db, 1)).toBe(3);
  });

  it("names a failed run by the last error the task logged", () => {
    const logs = listLogs(db, { runId: 2, lifecycle: true });
    expect(failureMessage(logs)).toBe("sync failed: upstream returned 503");
    expect(failureMessage(logs.filter((l) => !l.value.startsWith("sync")))).toBeNull();
  });
});

describe("timings", () => {
  it("summarises each label over its spans, latest first in the record", () => {
    const stats = timingStats(db, 1);
    expect(stats.find((s) => s.label === "fetch")).toMatchObject({
      count: 3,
      max: 200,
      p50: 40,
      last: 30,
      last_run_id: 3,
      recent: [40, 200, 30],
    });
  });
});

describe("overview", () => {
  it("strips a task's latest runs, oldest first", () => {
    expect(recentOutcomes(db, 1, 3).map((r) => r.status)).toEqual([
      "failure",
      "success",
      "skipped",
    ]);
    expect(recentOutcomes(db, 2, 24)).toEqual([]);
  });

  it("measures how long a task has been failing since its latest success", () => {
    // sync.ts: success, failure, success, skipped — healthy now.
    expect(failingSpell(db, 1)).toBeNull();
    const w = new Database(path);
    const run = w.prepare(
      "INSERT INTO task_runs (file_task_id, file_task_version_id, status, created_at) VALUES (1, 2, 'failure', ?)",
    );
    run.run(T0 + 30_000);
    const last = Number(run.run(T0 + 31_000).lastInsertRowid);
    w.close();
    expect(failingSpell(db, 1)).toEqual({ last_run_id: last, since: T0 + 30_000, failures: 2 });
  });
});

describe("activity", () => {
  it("buckets runs by hour, every hour present", () => {
    const buckets = activity(db, T0 + 10_000, 24);
    expect(buckets).toHaveLength(24);
    const last = buckets[buckets.length - 1]!;
    expect(last).toMatchObject({ success: 3, failure: 1, skipped: 1 });
  });
});

describe("schedules", () => {
  /** The sync task's schedule, as `ngn run` writes it: a decision after run 3, then a pause. */
  function seedSchedule() {
    const w = new Database(path);
    const [sync] = w
      .prepare("SELECT id FROM file_tasks WHERE path = 'tasks/api/sync.ts'")
      .all() as {
      id: number;
    }[];
    const event = w.prepare(
      `INSERT INTO schedule_events (file_task_id, at, event, from_state, to_state, next_at, reason,
         source, holder, anchor, request, origin, first_run_id, run_id, previous_next_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, NULL)`,
    );
    event.run(sync!.id, T0, "scheduled", null, "waiting", T0, "first run", "policy", null, null);
    event.run(
      sync!.id,
      T0 + 6050,
      "decided",
      "running",
      "waiting",
      T0 + 9000,
      "312 jobs left",
      "hook",
      3,
      3,
    );
    event.run(
      sync!.id,
      T0 + 7000,
      "paused",
      "waiting",
      "paused",
      T0 + 9000,
      "312 jobs left",
      "hook",
      null,
      null,
    );
    w.prepare(
      `INSERT INTO schedules (file_task_id, state, next_at, reason, source, holder, anchor, request, updated_at)
       VALUES (?, 'paused', ?, '312 jobs left', 'hook', NULL, NULL, NULL, ?)`,
    ).run(sync!.id, T0 + 9000, T0 + 7000);
    w.close();
    return sync!.id;
  }

  it("reads each task's schedule, its log newest first, and the decision after a run", () => {
    const sync = seedSchedule();
    expect(listSchedules(db).get(sync)).toMatchObject({
      state: "paused",
      next_at: T0 + 9000,
      source: "hook",
      blocked_by: null,
    });
    expect(scheduleEvents(db, sync).map((e) => e.event)).toEqual([
      "paused",
      "decided",
      "scheduled",
    ]);
    expect(runDecision(db, 3)).toEqual({
      next_at: T0 + 9000,
      reason: "312 jobs left",
      source: "hook",
    });
    expect(runDecision(db, 1)).toBeNull();
  });
});
