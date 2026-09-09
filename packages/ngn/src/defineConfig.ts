import type { ConfigFileOptions } from "./configSchema.js";

/**
 * Define NGN configuration.
 *
 * @example
 * export default defineConfig({
 *   dbPath: "file:ngn.db",
 *   match: ["tasks/**\/*.ts"],
 * });
 */
export function defineConfig(config: Partial<ConfigFileOptions>): Partial<ConfigFileOptions> {
  return config;
}
