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
import { cronOf, describeCron, describeTask, parseRunQuery } from "../lib/ngn";
import type { Db, SchemaState } from "./db";
import { dbPath, fileBytes, getDb, schemaState } from "./db";
import type { LiveLanguage, LiveOutcome, LiveStatus } from "./live";
import { executeLive, liveTarget, probeLive } from "./live";
import type {
  ActivityBucket,
  Attempt,
  FacetCounts,
  FailingSpell,
  KvRow,
  RunActivity,
  LockRow,
  LogFilter,
  LogRow,
  Neighbours,
  Outcome,
  RunFilter,
  RunRow,
  SkipCount,
  StalledRun,
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
  Attempt,
  FacetCounts,
  RunActivity,
  FailingSpell,
  Outcome,
  KvRow,
  LockRow,
  LogRow,
  RunRow,
  SkipCount,
  StalledRun,
  TaskRow,
  TimingRow,
  TimingStat,
  VersionCode,
  VersionRow,
  WorkspaceCounts,
} from "./queries";

/** A task with how its path reads, and its newest Stalled run, if it has one. */
export type TaskItem = TaskRow & TaskName & { stalled_run_id: number | null };
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

/** A task row as pages get it: described, and with its newest Stalled run. */
function taskItem(row: TaskRow, stalled: ReadonlyMap<number, StalledRun>): TaskItem {
  let newest: number | null = null;
  for (const run of stalled.values()) {
    if (run.task_id === row.id && (newest == null || run.run_id > newest)) newest = run.run_id;
  }
  return { ...describe(row), stalled_run_id: newest };
}

/** The workspace's counts, with Stalled runs counted apart from the ones still running. */
export type Counts = WorkspaceCounts & { stalled: number };

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
  counts: Counts | null;
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
    const stalled = q.stalledRuns(db, base.now);
    const counts = q.workspaceCounts(db);
    return {
      ...base,
      bytes: fileBytes(),
      counts: { ...counts, open: counts.open - stalled.size, stalled: stalled.size },
      tasks: q.listTasks(db).map((task) => taskItem(task, stalled)),
    };
  },
);

// -----------------------------------------------------------------------------
// Overview
// -----------------------------------------------------------------------------

/** What the overview adds to a task's row, beyond what the workspace already has. */
export interface OverviewTask {
  id: number;
  /** The schedule in words, or the cron pattern when it has no plain reading. */
  schedule: string | null;
  /** Its latest runs, oldest first. */
  recent: Outcome[];
  /** Set while its latest verdict is a failure. */
  failing: (FailingSpell & { message: string | null }) | null;
}

/** A Stalled run, as Needs attention lists it. */
export type StalledItem = StalledRun & { path: string } & TaskName;

export interface Overview {
  /** Every scheduled task — the editor's are left out. */
  tasks: OverviewTask[];
  /** Runs that will never finish, newest first. */
  stalled: StalledItem[];
  activity: ActivityBucket[];
  /** Every named lock in the file, held or left behind. */
  locks: LockRow[];
}

/** Runs in each task's strip on the overview. */
const RECENT_RUNS = 24;

export const getOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<Overview> => {
    const db = readable();
    if (!db) return { tasks: [], stalled: [], activity: [], locks: [] };
    const all = q.listTasks(db);
    const paths = new Map(all.map((task) => [task.id, task.path]));
    const stalled = [...q.stalledRuns(db).values()]
      .filter((run) => paths.has(run.task_id))
      .toSorted((a, b) => b.run_id - a.run_id)
      .map((run) => describe({ ...run, path: paths.get(run.task_id)! }));
    const tasks = all
      .filter((task) => !describeTask(task.path).editor)
      .map((task): OverviewTask => {
        const cron = cronOf(q.getVersionCode(db, task.id)?.compiled_code);
        const spell = task.last_outcome === "failure" ? q.failingSpell(db, task.id) : null;
        return {
          id: task.id,
          schedule: cron ? (describeCron(cron) ?? cron) : null,
          recent: q.recentOutcomes(db, task.id, RECENT_RUNS),
          failing: spell && {
            ...spell,
            message: q.failureMessage(
              q.listLogs(db, { runId: spell.last_run_id, lifecycle: true, limit: 5000 }),
            ),
          },
        };
      });
    return { tasks, stalled, activity: q.activity(db, Date.now()), locks: q.listLocks(db) };
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
    r.status === "open" ||
    r.status === "stalled"
      ? r.status
      : undefined;
  return {
    q: optionalString(r.q),
    taskId: optionalId(r.taskId, "taskId"),
    status,
    // `hideLive` is what asking for scheduled runs only was called before `origin`.
    origin:
      r.origin === "scheduled" || r.origin === "editor"
        ? r.origin
        : r.hideLive === true
          ? ("scheduled" as const)
          : undefined,
    limit: optionalLimit(r.limit),
  };
}

