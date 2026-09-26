import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDbFileIfNotExists } from "@apisurf/ngn-persistence";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/server/db";
import { schemaState } from "../src/server/db";
import {
  activity,
  failureMessage,
  getTask,
  latestLiveRun,
  listKeys,
  listLogs,
  listRelations,
  listRuns,
  listTasks,
  listVersions,
  runNeighbours,
  runQuery,
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
  it("returns runs newest first with their counts", () => {
    const runs = listRuns(db, { taskId: 1 });
    expect(runs.map((r) => r.status)).toEqual(["skipped", "success", "failure", "success"]);
    expect(runs[2]).toMatchObject({
      version: 1,
      duration_ms: 300,
      log_count: 4,
      // "Task failed" is ngn's line, not the task's.
      error_count: 1,
      warn_count: 1,
      timing_count: 1,
    });
    // A skip never started: it is placed at the moment it was queued.
    expect(runs[0]).toMatchObject({ started_at: null, duration_ms: null, at: T0 + 7000 });
  });

  it("filters by status, path and the live editor", () => {
    expect(listRuns(db, { status: "failure" }).map((r) => r.id)).toEqual([2]);
    expect(listRuns(db, { q: "api/" })).toHaveLength(4);
    expect(listRuns(db, { hideLive: true }).some((r) => r.path.startsWith("live-task-"))).toBe(
      false,
    );
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

describe("logs", () => {
  it("hides lifecycle lines unless asked, and filters by level", () => {
    expect(listLogs(db, { taskId: 1 }).map((l) => l.value)).toEqual([
      "sync failed: upstream returned 503",
      "rate limit close",
      "synced 3 users",
    ]);
    expect(listLogs(db, { level: "warn" }).map((l) => l.status)).toEqual(["error", "warning"]);
    expect(listLogs(db, { runId: 2, lifecycle: true }).map((l) => l.value)[0]).toBe("Task started");
  });

  it("names a failed run by the last error the task logged", () => {
    const logs = listLogs(db, { runId: 2, lifecycle: true });
    expect(failureMessage(logs)).toBe("sync failed: upstream returned 503");
    expect(failureMessage(logs.filter((l) => !l.value.startsWith("sync")))).toBeNull();
  });

  it("searches messages and task paths", () => {
    expect(listLogs(db, { q: "503" })).toHaveLength(1);
    expect(listLogs(db, { q: "live-task" }).map((l) => l.value)).toEqual(['{"rows":2}']);
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

describe("activity", () => {
  it("buckets runs by hour, every hour present", () => {
    const buckets = activity(db, T0 + 10_000, 24);
    expect(buckets).toHaveLength(24);
    const last = buckets[buckets.length - 1]!;
    expect(last).toMatchObject({ success: 3, failure: 1, skipped: 1 });
  });
});

describe("SQL console", () => {
  it("describes the tables", () => {
    const runs = listRelations(db).find((r) => r.name === "task_runs");
    expect(runs?.description).toMatch(/scheduled execution/);
    expect(runs?.columns.find((c) => c.name === "id")).toMatchObject({ pk: true });
  });

  it("returns columns and rows", () => {
    expect(runQuery(db, "SELECT id, status FROM task_runs ORDER BY id LIMIT 2")).toMatchObject({
      ok: true,
      columns: ["id", "status"],
      rows: [
        [1, "success"],
        [2, "failure"],
      ],
    });
  });

  it("refuses statements that return nothing, and writes that do", () => {
    expect(runQuery(db, "DELETE FROM task_runs")).toMatchObject({ ok: false });
    expect(runQuery(db, "DELETE FROM task_runs RETURNING id")).toMatchObject({ ok: false });
    expect(runQuery(db, "SELECT COUNT(*) FROM task_runs")).toMatchObject({ rows: [[5]] });
  });

  it("caps the rows it returns and says so", () => {
    const result = runQuery(
      db,
      "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n LIMIT 5000) SELECT i FROM n",
    );
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(result.ok && result.rows.length).toBe(1000);
  });
});
