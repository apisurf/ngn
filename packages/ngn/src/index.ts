export { defineConfig } from "./defineConfig";
export type { ConfigFileOptions } from "./configSchema";

/**
 * Context object provided to task functions.
 *
 * Everything a task gets is on here — env, kv, log, timing, meta and sqlite.
 * Anything else a task needs, it imports itself from its own node_modules.
 */
export type { TaskContext } from "ngn-core";

// SQLite types, for tasks that want to name what ctx.sqlite hands back
export type { TaskSqlite, DBInstance, InitDBOptions, Migration } from "ngn-core";

// Re-export file descriptor type from os (aliased for cleaner API)
export type { FsNodeFileDescriptor as FileDescriptor } from "ngn-os";
