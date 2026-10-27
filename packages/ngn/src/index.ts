export { defineConfig } from "./defineConfig.js";
export type { ConfigFileOptions } from "./configSchema.js";

/**
 * Context object provided to task functions.
 *
 * Everything a task gets is on here — env, kv, log, timing, meta and sqlite.
 * Anything else a task needs, it imports itself from its own node_modules.
 */
export type {
  TaskContext,
  TaskRun,
  OverlapPolicy,
  Duration,
  LockOptions,
  Queue,
  QueueOptions,
  QueueStats,
  AddJob,
  Backoff,
  Job,
  JobFilter,
  JobStatus,
  WorkHandler,
  WorkOptions,
  WorkSummary,
  WorkerHandle,
} from "@apisurf/ngn-core";
// Types only from core: ngn bundles @apisurf packages into every task, so a
// value exported here would drag the whole runtime into each task's bundle.
export type { LockBusyError } from "@apisurf/ngn-core";

// SQLite types, for tasks that want to name what ctx.sqlite hands back
export type { TaskSqlite, DBInstance, InitDBOptions, Migration } from "@apisurf/ngn-core";

// Re-export file descriptor type from os (aliased for cleaner API)
export type { FsNodeFileDescriptor as FileDescriptor } from "@apisurf/ngn-os";
