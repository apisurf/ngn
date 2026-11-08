import { FsNodeFileDescriptor } from "@apisurf/ngn-os";
import { TaskSqlite } from "../runtime/taskSqlite.js";
import type { Duration } from "../runtime/duration.js";
import type { LockOptions } from "../runtime/locks.js";
import type { Queue, QueueOptions } from "../runtime/queue/queue.js";
import type { RetryPolicy } from "../runtime/retry.js";
import type { TimingExport } from "../runtime/timing.js";

/**
 * The run this context belongs to, and how long it has. Times are epoch
 * milliseconds, as everywhere in ngn's database.
 */
export interface TaskRun {
  /** This run's `task_runs.id`. */
  id: number;
  /** When the tick that started it was planned for; null for a run with no schedule. */
  scheduledAt: number | null;
  /**
   * When the next tick is due: the next slot of a cron pattern or the leading
   * edge. Null on the trailing edge, whose next run depends on when this one
   * ends, and for a run with no schedule.
   */
  nextAt: number | null;
  /**
   * When to stop starting new work: shortly before `nextAt`, or sooner with a
   * `budget` export. Null when neither applies.
   */
  deadline: number | null;
  /**
   * Aborts at `deadline`. It is a request: ngn does not stop a run that keeps
   * going past it.
   */
  signal: AbortSignal;
}

export type LiveSourceParams = {
  livePath: `live:${string}`;
  code: string;
};

export type DbSourceParams = {
  compiledCode: string;
  descriptor: FsNodeFileDescriptor;
  tasksRootDir: string;
};

export type EntryParams = LiveSourceParams | DbSourceParams;

/**
 * The single argument every task export receives.
 */
export interface TaskContext {
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
    file: FsNodeFileDescriptor;
    tasksRootDir: string;
  };
  /** The variables from the config's `envFile`; empty when there is none. */
  env: Record<string, string>;
  kv: {
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
  };
  log: {
    info(value: string): Promise<void>;
    error(value: string): Promise<void>;
    warning(value: string): Promise<void>;
  };
  timing: {
    start(label: string): () => Promise<void>;
  };
  run: TaskRun;
  /**
   * Run `fn` holding the named lock, shared with every task and process using
   * the same ngn database. Waits for it by default; throws a `LockBusyError`
   * when it cannot be had in time.
   */
  lock<T>(name: string, fn: () => Promise<T> | T, options?: LockOptions): Promise<T>;
  /**
   * Open a named job queue, by default in this task's own database. Any task
   * that opens the same name on the same database shares it.
   */
  queue<T = unknown>(name: string, options?: QueueOptions): Promise<Queue<T>>;
  /**
   * SQLite scoped to the folder this task file lives in. Always present — no
   * configuration required.
   */
  sqlite: TaskSqlite;
}

/**
 * ngn runs one run of a task at a time, so `"skip"` is the only policy: a run
 * that comes due while one is going waits for it. `"allow"` fails at schedule
 * time; it is kept in the type so the message can say why.
 */
export type OverlapPolicy = "skip" | "allow";

export interface EntryExports {
  /** A cron pattern, or `{ every, edge, min, max, backoff }`. */
  timing?: TimingExport;
  overlap?: OverlapPolicy;
  /** The longest a run should take; caps `ctx.run.deadline`. */
  budget?: Duration;
  /**
   * Locks held for the whole run. A run that cannot take all of them at once is
   * recorded as skipped instead of waiting.
   */
  exclusive?: string | string[];
  task: (deps: TaskContext) => Promise<void>;
  shouldSkip?: (deps: TaskContext) => Promise<boolean>;
  /** Retry a failed run within its tick; see `RetryPolicy`. */
  retry?: RetryPolicy;
  /** Asked before each retry `retry` allows; false gives up until the next tick. */
  shouldRetry?: (err: Error, deps: TaskContext) => Promise<boolean> | boolean;
  onSuccess?: (deps: TaskContext) => Promise<void>;
  onError?: (err: Error, deps: TaskContext) => Promise<void>;
  onComplete?: (deps: TaskContext) => Promise<void>;
  /**
   * An interval task's say in when it runs next, from how its tick went. Called
   * after every scheduled tick, after `onComplete`; see `NextOutcome`.
   */
  next?: (outcome: NextOutcome, ctx: TaskContext) => NextDecision | Promise<NextDecision>;
}

interface NextOutcomeBase {
  /** Failed ticks in a row, this one included. */
  failedInARow: number;
  /** The delay that led to this tick, in ms; null when there was none to measure. */
  previousDelayMs: number | null;
  /** The `task_runs.id` of the tick's final run. */
  runId: number;
}

/** What the `next` hook is told about the tick that just ended. */
export type NextOutcome<Result = any> = NextOutcomeBase &
  (
    | { status: "success"; result: Result; error: undefined; skipReason: null }
    | { status: "failure"; result: undefined; error: Error; skipReason: null }
    | {
        status: "skipped";
        result: undefined;
        error: undefined;
        /** Why ngn skipped it; null for a skip by the task's own `shouldSkip`. */
        skipReason: string | null;
      }
  );

/**
 * When to run next: a duration from when the tick ended, or the task's own
 * `every`, `min` or `max`. ngn keeps it within `[min, max]`.
 */
export type NextDelay = Duration | "every" | "min" | "max";

/** What the `next` hook returns: undefined leaves it to the default policy. */
export type NextDecision = undefined | void | NextDelay | { in: NextDelay; reason?: string };

export interface OnTaskCodeLoaded {
  (md5Hash: string): Promise<void>;
}
