import type { Plugin, PluginsToApiMap } from "./pluginTypes";
import type { TypedConfigFileOptions } from "./configSchema";

/**
 * Define NGN configuration with full type inference for plugins.
 *
 * @example
 * export default defineConfig({
 *   plugins: [dbPlugin({ connectionString: '...' })],
 * });
 *
 * // In task files, ctx.plugins.db will be fully typed
 */
export function defineConfig<const TPlugins extends readonly Plugin[] = []>(
  config: TypedConfigFileOptions<TPlugins>
): TypedConfigFileOptions<TPlugins> & {
  __pluginTypes?: PluginsToApiMap<TPlugins>;
} {
  return config;
}
