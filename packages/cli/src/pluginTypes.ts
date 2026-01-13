/**
 * Base plugin interface with lifecycle and API exposure
 * This is a copy of the type from ngn-core to avoid ESM import issues in DTS build
 */
export interface Plugin<
  TName extends string = string,
  TConfig = unknown,
  TApi = unknown
> {
  name: TName;
  config?: TConfig;
  init(): Promise<TApi> | TApi;
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
 */
export type PluginsToApiMap<T extends readonly Plugin[]> = {
  [P in T[number] as PluginName<P>]: PluginApi<P>;
};
