export { defineConfig } from "./defineConfig";
export type { ConfigFileOptions, TypedConfigFileOptions } from "./configSchema";

// Plugin types for user convenience
export type { Plugin, PluginsToApiMap } from "./pluginTypes";

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
 * Plugin types are automatically inferred from PluginRegistry.
 */
export interface TaskContext {
  meta: {
    fileTaskId: number;
    fileTaskVersionId: number;
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
  plugins: PluginRegistry;
}
