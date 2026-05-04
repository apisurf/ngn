/**
 * Context passed to plugin init functions
 */
export interface PluginInitContext {
  /** Root directory for tasks */
  rootDir: string;
  /** Environment variables */
  env: Record<string, string> | null;
}

/**
 * Base plugin interface with lifecycle and API exposure
 * @template TName - Plugin name (used as key in ctx.plugins)
 * @template TConfig - Plugin configuration type
 * @template TApi - Plugin API type exposed to tasks
 */
export interface Plugin<
  TName extends string = string,
  TConfig = unknown,
  TApi = unknown
> {
  /** Unique plugin name - used as key in ctx.plugins */
  name: TName;

  /** Plugin configuration */
  config?: TConfig;

  /**
   * Initialize the plugin. Called once at CLI startup.
   * Returns the API object that will be injected into TaskContext.
   */
  init(ctx: PluginInitContext): Promise<TApi> | TApi;

  /**
   * Cleanup the plugin. Called at CLI shutdown (SIGINT/SIGTERM).
   */
  destroy(): Promise<void> | void;
}

/**
 * Helper type to extract the API type from a plugin
 */
export type PluginApi<P> = P extends Plugin<string, unknown, infer TApi>
  ? TApi
  : never;

/**
 * Helper type to extract the name from a plugin
 */
export type PluginName<P> = P extends Plugin<infer TName, unknown, unknown>
  ? TName
  : never;

/**
 * Convert a tuple of plugins into a plugins map type
 * Example: [Plugin<'db', {}, DbApi>, Plugin<'cache', {}, CacheApi>]
 *       => { db: DbApi, cache: CacheApi }
 */
export type PluginsToApiMap<T extends readonly Plugin[]> = {
  [P in T[number] as PluginName<P>]: PluginApi<P>;
};
