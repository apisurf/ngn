// Server functions: the whole surface the browser can call.
//
// Each one is a thin wrapper over a query in ./queries. `createServerFn` keeps
// the handler bodies, and the native better-sqlite3 import they pull in, out of
// the client bundle.
//
// Every function but one is a read. There is no auth and no ownership filter:
// this server binds to loopback, reads one file the user already owns through a
// read-only connection, and only runs because they started it. The exception,
// `runLive`, forwards code to the `ngn run` named by `--live` — see ./live.

import { createServerFn } from "@tanstack/react-start";
import { dirname } from "node:path";
import type { TaskName } from "../lib/ngn";
import { describeTask } from "../lib/ngn";
import type { Db, SchemaState } from "./db";
import { dbPath, fileBytes, getDb, schemaState } from "./db";
import type { LiveLanguage, LiveOutcome, LiveStatus } from "./live";
import { executeLive, liveTarget, probeLive } from "./live";
import type {
  ActivityBucket,
  KvRow,
  LogFilter,
  LogRow,
  Neighbours,
  QueryResult,
  RelationSchema,
  RunFilter,
  RunRow,
  TaskRow,
  TimingRow,
  TimingStat,
  VersionCode,
  VersionRow,
  WorkspaceCounts,
} from "./queries";
import * as q from "./queries";

export type { SchemaState } from "./db";
export type { LiveLanguage, LiveOutcome, LiveStatus } from "./live";
export type {
  ActivityBucket,
  Cell,
  ColumnInfo,
  KvRow,
  LogRow,
  QueryResult,
  RelationSchema,
  RunRow,
  TaskRow,
  TimingRow,
  TimingStat,
  VersionCode,
  VersionRow,
  WorkspaceCounts,
} from "./queries";

/** A row carrying how its task path reads, resolved once, server-side. */
export type TaskItem = TaskRow & TaskName;
export type RunItem = RunRow & TaskName;
export type LogItem = LogRow & TaskName;

// -----------------------------------------------------------------------------
// Input validation
//
// Small and hand-written on purpose: every input here is an id, an optional
// string or a flag, and a schema library would be the largest dependency in
// the server bundle to check a handful of shapes.
// -----------------------------------------------------------------------------

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function id(value: unknown, name: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

function optionalId(value: unknown, name: string): number | undefined {
  return value === undefined || value === null || value === "" ? undefined : id(value, name);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// -----------------------------------------------------------------------------
// Shared plumbing
// -----------------------------------------------------------------------------

/** The open database when it is an ngn database these queries can read, else null. */
function readable(): Db | null {
  const db = getDb();
  return schemaState(db).state === "current" ? db : null;
}

function describe<T extends { path: string }>(row: T): T & TaskName {
  return { ...row, ...describeTask(row.path) };
}

// -----------------------------------------------------------------------------
// Workspace: what the frame draws on every page
// -----------------------------------------------------------------------------

export interface Workspace {
  /** Absolute path of the file being browsed. */
  path: string;
  /** Folder the file sits in — normally the project root `ngn run` started in. */
  root: string;
  bytes: number;
  schema: { state: SchemaState; missing: string[] };
  counts: WorkspaceCounts | null;
  /** Every task, most recently run first. */
  tasks: TaskItem[];
  /** The `--live` endpoint this server forwards to, or null when the editor is off. */
  live: string | null;
  /** The server's clock, so relative times agree on both sides of hydration. */
  now: number;
}

export const getWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<Workspace> => {
    const path = dbPath();
    const handle = getDb();
    const schema = schemaState(handle);
    const base = {
      path,
      root: dirname(path),
      schema,
      live: liveTarget()?.url ?? null,
      now: Date.now(),
    };
    const db = readable();
    if (!db) {
      return { ...base, bytes: handle ? fileBytes() : 0, counts: null, tasks: [] };
    }
    return {
      ...base,
      bytes: fileBytes(),
      counts: q.workspaceCounts(db),
      tasks: q.listTasks(db).map(describe),
    };
  },
);

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

export interface Overview {
  runs: RunItem[];
  /** Warnings and errors tasks logged, newest first. */
  problems: LogItem[];
  activity: ActivityBucket[];
}

export const getOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<Overview> => {
    const db = readable();
    if (!db) return { runs: [], problems: [], activity: [] };
    return {
      runs: q.listRuns(db, { limit: 12 }).map(describe),
      problems: q.listLogs(db, { level: "warn", limit: 12 }).map(describe),
      activity: q.activity(db, Date.now()),
    };
  },
);

// -----------------------------------------------------------------------------
// History and logs, across every task
// -----------------------------------------------------------------------------

function runFilter(input: unknown): RunFilter {
  const r = record(input);
  const status =
    r.status === "failure" ||
    r.status === "success" ||
    r.status === "skipped" ||
    r.status === "open"
      ? r.status
      : undefined;
  return {
    q: optionalString(r.q),
    taskId: optionalId(r.taskId, "taskId"),
    status,
    hideLive: r.hideLive === true,
    limit: optionalLimit(r.limit),
  };
}

export const getRuns = createServerFn({ method: "GET" })
  .validator(runFilter)
  .handler(async ({ data }): Promise<RunItem[]> => {
    const db = readable();
    return db ? q.listRuns(db, data).map(describe) : [];
  });

function logFilter(input: unknown): LogFilter {
  const r = record(input);
  return {
    q: optionalString(r.q),
    taskId: optionalId(r.taskId, "taskId"),
    runId: optionalId(r.runId, "runId"),
    level: r.level === "warn" || r.level === "error" ? r.level : undefined,
    lifecycle: r.lifecycle === true,
    limit: optionalLimit(r.limit),
  };
}

