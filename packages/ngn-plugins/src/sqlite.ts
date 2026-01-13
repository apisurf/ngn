import {
  createClient,
  type Client,
  type InArgs,
  type InStatement,
  type ResultSet,
} from "@libsql/client";
import { definePlugin, type Plugin } from "ngn-core";

/**
 * A database migration
 */
export interface Migration {
  /** Unique identifier (use datetime format e.g., "2024-01-13-001") */
  id: string;
  /** SQL statement(s) to execute */
  up: string;
}

/**
 * Configuration for the SQLite plugin
 */
export interface SqlitePluginConfig {
  /** Database URL (e.g., "file:local.db" or a libsql URL) */
  url: string;
  /** Optional migrations to run on init */
  migrations?: Migration[];
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
 * import { sqlitePlugin } from '@apisurf/ngn-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     sqlitePlugin({
 *       url: 'file:local.db',
 *       migrations: [
 *         { id: '2024-01-13-001', up: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)' },
 *         { id: '2024-01-14-001', up: 'ALTER TABLE users ADD COLUMN email TEXT' },
 *       ],
 *     }),
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

    async init() {
      client = createClient({
        url: config.url,
      });

      // Run migrations if provided
      if (config.migrations?.length) {
        // Create migrations tracking table
        await client.execute(`
          CREATE TABLE IF NOT EXISTS _ngn_migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
          )
        `);

        // Get already applied migrations
        const applied = await client.execute("SELECT id FROM _ngn_migrations");
        const appliedIds = new Set(applied.rows.map((r) => r.id as string));

        // Run pending migrations in order
        for (const migration of config.migrations) {
          if (appliedIds.has(migration.id)) continue;

          await client.execute(migration.up);
          await client.execute({
            sql: "INSERT INTO _ngn_migrations (id, applied_at) VALUES (?, ?)",
            args: [migration.id, new Date().toISOString()],
          });
        }
      }

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
