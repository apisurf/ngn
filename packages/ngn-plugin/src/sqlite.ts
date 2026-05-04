import {
  createClient,
  type Client,
  type InArgs,
  type InStatement,
  type ResultSet,
} from "@libsql/client";
import { definePlugin, type Plugin, type PluginInitContext } from "ngn-core";
import { unlink } from "node:fs/promises";

// Import the interface we're augmenting
// @ts-expect-error - PluginRegistry is used via module augmentation below
import type { PluginRegistry } from "@apisurf/ngn";

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
 * Options for initializing a new database
 */
export interface InitDBOptions {
  /** Database URL (e.g., "file:local.db") */
  url: string;
  /** Optional migrations to run */
  migrations?: Migration[];
}

/**
 * A database instance created by initDB
 */
export interface DBInstance {
  /** Raw libsql client for advanced usage */
  client: Client;
  /** Execute a single SQL statement */
  execute: (sql: string, args?: InArgs) => Promise<ResultSet>;
  /** Execute multiple SQL statements in a batch */
  batch: (statements: InStatement[]) => Promise<ResultSet[]>;
  /** Close the database connection */
  close: () => void;
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
  /** Initialize a new database with optional migrations */
  initDB: (options: InitDBOptions) => Promise<DBInstance>;
  /** Destroy a database file by URL (only works for file: URLs) */
  destroyDB: (url: string) => Promise<void>;
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
/**
 * Run migrations on a database client
 */
async function runMigrations(
  client: Client,
  migrations: Migration[]
): Promise<void> {
  if (!migrations.length) return;

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
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;

    await client.execute(migration.up);
    await client.execute({
      sql: "INSERT INTO _ngn_migrations (id, applied_at) VALUES (?, ?)",
      args: [migration.id, new Date().toISOString()],
    });
  }
}

/**
 * Extract file path from a file: URL
 */
function getFilePathFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) {
    return null;
  }
  // Handle "file:name.db" and "file:/path/to/db" formats
  return url.slice(5);
}

export function sqlitePlugin(
  config: SqlitePluginConfig
): Plugin<"sqlite", SqlitePluginConfig, SqlitePluginApi> {
  let client: Client;
  const additionalClients: Set<Client> = new Set();

  return definePlugin({
    name: "sqlite",
    config,

    async init(_ctx: PluginInitContext) {
      client = createClient({
        url: config.url,
      });

      // Run migrations if provided
      if (config.migrations?.length) {
        await runMigrations(client, config.migrations);
      }

      return {
        client,
        execute: (sql: string, args?: InArgs) =>
          client.execute(args ? { sql, args } : sql),
        batch: (statements: InStatement[]) => client.batch(statements),

        async initDB(options: InitDBOptions): Promise<DBInstance> {
          const newClient = createClient({
            url: options.url,
          });

          // Track for cleanup on plugin destroy
          additionalClients.add(newClient);

          // Run migrations if provided
          if (options.migrations?.length) {
            await runMigrations(newClient, options.migrations);
          }

          return {
            client: newClient,
            execute: (sql: string, args?: InArgs) =>
              newClient.execute(args ? { sql, args } : sql),
            batch: (statements: InStatement[]) => newClient.batch(statements),
            close: () => {
              newClient.close();
              additionalClients.delete(newClient);
            },
          };
        },

        async destroyDB(url: string): Promise<void> {
          const filePath = getFilePathFromUrl(url);
          if (!filePath) {
            throw new Error(
              "destroyDB only works with file: URLs (e.g., 'file:local.db')"
            );
          }

          await unlink(filePath);
        },
      };
    },

    destroy() {
      client.close();
      // Close any additional clients that weren't explicitly closed
      for (const additionalClient of additionalClients) {
        additionalClient.close();
      }
      additionalClients.clear();
    },
  });
}

// Auto-register plugin types when this module is imported
declare module "@apisurf/ngn" {
  interface PluginRegistry {
    sqlite: SqlitePluginApi;
  }
}