export const getRuns = createServerFn({ method: "GET" })
  .validator(runFilter)
  .handler(async ({ data }): Promise<RunItem[]> => {
    const db = readable();
    return db ? q.listRuns(db, data).map(describe) : [];
  });

export interface RunsPage {
  runs: RunItem[];
  facets: FacetCounts;
  /** Runs over time under every filter but the time ones, for the chart to scrub. */
  activity: RunActivity;
  /** What in the filter could not be read, for the filter bar to show. */
  errors: string[];
}

/**
 * The Runs view: runs matching a filter in the language `ngn runs` takes, and
 * how many each status and origin would give. `taskId` scopes it to one task,
 * which is how a task's Runs tab is the same view.
 */
export const getRunsPage = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const r = record(input);
    return {
      query: optionalString(r.query) ?? "",
      taskId: optionalId(r.taskId, "taskId"),
      limit: optionalLimit(r.limit),
    };
  })
  .handler(async ({ data }): Promise<RunsPage> => {
    const now = Date.now();
    const { tokens, errors } = parseRunQuery(data.query, now);
    const db = readable();
    if (!db) {
      return {
        runs: [],
        facets: q.facetCounts(null, [], now),
        activity: q.runActivity(null, [], now),
        errors,
      };
    }
    const scoped = data.taskId === undefined ? {} : { taskId: data.taskId };
    return {
      runs: q.listRuns(db, { ...scoped, tokens, limit: data.limit }, now).map(describe),
      facets: q.facetCounts(db, tokens, now, data.taskId),
      activity: q.runActivity(db, tokens, now, data.taskId),
      errors,
    };
  });

function logFilter(input: unknown): LogFilter {
  const r = record(input);
  return {
    taskId: optionalId(r.taskId, "taskId"),
    runId: optionalId(r.runId, "runId"),
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
    return { task: taskItem(task, q.stalledRuns(db)), latest: q.getVersionCode(db, task.id) };
  });

/** A task's tabs: its run history, timings, keys and versions. */
export interface TaskDetails {
  runs: RunRow[];
  timings: TimingStat[];
  versions: VersionRow[];
  keys: KvRow[];
  /** Lines the task wrote itself, across every run. */
  logCount: number;
  /** Why its runs were skipped, most common first. */
  skips: SkipCount[];
  /** The version picked in the Versions tab, or the newest. */
  code: VersionCode | null;
}

/** Runs a task page holds. `ngn sql` reaches further back. */
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
      logCount: q.countTaskLines(db, taskId),
      skips: q.skipReasons(db, taskId),
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
  /** What the task returned, as JSON; null when it returned nothing. */
  result: string | null;
  /** Every try of this run's tick, first first; just this run when it was not retried. */
  attempts: Attempt[];
  /** Locks this run holds now, or left behind. */
  locks: LockRow[];
  /** Why the run is Stalled, when it is. */
  stall: StalledRun | null;
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
    const stalled = q.stalledRuns(db);
    return {
      run: describe(run),
      task: taskItem(task, stalled),
      logs,
      timings: q.listRunTimings(db, run.id),
      failure: run.status === "failure" ? q.failureMessage(logs) : null,
      neighbours: q.runNeighbours(db, run.task_id, run.id),
      code: q.getVersionCode(db, run.task_id, run.version_id),
      result: q.getRunResult(db, run.id),
      attempts: q.tickAttempts(db, run),
      locks: q.listLocks(db).filter((lock) => lock.run_id === run.id),
      stall: stalled.get(run.id) ?? null,
    };
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
        error:
          "The editor is off: no ngn.config.ts where ngnui started. Restart it with --live <url of a running ngn run>.",
        ms: 0,
        runId: null,
      };
    }
    const sent = Date.now();
    const outcome = await executeLive(target, data.code, data.language);
    const db = readable();
    return { ...outcome, runId: db ? q.latestLiveRun(db, sent) : null };
  });
