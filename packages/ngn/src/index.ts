import type { BaseTaskContext } from "ngn-core";

export { defineConfig } from "./defineConfig";
export type { ConfigFileOptions, TypedConfigFileOptions } from "./configSchema";

// Plugin types for user convenience
export type { Plugin, PluginsToApiMap } from "./pluginTypes";

// Re-export types from core
export type { BaseTaskContext } from "ngn-core";

// Re-export file descriptor type from os (aliased for cleaner API)
export type { FsNodeFileDescriptor as FileDescriptor } from "ngn-os";

/**
 * Plugin registry interface for module augmentation.
 * Augment this interface to add your plugin types:
 *
 * @example
 * // In ngn.d.ts
 * declare module "@apisurf/ngn" {
 *   interface PluginRegistry {
 *     sqlite: SqlitePluginApi;
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginRegistry {}

/**
 * Context object provided to task functions.
 * Extends BaseTaskContext from core with typed plugin registry.
 */
export interface TaskContext extends BaseTaskContext {
  plugins: PluginRegistry;
}