export const getLogs = createServerFn({ method: "GET" })
  .validator(logFilter)
  .handler(async ({ data }): Promise<LogItem[]> => {
    const db = readable();
    return db ? q.listLogs(db, data).map(describe) : [];
  });

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

/** What the task's header needs, shown above its tabs and above any one run of it. */
export interface TaskPage {
  task: TaskItem;
  /** The newest version's code, which is what the schedule and hooks are read from. */
  latest: VersionCode | null;
}

export const getTask = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ taskId: id(record(input).taskId, "taskId") }))
  .handler(async ({ data }): Promise<TaskPage | null> => {
    const db = readable();
    if (!db) return null;
    const task = q.getTask(db, data.taskId);
    if (!task) return null;
    return { task: describe(task), latest: q.getVersionCode(db, task.id) };
  });

/** A task's tabs: its run history, timings, keys and versions. */
export interface TaskDetails {
  runs: RunRow[];
  timings: TimingStat[];
  versions: VersionRow[];
  keys: KvRow[];
  /** The version picked in the Versions tab, or the newest. */
  code: VersionCode | null;
}

/** Runs a task page holds. The SQL console reaches further back. */
const TASK_RUN_WINDOW = 1000;

export const getTaskDetails = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const r = record(input);
    return { taskId: id(r.taskId, "taskId"), versionId: optionalId(r.versionId, "versionId") };
  })
  .handler(async ({ data }): Promise<TaskDetails | null> => {
    const db = readable();
    if (!db) return null;
    const taskId = data.taskId;
    return {
      runs: q.listRuns(db, { taskId, limit: TASK_RUN_WINDOW }),
      timings: q.timingStats(db, taskId),
      versions: q.listVersions(db, taskId),
      keys: q.listKeys(db, taskId),
      code:
        (data.versionId === undefined ? null : q.getVersionCode(db, taskId, data.versionId)) ??
        q.getVersionCode(db, taskId),
    };
  });

// -----------------------------------------------------------------------------
// Runs
// -----------------------------------------------------------------------------

export interface RunPage {
  run: RunItem;
  task: TaskItem;
  /** Every line, lifecycle included, in the order written. */
  logs: LogRow[];
  timings: TimingRow[];
  /** The last error the task logged, for a failed run's headline. */
  failure: string | null;
  /** Older and newer runs of the same task. */
  neighbours: Neighbours;
  /** The code this run executed. */
  code: VersionCode | null;
}

/** The task a run belongs to, so a bare run link can be sent to it. */
export const getRunTaskId = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ runId: id(record(input).runId, "runId") }))
  .handler(async ({ data }): Promise<number | null> => {
    const db = readable();
    return db ? (q.getRun(db, data.runId)?.task_id ?? null) : null;
  });

export const getRun = createServerFn({ method: "GET" })
  .validator((input: unknown) => ({ runId: id(record(input).runId, "runId") }))
  .handler(async ({ data }): Promise<RunPage | null> => {
    const db = readable();
    if (!db) return null;
    const run = q.getRun(db, data.runId);
    if (!run) return null;
    const task = q.getTask(db, run.task_id);
    if (!task) return null;
    const logs = q.listLogs(db, { runId: run.id, lifecycle: true, limit: 5000 });
    return {
      run: describe(run),
      task: describe(task),
      logs,
      timings: q.listRunTimings(db, run.id),
      failure: run.status === "failure" ? q.failureMessage(logs) : null,
      neighbours: q.runNeighbours(db, run.task_id, run.id),
      code: q.getVersionCode(db, run.task_id, run.version_id),
    };
  });

// -----------------------------------------------------------------------------
// Schema and SQL
// -----------------------------------------------------------------------------

export const getSchema = createServerFn({ method: "GET" }).handler(
  async (): Promise<RelationSchema[]> => {
    const db = getDb();
    return db ? q.listRelations(db) : [];
  },
);

export const runSql = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const sql = optionalString(record(input).sql)?.trim();
    if (!sql) throw new Error("sql is required");
    return { sql };
  })
  .handler(async ({ data }): Promise<QueryResult> => {
    const db = getDb();
    if (!db) return { ok: false, error: `No database at ${dbPath()} yet.` };
    return q.runQuery(db, data.sql);
  });

// -----------------------------------------------------------------------------
// Live editor
// -----------------------------------------------------------------------------

export const getLiveStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<LiveStatus> => probeLive(liveTarget()),
);

export type LiveRun = LiveOutcome & {
  /** The run `ngn run` recorded for this code, when it could be found. */
  runId: number | null;
};

/** Source this large is not something typed into an editor. */
const MAX_LIVE_CODE = 1_000_000;

export const runLive = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const r = record(input);
    const code = optionalString(r.code);
    if (!code?.trim()) throw new Error("code is required");
    if (code.length > MAX_LIVE_CODE) throw new Error("code is too large");
    const language: LiveLanguage = r.language === "javascript" ? "javascript" : "typescript";
    return { code, language };
  })
  .handler(async ({ data }): Promise<LiveRun> => {
    const target = liveTarget();
    if (!target) {
      return {
        ok: false,
        error: "The live editor is off. Restart ngnui with --live <url of a running ngn run>.",
        ms: 0,
        runId: null,
      };
    }
    const sent = Date.now();
    const outcome = await executeLive(target, data.code, data.language);
    const db = readable();
    return { ...outcome, runId: db ? q.latestLiveRun(db, sent) : null };
  });
