// Every read the UI makes.
//
// ngn writes six tables and no views, and its own services read them one row
// at a time; the questions a browsing UI asks — a task folded into its record,
// a run with its logs and timings on one clock, failures across every task —
// are asked here, in SQL, against the tables `ngn sql --help` documents.
//
// Times are unix milliseconds throughout, as ngn writes them.

import { isLifecycle, LIFECYCLE_MESSAGES, percentile } from "../lib/ngn";
import type { Db } from "./db";

/**
 * The lifecycle messages as an SQL list. They are constants of this module, so
 * inlining them is safe, and it lets a column expression use them without
 * threading parameters through every query that selects it.
 */
const LIFECYCLE_IN = `(${LIFECYCLE_MESSAGES.map((m) => `'${m.replace(/'/g, "''")}'`).join(", ")})`;

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
         (SELECT COUNT(*) FROM logs WHERE value NOT IN ${LIFECYCLE_IN})     AS logs,
         (SELECT COUNT(*) FROM logs
            WHERE status = 'error' AND value NOT IN ${LIFECYCLE_IN})        AS errorLogs,
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
  last_run_id: number | null;
  last_status: string | null;
  last_run_at: number | null;
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
              r.last_run_id,
              lr.status                                AS last_status,
              COALESCE(lr.started_at, lr.created_at)   AS last_run_at,
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

const RUN_COLUMNS = `
  r.id, r.file_task_id AS task_id, t.path, r.file_task_version_id AS version_id, v.version,
  r.status, r.created_at, r.started_at, r.ended_at,
  COALESCE(r.started_at, r.created_at)                        AS at,
  CASE WHEN r.ended_at IS NOT NULL AND r.started_at IS NOT NULL
       THEN r.ended_at - r.started_at END                     AS duration_ms,
  (SELECT COUNT(*) FROM logs l WHERE l.task_run_id = r.id)    AS log_count,
  (SELECT COUNT(*) FROM logs l
     WHERE l.task_run_id = r.id AND l.status = 'error'
       AND l.value NOT IN ${LIFECYCLE_IN})                    AS error_count,
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

  return db
    .prepare(
      `SELECT ${RUN_COLUMNS} ${RUN_FROM}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY r.id DESC LIMIT ${limit}`,
    )
    .all(...params) as RunRow[];
}

export function getRun(db: Db, runId: number): RunRow | null {
  return (
    (db.prepare(`SELECT ${RUN_COLUMNS} ${RUN_FROM} WHERE r.id = ?`).get(runId) as
      | RunRow
      | undefined) ?? null
  );
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
  /** Substring of the message, or of the task path. */
  q?: string;
  taskId?: number;
  runId?: number;
  /** Lowest level to include. */
  level?: "warn" | "error";
  /** Include the lines ngn writes around every run. */
  lifecycle?: boolean;
  limit?: number;
}

/** Log lines newest first — or, for one run, in the order they were written. */
export function listLogs(db: Db, filter: LogFilter = {}): LogRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const q = filter.q?.trim();
  if (q) {
    where.push("(l.value LIKE ? OR t.path LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (filter.taskId !== undefined) {
    where.push("l.file_task_id = ?");
    params.push(filter.taskId);
  }
  if (filter.runId !== undefined) {
    where.push("l.task_run_id = ?");
    params.push(filter.runId);
  }
  if (filter.level === "error") where.push("l.status = 'error'");
  if (filter.level === "warn") where.push("l.status IN ('warn', 'warning', 'error')");
  if (!filter.lifecycle) where.push(`l.value NOT IN ${LIFECYCLE_IN}`);
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
// Schema and the SQL console
// -----------------------------------------------------------------------------

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

export interface RelationSchema {
  name: string;
  type: "table" | "view";
  description: string | null;
  columns: ColumnInfo[];
}

/** What each of ngn's tables holds, for the schema browser. */
const DESCRIPTIONS: Record<string, string> = {
  file_tasks: "One row per task file, by path relative to the project root.",
  file_task_versions:
    "Each distinct compiled version of a task, with its code. A new row whenever the file's hash changes.",
  task_runs:
    "One row per scheduled execution. status: pending | skipped | running | success | failure.",
  logs: "ctx.log lines, plus the lifecycle lines ngn writes around every run. status: info | warning | error.",
  timings: "ctx.timing spans: label and duration in ms, recorded when the span ends.",
  kvs: "ctx.kv: each task's stored keys and their current value.",
};

export function listRelations(db: Db): RelationSchema[] {
  const relations = db
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY type = 'view', name`,
    )
    .all() as { name: string; type: "table" | "view" }[];

  return relations.map(({ name, type }) => ({
    name,
    type,
    description: DESCRIPTIONS[name] ?? null,
    columns: (
      db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[]
    ).map((c) => ({ name: c.name, type: c.type, notnull: c.notnull === 1, pk: c.pk > 0 })),
  }));
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export type Cell = string | number | null;

export type QueryResult =
  | {
      ok: true;
      columns: string[];
      rows: Cell[][];
      /** True when there were more rows than {@link MAX_QUERY_ROWS}. */
      truncated: boolean;
      ms: number;
    }
  | { ok: false; error: string };

export const MAX_QUERY_ROWS = 1000;

/**
 * Run one read statement and return at most {@link MAX_QUERY_ROWS} rows.
 *
 * Safety is not this function's job — the connection is read-only and
 * `query_only`, so SQLite itself refuses a write. What this adds is a clear
 * message for a statement that returns nothing to show, and a row cap enforced
 * by stepping the cursor rather than by rewriting the SQL with a LIMIT.
 */
export function runQuery(db: Db, sql: string): QueryResult {
  const started = performance.now();
  try {
    const statement = db.prepare(sql);
    if (!statement.reader) {
      return {
        ok: false,
        error:
          "Only statements that return rows run here — SELECT, WITH, PRAGMA, EXPLAIN. " +
          "The database is open read-only.",
      };
    }
    const columns = statement.columns().map((c) => c.name);
    const rows: Cell[][] = [];
    let truncated = false;
    for (const row of statement.raw(true).iterate() as IterableIterator<unknown[]>) {
      if (rows.length === MAX_QUERY_ROWS) {
        truncated = true;
        break;
      }
      rows.push(row.map(cell));
    }
    return { ok: true, columns, rows, truncated, ms: performance.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A value that survives the trip to the browser and says what it is. */
function cell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `<blob · ${value.length} bytes>`;
  return String(value);
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
