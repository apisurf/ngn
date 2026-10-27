import { TaskContext } from "../source/types.js";
import type { RunLocks } from "./locks.js";

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
  onNotFound?: (meta: { path: string }) => Promise<void>;
  /** `reason` is set when ngn skipped the run, rather than the task's `shouldSkip`. */
  onSkip?: (meta: { path: string; reason?: string }) => Promise<void>;
  onStart?: (meta: { path: string }) => Promise<void>;
  onSuccess?: (meta: { path: string; result?: unknown }) => Promise<void>;
  onFailure?: (meta: { path: string }) => Promise<void>;
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
};
