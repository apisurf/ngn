// Every read the UI makes.
//
// ngn writes six tables and no views, and its own services read them one row
// at a time; the questions a browsing UI asks — a task folded into its record,
// a run with its logs and timings on one clock, failures across every task —
// are asked here, in SQL, against the tables `ngn sql --help` documents.
//
// Times are unix milliseconds throughout, as ngn writes them.

import { isLifecycle, LIFECYCLE_MESSAGES, LIFECYCLE_PREFIX, percentile } from "../lib/ngn";
import type { Db } from "./db";

/**
 * The lifecycle messages as an SQL list. They are constants of this module, so
 * inlining them is safe, and it lets a column expression use them without
 * threading parameters through every query that selects it.
 */
const LIFECYCLE_IN = `(${LIFECYCLE_MESSAGES.map((m) => `'${m.replace(/'/g, "''")}'`).join(", ")})`;

/** SQL that is true for a task's own line in `column`, and false for one of ngn's. */
const taskLine = (column: string) =>
  `(${column} NOT IN ${LIFECYCLE_IN} AND ${column} NOT LIKE '${LIFECYCLE_PREFIX}%')`;

/**
 * The `task_runs` columns later migrations added, as SQL to select them by.
 *
 * The UI never migrates, so a file the scheduler has not opened since an
 * upgrade lacks them. Each one missing reads as NULL — which is what a run
 * from before it existed would have held anyway. Asked on every query rather
 * than cached: `ngn run` can migrate the file while the UI has it open.
 */
