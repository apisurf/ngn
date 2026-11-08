import type { RunStage } from "@apisurf/ngn-schema/describe";
import { TaskContext } from "../source/types.js";
import type { RunLocks } from "./locks.js";
import type { ScheduleStore } from "../db/services/schedule.js";
import type { LockService } from "../db/services/lock.js";

export type { RunStage };

export interface CompiledTaskCallbacks {
  onTaskLoadComplete?: ({
    paths,
    md5Hash,
    compiledCode,
  }: {
    paths: {
      compiled: string;
      source: string;
      relativeEntry: string;
      relativeParent: string;
    };
    md5Hash: string;
    compiledCode: string;
  }) => Promise<{
    fileTaskId: number;
    fileTaskVersionId: number;
  }>;

  onTaskCodeLoaded?: () => Promise<void>;
  onTaskExportsLoaded?: () => Promise<void>;
}

export interface TaskRuntimeCallbacks {
  /** `reason` is set when ngn skipped the run, rather than the task's `shouldSkip`. */
  onSkip?: (meta: { path: string; reason?: string }) => Promise<void>;
  onStart?: (meta: { path: string }) => Promise<void>;
  onSuccess?: (meta: { path: string; result?: unknown }) => Promise<void>;
  /** The run failed: `error` was thrown in `stage`. Never throws itself. */
  onFailure?: (meta: { path: string; stage: RunStage; error: unknown }) => Promise<void>;
  /** A hook threw; the run's outcome stands. Never throws itself. */
  onHookError?: (meta: { path: string; stage: RunStage; error: unknown }) => Promise<void>;
}

/**
 * Something a run threw, once it is recorded against the run: what the CLI
 * prints. `fatal` is false for a hook's error, which leaves the run's outcome
 * as it was.
 */
export interface RunProblem {
  path: string;
  runId: number;
  stage: RunStage;
  error: unknown;
  fatal: boolean;
}

/**
 * One run's bookkeeping: its row in `task_runs`, and everything that writes
 * against that row. Made fresh for every execution, so two runs of one task
 * that overlap never write to each other's row.
 */
export interface RunControls {
  id: number;
  log: TaskContext["log"];
  timing: TaskContext["timing"];
  locks: RunLocks;
  callbacks: TaskRuntimeCallbacks;
}

export type BuildCompiledTaskConfigFn = ({
  sourcePath,
  compiledPath,
}: {
  sourcePath: string;
  compiledPath: string;
}) => TaskConfig;

/** Everything one task file gets from ngn, built once per `Task`. */
export type TaskConfig = {
  compiledPath: string;
  sourcePath: string;
  taskCallbacks: CompiledTaskCallbacks;
  /**
   * Open a run: insert its `task_runs` row and hand back what writes to it.
   * `retryOf` is the first run of the tick a retry belongs to.
   */
  startRun: (options?: { retryOf?: number | null }) => Promise<RunControls>;
  /** The task's run history, for the circuit breaker. */
  history: {
    recentTickOutcomes(
      limit: number,
    ): Promise<Array<{ id: number; outcome: "success" | "failure" }>>;
    countSkipsSince(reason: string, afterId: number): Promise<number>;
  };
  env: TaskContext["env"];
  kv: TaskContext["kv"];
  sqlite: TaskContext["sqlite"];
  /** The run database's schedules and leases, for whatever schedules or starts the task. */
  scheduling: { store: ScheduleStore; locks: LockService };
};
