import { createClient, type Client, type InArgs, type InStatement, type ResultSet } from "@libsql/client";
import { definePlugin, type Plugin } from "ngn-core";

/**
 * Configuration for the SQLite plugin
 */
export interface SqlitePluginConfig {
  /** Database URL (e.g., "file:local.db" or a libsql URL) */
  url: string;
  /** Optional auth token for remote databases */
  authToken?: string;
}

/**
 * API exposed by the SQLite plugin
 */
export interface SqlitePluginApi {
  /** Raw libsql client for advanced usage */
  client: Client;
  /** Execute a single SQL statement */
  execute: (sql: string, args?: InArgs) => Promise<ResultSet>;
  /** Execute multiple SQL statements in a batch */
  batch: (statements: InStatement[]) => Promise<ResultSet[]>;
}

/**
 * Creates a SQLite plugin instance
 *
 * @example
 * ```ts
 * import { defineConfig } from '@apisurf/ngn';
 * import { sqlitePlugin } from '@apisurf/ngn-plugins';
 *
 * export default defineConfig({
 *   plugins: [
 *     sqlitePlugin({ url: 'file:local.db' }),
 *   ],
 * });
 *
 * // In a task:
 * export async function task(ctx) {
 *   const result = await ctx.plugins.sqlite.execute(
 *     'SELECT * FROM users WHERE id = ?',
 *     [1]
 *   );
 *   console.log(result.rows);
 * }
 * ```
 */
export function sqlitePlugin(
  config: SqlitePluginConfig
): Plugin<"sqlite", SqlitePluginConfig, SqlitePluginApi> {
  let client: Client;

  return definePlugin({
    name: "sqlite",
    config,

    init() {
      client = createClient({
        url: config.url,
        authToken: config.authToken,
      });

      return {
        client,
        execute: (sql: string, args?: InArgs) =>
          client.execute(args ? { sql, args } : sql),
        batch: (statements: InStatement[]) => client.batch(statements),
      };
    },

    destroy() {
      client.close();
    },
  });
}