function runColumns(db: Db): { result: string; retryOf: string; skipReason: string } {
  const present = new Set(
    (db.prepare("SELECT name FROM pragma_table_info('task_runs')").all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );
  const column = (name: string) => (present.has(name) ? name : "NULL");
  return {
    result: column("result"),
    retryOf: column("retry_of"),
    skipReason: column("skip_reason"),
  };
}

function hasTable(db: Db, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

// -----------------------------------------------------------------------------
// Workspace
// -----------------------------------------------------------------------------

export interface WorkspaceCounts {
  tasks: number;
  runs: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Running or pending: started and not ended, as far as the file knows. */
  open: number;
  /** Lines tasks wrote; ngn's own lifecycle lines are not counted. */
  logs: number;
  errorLogs: number;
  warnLogs: number;
  timings: number;
  keys: number;
  versions: number;
}

export function workspaceCounts(db: Db): WorkspaceCounts {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM file_tasks)                                  AS tasks,
         (SELECT COUNT(*) FROM task_runs)                                   AS runs,
         (SELECT COUNT(*) FROM task_runs WHERE status = 'success')          AS succeeded,
         (SELECT COUNT(*) FROM task_runs WHERE status = 'failure')          AS failed,
         (SELECT COUNT(*) FROM task_runs WHERE status = 'skipped')          AS skipped,
         (SELECT COUNT(*) FROM task_runs
            WHERE status IN ('running', 'pending'))                         AS open,
         (SELECT COUNT(*) FROM logs WHERE ${taskLine("value")})          AS logs,
         (SELECT COUNT(*) FROM logs
            WHERE status = 'error' AND ${taskLine("value")})             AS errorLogs,
         (SELECT COUNT(*) FROM logs WHERE status IN ('warn', 'warning'))    AS warnLogs,
         (SELECT COUNT(*) FROM timings)                                     AS timings,
         (SELECT COUNT(*) FROM kvs)                                         AS keys,
         (SELECT COUNT(*) FROM file_task_versions)                          AS versions`,
    )
    .get() as WorkspaceCounts;
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

export interface TaskRow {
  id: number;
  path: string;
  parent_path: string;
  /** `active` while a scheduler has it; ngn also writes `removed`. */
  status: string;
  created_at: number;
  updated_at: number;
  /** Newest version number; 0 before the first is registered. */
  version: number;
  version_count: number;
  run_count: number;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  /** Runs that were a retry of an earlier attempt in the same tick. */
  retry_count: number;
  last_run_id: number | null;
  last_status: string | null;
  last_run_at: number | null;
  /** Why the latest run was skipped, when it was and ngn recorded why. */
  last_skip_reason: string | null;
  /**
   * The status of the latest run that got as far as a verdict. A skip says
   * nothing about health, so a failing task that is now being skipped is still
   * failing.
   */
  last_outcome: "success" | "failure" | null;
  /** Mean duration of finished runs. */
  avg_ms: number | null;
  max_ms: number | null;
}

/** Every task, most recently run first; tasks that never ran last. */
export function listTasks(db: Db, taskId?: number): TaskRow[] {
  const col = runColumns(db);
  return db
    .prepare(
      `WITH v AS (
         SELECT file_task_id, MAX(version) AS version, COUNT(*) AS version_count
         FROM file_task_versions GROUP BY file_task_id
       ),
       r AS (
         SELECT file_task_id,
                COUNT(*)                  AS run_count,
                SUM(status = 'success')   AS success_count,
                SUM(status = 'failure')   AS failure_count,
                SUM(status = 'skipped')   AS skipped_count,
                SUM(${col.retryOf} IS NOT NULL) AS retry_count,
                MAX(id)                   AS last_run_id,
                MAX(CASE WHEN status IN ('success', 'failure') THEN id END) AS last_outcome_id,
                AVG(ended_at - started_at) AS avg_ms,
                MAX(ended_at - started_at) AS max_ms
         FROM task_runs GROUP BY file_task_id
       )
       SELECT t.id, t.path, t.parent_path, t.status, t.created_at, t.updated_at,
              COALESCE(v.version, 0)        AS version,
              COALESCE(v.version_count, 0)  AS version_count,
              COALESCE(r.run_count, 0)      AS run_count,
              COALESCE(r.success_count, 0)  AS success_count,
              COALESCE(r.failure_count, 0)  AS failure_count,
              COALESCE(r.skipped_count, 0)  AS skipped_count,
              COALESCE(r.retry_count, 0)    AS retry_count,
              r.last_run_id,
              lr.status                                AS last_status,
              COALESCE(lr.started_at, lr.created_at)   AS last_run_at,
              ${col.skipReason === "NULL" ? "NULL" : "lr.skip_reason"} AS last_skip_reason,
              lo.status                                AS last_outcome,
              r.avg_ms, r.max_ms
       FROM file_tasks t
       LEFT JOIN v  ON v.file_task_id = t.id
       LEFT JOIN r  ON r.file_task_id = t.id
       LEFT JOIN task_runs lr ON lr.id = r.last_run_id
       LEFT JOIN task_runs lo ON lo.id = r.last_outcome_id
       ${taskId === undefined ? "" : "WHERE t.id = ?"}
       ORDER BY last_run_at DESC NULLS LAST, t.path`,
    )
    .all(...(taskId === undefined ? [] : [taskId])) as TaskRow[];
}

export function getTask(db: Db, taskId: number): TaskRow | null {
  return listTasks(db, taskId)[0] ?? null;
}

// -----------------------------------------------------------------------------
// Runs
// -----------------------------------------------------------------------------

export interface RunRow {
  id: number;
  task_id: number;
  path: string;
  version_id: number;
  /** The task version this run executed. */
  version: number | null;
  status: string;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  /** When it happened: the start, or for a skip (never started) when it was queued. */
  at: number;
  duration_ms: number | null;
  /** The first run of the tick this one retries; null for a first attempt. */
  retry_of: number | null;
  /** Why ngn skipped it; null when it was not skipped, or the task's `shouldSkip` did. */
  skip_reason: string | null;
  /** Which try of its tick this was, from 1. */
  attempt: number;
  /** How many tries its tick took, as far as the file knows yet. */
  attempts: number;
  /** Lines the task wrote — ngn's own lifecycle lines are not counted. */
  log_count: number;
  /** Errors the task itself logged — ngn's own "Task failed" line is not counted. */
  error_count: number;
  warn_count: number;
  timing_count: number;
}

export interface RunFilter {
  /** Substring of the task path. */
  q?: string;
  taskId?: number;
  status?: "failure" | "success" | "skipped" | "open";
  /** Leave out code sent from the live editor. */
  hideLive?: boolean;
  limit?: number;
}

/** A run row as the database has it, before its place in its tick is worked out. */
type StoredRun = Omit<RunRow, "attempt" | "attempts">;

const runSelect = (col: ReturnType<typeof runColumns>) => `
  r.id, r.file_task_id AS task_id, t.path, r.file_task_version_id AS version_id, v.version,
  r.status, r.created_at, r.started_at, r.ended_at,
  COALESCE(r.started_at, r.created_at)                        AS at,
  CASE WHEN r.ended_at IS NOT NULL AND r.started_at IS NOT NULL
       THEN r.ended_at - r.started_at END                     AS duration_ms,
  ${col.retryOf === "NULL" ? "NULL" : "r.retry_of"}           AS retry_of,
  ${col.skipReason === "NULL" ? "NULL" : "r.skip_reason"}     AS skip_reason,
  (SELECT COUNT(*) FROM logs l
     WHERE l.task_run_id = r.id AND ${taskLine("l.value")}) AS log_count,
  (SELECT COUNT(*) FROM logs l
     WHERE l.task_run_id = r.id AND l.status = 'error'
       AND ${taskLine("l.value")})                         AS error_count,
  (SELECT COUNT(*) FROM logs l
     WHERE l.task_run_id = r.id AND l.status IN ('warn', 'warning')) AS warn_count,
  (SELECT COUNT(*) FROM timings m WHERE m.task_run_id = r.id) AS timing_count`;

const RUN_FROM = `
  FROM task_runs r
  JOIN file_tasks t ON t.id = r.file_task_id
  LEFT JOIN file_task_versions v ON v.id = r.file_task_version_id`;

/** Runs newest first. `id` order is creation order, which is what a history reads in. */
export function listRuns(db: Db, filter: RunFilter = {}): RunRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = filter.q?.trim();
  if (q) {
    where.push("t.path LIKE ?");
    params.push(`%${q}%`);
  }
  if (filter.taskId !== undefined) {
    where.push("r.file_task_id = ?");
    params.push(filter.taskId);
  }
  if (filter.status === "open") where.push("r.status IN ('running', 'pending')");
  else if (filter.status) {
    where.push("r.status = ?");
    params.push(filter.status);
  }
  // The live editor's throwaway files sit at the root and follow one pattern.
  if (filter.hideLive) where.push("NOT (t.parent_path = '.' AND t.path GLOB 'live-task-*')");
  const limit = Math.min(Math.max(filter.limit ?? 300, 1), 5000);
  const col = runColumns(db);

  const rows = db
    .prepare(
      `SELECT ${runSelect(col)} ${RUN_FROM}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.id DESC LIMIT ${limit}`,
    )
    .all(...params) as StoredRun[];
  return withAttempts(db, col, rows);
}

export function getRun(db: Db, runId: number): RunRow | null {
  const col = runColumns(db);
  const row = db.prepare(`SELECT ${runSelect(col)} ${RUN_FROM} WHERE r.id = ?`).get(runId) as
    | StoredRun
    | undefined;
  return row ? withAttempts(db, col, [row])[0]! : null;
}

/**
 * Each run's place in its tick: attempt `n` of `m`.
 *
 * A retry names the tick's first run in `retry_of`, which has no index, so the
 * attempts are read in one pass for the whole list rather than a lookup per
 * row. Every retry comes after the run it retries, so the pass starts at the
 * oldest first run in play and walks the primary key from there.
 */
function withAttempts(db: Db, col: ReturnType<typeof runColumns>, rows: StoredRun[]): RunRow[] {
  const firsts = [...new Set(rows.map((row) => row.retry_of ?? row.id))];
  const retries = new Map<number, number[]>();
  if (col.retryOf !== "NULL" && firsts.length) {
    const found = db
      .prepare(
        `SELECT id, retry_of FROM task_runs
         WHERE id > ? AND retry_of IN (SELECT value FROM json_each(?))`,
      )
      .all(Math.min(...firsts), JSON.stringify(firsts)) as { id: number; retry_of: number }[];
    for (const { id, retry_of } of found) {
      retries.set(retry_of, [...(retries.get(retry_of) ?? []), id]);
    }
  }
  return rows.map((row) => {
    const ids = retries.get(row.retry_of ?? row.id) ?? [];
    return {
      ...row,
      attempt: row.retry_of == null ? 1 : ids.filter((id) => id <= row.id).length + 1,
      attempts: ids.length + 1,
    };
  });
}

export interface Attempt {
  id: number;
  status: string;
  duration_ms: number | null;
}

/** Every try of the tick `run` belongs to, first first. One entry for a tick that was not retried. */
export function tickAttempts(db: Db, run: Pick<RunRow, "id" | "retry_of">): Attempt[] {
  const first = run.retry_of ?? run.id;
  const retried = runColumns(db).retryOf !== "NULL";
  return db
    .prepare(
      `SELECT id, status,
              CASE WHEN ended_at IS NOT NULL AND started_at IS NOT NULL
                   THEN ended_at - started_at END AS duration_ms
       FROM task_runs
       WHERE id = @first ${retried ? "OR (id > @first AND retry_of = @first)" : ""}
       ORDER BY id`,
    )
    .all({ first }) as Attempt[];
}

/**
 * What the run's task returned, as stored JSON.
 *
 * Asked for apart from the row because the column came with a later migration
 * and the UI never migrates: a file the scheduler has not opened since then
 * has no `result` column, which is the same as a run that returned nothing.
 */
export function getRunResult(db: Db, runId: number): string | null {
  if (runColumns(db).result === "NULL") return null;
  const row = db.prepare("SELECT result FROM task_runs WHERE id = ?").get(runId) as
    | { result: string | null }
    | undefined;
  return row?.result ?? null;
}

export interface Neighbours {
  prev: number | null;
  next: number | null;
}

/** Older and newer runs of the same task. */
export function runNeighbours(db: Db, taskId: number, runId: number): Neighbours {
  return db
    .prepare(
      `SELECT
         (SELECT id FROM task_runs WHERE file_task_id = @task AND id < @id
            ORDER BY id DESC LIMIT 1) AS prev,
         (SELECT id FROM task_runs WHERE file_task_id = @task AND id > @id
            ORDER BY id ASC LIMIT 1) AS next`,
    )
    .get({ task: taskId, id: runId }) as Neighbours;
}

export interface SkipCount {
  /** As ngn wrote it; null for the task's own `shouldSkip`. */
  reason: string | null;
  count: number;
}

/** Why a task's runs were skipped, most common first. */
export function skipReasons(db: Db, taskId: number): SkipCount[] {
  const { skipReason } = runColumns(db);
  return db
    .prepare(
      `SELECT ${skipReason} AS reason, COUNT(*) AS count FROM task_runs
       WHERE file_task_id = ? AND status = 'skipped'
       GROUP BY 1 ORDER BY count DESC, reason`,
    )
    .all(taskId) as SkipCount[];
}

// -----------------------------------------------------------------------------
// Locks
// -----------------------------------------------------------------------------

export interface LockRow {
  name: string;
  /** `<pid>:<uuid>` — one token per acquisition. */
  holder: string;
  run_id: number | null;
  /** The task whose run holds it, when the run is still in the file. */
  task_id: number | null;
  path: string | null;
  acquired_at: number;
  /** The lease is renewed while held; past this, anyone may take it. */
  expires_at: number;
}

/**
 * The named locks as the file has them. A row is only deleted on release, so
 * one whose lease has run out is a lock its holder never let go of — most
 * likely a process that stopped — and is free for the next taker.
 */
export function listLocks(db: Db): LockRow[] {
  if (!hasTable(db, "locks")) return [];
  return db
    .prepare(
      `SELECT k.name, k.holder, k.task_run_id AS run_id, r.file_task_id AS task_id, t.path,
              k.acquired_at, k.expires_at
       FROM locks k
       LEFT JOIN task_runs r ON r.id = k.task_run_id
       LEFT JOIN file_tasks t ON t.id = r.file_task_id
       ORDER BY k.name`,
    )
    .all() as LockRow[];
}

// -----------------------------------------------------------------------------
// Logs
// -----------------------------------------------------------------------------

export interface LogRow {
  id: number;
  run_id: number;
  task_id: number;
  /** As written: `info`, `warning` (or `warn`), `error`. */
  status: string;
  value: string;
  created_at: number;
  path: string;
}

export interface LogFilter {
  taskId?: number;
  runId?: number;
  /** Include the lines ngn writes around every run. */
  lifecycle?: boolean;
  limit?: number;
}

/** Log lines newest first — or, for one run, in the order they were written. */
export function listLogs(db: Db, filter: LogFilter = {}): LogRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.taskId !== undefined) {
    where.push("l.file_task_id = ?");
    params.push(filter.taskId);
  }
  if (filter.runId !== undefined) {
    where.push("l.task_run_id = ?");
    params.push(filter.runId);
  }
  if (!filter.lifecycle) where.push(taskLine("l.value"));
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
  const order = filter.runId === undefined ? "DESC" : "ASC";

  return db
    .prepare(
      `SELECT l.id, l.task_run_id AS run_id, l.file_task_id AS task_id, l.status, l.value,
              l.created_at, t.path
       FROM logs l JOIN file_tasks t ON t.id = l.file_task_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY l.id ${order} LIMIT ${limit}`,
    )
    .all(...params) as LogRow[];
}

/**
 * What a failed run has to say for itself: the last error a task logged, or
 * failing that, nothing — ngn records that a run failed, not what it threw.
 */
export function failureMessage(logs: readonly LogRow[]): string | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i]!;
    if (log.status === "error" && !isLifecycle(log.value)) return log.value;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Timings
// -----------------------------------------------------------------------------

export interface TimingRow {
  id: number;
  run_id: number;
  label: string;
  /** Milliseconds between `timing.start()` and calling what it returned. */
  value: number;
  /** When it was recorded — the end of the span. */
  created_at: number;
}

/** A run's timings in the order their spans started. */
export function listRunTimings(db: Db, runId: number): TimingRow[] {
  return db
    .prepare(
      `SELECT id, task_run_id AS run_id, label, value, created_at
       FROM timings WHERE task_run_id = ?
       ORDER BY created_at - value, id`,
    )
    .all(runId) as TimingRow[];
}

export interface TimingStat {
  label: string;
  count: number;
  avg: number;
  p50: number | null;
  p95: number | null;
  max: number;
  last: number;
  last_run_id: number;
  /** The most recent values, oldest first, for a sparkline. */
  recent: number[];
}

/** How many of a task's most recent timings the stats are drawn from. */
const TIMING_WINDOW = 5000;
const SPARK_POINTS = 40;

/**
 * Each label a task times, summarised over its most recent spans.
 *
 * Percentiles are not something SQLite computes, so the window is read and
 * folded here. It is bounded, so a task that has timed `fetch` every two
 * seconds for a month costs the same as one that ran yesterday.
 */
export function timingStats(db: Db, taskId: number): TimingStat[] {
  const rows = db
    .prepare(
      `SELECT task_run_id AS run_id, label, value
       FROM timings WHERE file_task_id = ?
       ORDER BY id DESC LIMIT ${TIMING_WINDOW}`,
    )
    .all(taskId) as { run_id: number; label: string; value: number }[];

  // Newest first, so the first row seen for a label is its latest.
  const byLabel = new Map<string, { values: number[]; last: number; lastRun: number }>();
  for (const row of rows) {
    const entry = byLabel.get(row.label);
    if (entry) entry.values.push(row.value);
    else byLabel.set(row.label, { values: [row.value], last: row.value, lastRun: row.run_id });
  }

  return [...byLabel.entries()].map(([label, { values, last, lastRun }]) => {
    const sorted = values.toSorted((a, b) => a - b);
    return {
      label,
      count: values.length,
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted[sorted.length - 1] ?? 0,
      last,
      last_run_id: lastRun,
      recent: values.slice(0, SPARK_POINTS).toReversed(),
    };
  });
}

// -----------------------------------------------------------------------------
// Versions and stored keys
// -----------------------------------------------------------------------------

export interface VersionRow {
  id: number;
  version: number;
  md5_hash: string;
  created_at: number;
  run_count: number;
  success_count: number;
  failure_count: number;
  avg_ms: number | null;
}

/** A task's versions, newest first, each with how its runs went. */
export function listVersions(db: Db, taskId: number): VersionRow[] {
  return db
    .prepare(
      `SELECT v.id, v.version, v.md5_hash, v.created_at,
              COUNT(r.id)                       AS run_count,
              COALESCE(SUM(r.status = 'success'), 0) AS success_count,
              COALESCE(SUM(r.status = 'failure'), 0) AS failure_count,
              AVG(r.ended_at - r.started_at)    AS avg_ms
       FROM file_task_versions v
       LEFT JOIN task_runs r ON r.file_task_version_id = v.id
       WHERE v.file_task_id = ?
       GROUP BY v.id
       ORDER BY v.version DESC`,
    )
    .all(taskId) as VersionRow[];
}

export interface VersionCode {
  id: number;
  version: number;
  md5_hash: string;
  created_at: number;
  compiled_code: string;
}

/** One version's code: a specific one when `versionId` is given, else the newest. */
export function getVersionCode(db: Db, taskId: number, versionId?: number): VersionCode | null {
  const row =
    versionId === undefined
      ? db
          .prepare(
            `SELECT id, version, md5_hash, created_at, compiled_code FROM file_task_versions
             WHERE file_task_id = ? ORDER BY version DESC LIMIT 1`,
          )
          .get(taskId)
      : db
          .prepare(
            `SELECT id, version, md5_hash, created_at, compiled_code FROM file_task_versions
             WHERE file_task_id = ? AND id = ?`,
          )
          .get(taskId, versionId);
  return (row as VersionCode | undefined) ?? null;
}

export interface KvRow {
  id: number;
  key: string;
  value: string | null;
  /** When the key was first set — ngn updates a value in place without restamping it. */
  created_at: number;
}

export function listKeys(db: Db, taskId: number): KvRow[] {
  return db
    .prepare(`SELECT id, key, value, created_at FROM kvs WHERE file_task_id = ? ORDER BY key, id`)
    .all(taskId) as KvRow[];
}

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

export interface Outcome {
  id: number;
  status: string;
}

/** A task's latest `limit` runs, oldest first: the strip beside it on the overview. */
export function recentOutcomes(db: Db, taskId: number, limit: number): Outcome[] {
  return (
    db
      .prepare(
        `SELECT id, status FROM task_runs WHERE file_task_id = ?
         ORDER BY id DESC LIMIT ${Math.max(1, Math.floor(limit))}`,
      )
      .all(taskId) as Outcome[]
  ).toReversed();
}

export interface FailingSpell {
  /** The newest failed run, which the overview links to. */
  last_run_id: number;
  /** When the first failure since the latest success was queued. */
  since: number;
  /** Runs that failed since the latest success, retries included. */
  failures: number;
}

/**
 * How long a task has been failing: every failure since its latest success.
 * Null for a task with no failure after its latest success.
 */
export function failingSpell(db: Db, taskId: number): FailingSpell | null {
  const row = db
    .prepare(
      `SELECT MAX(id) AS last_run_id, MIN(created_at) AS since, COUNT(*) AS failures
       FROM task_runs
       WHERE file_task_id = @task AND status = 'failure'
         AND id > COALESCE(
           (SELECT MAX(id) FROM task_runs WHERE file_task_id = @task AND status = 'success'), 0)`,
    )
    .get({ task: taskId }) as FailingSpell | { last_run_id: null };
  return row.last_run_id == null ? null : (row as FailingSpell);
}

export interface ActivityBucket {
  /** Start of the hour, unix ms. */
  from: number;
  success: number;
  failure: number;
  skipped: number;
  other: number;
}

const HOUR = 3_600_000;

/** Runs per hour over the last `hours`, oldest first, every hour present. */
export function activity(db: Db, now: number, hours = 24): ActivityBucket[] {
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const start = end - hours * HOUR;
  const rows = db
    .prepare(
      `SELECT CAST((created_at - @start) / ${HOUR} AS INTEGER) AS bucket, status, COUNT(*) AS n
       FROM task_runs WHERE created_at >= @start AND created_at < @end
       GROUP BY bucket, status`,
    )
    .all({ start, end }) as { bucket: number; status: string; n: number }[];

  const buckets: ActivityBucket[] = Array.from({ length: hours }, (_, i) => ({
    from: start + i * HOUR,
    success: 0,
    failure: 0,
    skipped: 0,
    other: 0,
  }));
  for (const row of rows) {
    const bucket = buckets[row.bucket];
    if (!bucket) continue;
    if (row.status === "success" || row.status === "failure" || row.status === "skipped") {
      bucket[row.status] += row.n;
    } else bucket.other += row.n;
  }
  return buckets;
}

// -----------------------------------------------------------------------------
// The live editor's runs
// -----------------------------------------------------------------------------

/**
 * The run `ngn run` recorded for code the live editor just sent.
 *
 * The endpoint answers with the task's return value only, so the run is found
 * the way it was named: the newest `live-task-*` file registered since the
 * request went out. Same machine, same clock; the margin covers rounding.
 */
export function latestLiveRun(db: Db, since: number): number | null {
  const row = db
    .prepare(
      `SELECT r.id FROM task_runs r JOIN file_tasks t ON t.id = r.file_task_id
       WHERE t.parent_path = '.' AND t.path GLOB 'live-task-*' AND t.created_at >= ?
       ORDER BY r.id DESC LIMIT 1`,
    )
    .get(since - 1000) as { id: number } | undefined;
  return row?.id ?? null;
}
