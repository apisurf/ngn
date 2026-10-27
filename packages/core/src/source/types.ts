import { FsNodeFileDescriptor } from "@apisurf/ngn-os";
import { TaskSqlite } from "../runtime/taskSqlite.js";
import type { Duration } from "../runtime/duration.js";
import type { LockOptions } from "../runtime/locks.js";
import type { Queue, QueueOptions } from "../runtime/queue/queue.js";
import type { RetryPolicy } from "../runtime/retry.js";

/**
 * The run this context belongs to, and how long it has. Times are epoch
 * milliseconds, as everywhere in ngn's database.
 */
export interface TaskRun {
  /** This run's `task_runs.id`. */
  id: number;
  /** When the tick that started it fired; null for a run with no schedule. */
  scheduledAt: number | null;
  /** When the next tick is due; null for a run with no schedule. */
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
  env: Record<string, string> | null;
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
 * What a scheduled tick does when the task's previous run is still going:
 * `"skip"` records the tick as a skipped run, `"allow"` starts another run
 * beside it.
 */
export type OverlapPolicy = "skip" | "allow";

export interface EntryExports {
  timing?: string;
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
}

export interface OnTaskCodeLoaded {
  (md5Hash: string): Promise<void>;
}
