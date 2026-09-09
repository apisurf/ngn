import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import {
  openDbClient,
  type Client,
  type InArgs,
  type InStatement,
  type ResultSet,
} from "@apisurf/ngn-persistence";

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
 * Options for opening an additional database next to the task file
 */
export interface InitDBOptions {
  /**
   * Database file, relative to the folder the task file lives in
   * (e.g. "cache.db" or "data/cache.db"). A leading "file:" is accepted.
   * Paths that reach outside the task folder are rejected.
   */
  file: string;
  /** Optional migrations to run */
  migrations?: Migration[];
}

/**
 * A database instance opened by initDB
 */
export interface DBInstance {
  /** Raw libsql client for advanced usage */
  client: Client;
  /** Absolute path of the database file */
  path: string;
  /** Execute a single SQL statement */
  execute: (sql: string, args?: InArgs) => Promise<ResultSet>;
  /** Execute multiple SQL statements in a batch */
  batch: (statements: InStatement[]) => Promise<ResultSet[]>;
  /** Close the database connection */
  close: () => void;
}

/**
 * SQLite API injected into every task as `ctx.sqlite`.
 *
 * Reads and writes are confined to the folder the task file lives in: the
 * default database sits next to the task, and `initDB` only opens paths that
 * resolve inside that folder. A task cannot reach a sibling folder's data by
 * walking up with "..", and cannot open a database by absolute path.
 */
export interface TaskSqlite {
  /** Raw libsql client for the task's own database */
  readonly client: Client;
  /** Absolute path of the task's own database file */
  readonly path: string;
  /** Execute a single SQL statement against the task's own database */
  execute: (sql: string, args?: InArgs) => Promise<ResultSet>;
  /** Execute multiple SQL statements against the task's own database */
  batch: (statements: InStatement[]) => Promise<ResultSet[]>;
  /** Open another database in the task's folder, with optional migrations */
  initDB: (options: InitDBOptions) => Promise<DBInstance>;
  /** Delete a database file in the task's folder */
  destroyDB: (file: string) => Promise<void>;
}

/**
 * Every database a task opened, keyed by absolute path.
 *
 * Task modules are re-evaluated on every run, so anything a task holds in
 * module scope is thrown away between ticks. Keeping the clients here instead
 * means a task that runs every five seconds reuses one connection per file
 * rather than opening a new one each time, and there is a single place for the
 * CLI to close them all on shutdown.
 */
const openClients = new Map<string, Client>();

/**
 * Run migrations on a database client
 */
async function runMigrations(client: Client, migrations: Migration[]): Promise<void> {
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
 * Resolve a task-supplied database file against the task's own folder, and
 * refuse anything that lands outside it.
 *
 * The check is on the resolved path rather than on the input string, so "..",
 * a "file:" prefix and nested segments all collapse to one comparison: the
 * result has to sit strictly below the task folder.
 */
function resolveTaskDbPath(taskDir: string, file: string): string {
  if (typeof file !== "string" || !file.trim()) {
    throw new Error("A database file name is required");
  }

  const relativePath = file.startsWith("file:") ? file.slice(5) : file;

  if (!relativePath) {
    throw new Error("A database file name is required");
  }

  if (isAbsolute(relativePath)) {
    throw new Error(
      `Database file must be relative to the task folder, got an absolute path: "${file}"`,
    );
  }

  const resolved = resolve(taskDir, relativePath);
  const taskDirRoot = taskDir.endsWith(sep) ? taskDir : `${taskDir}${sep}`;

  if (!resolved.startsWith(taskDirRoot)) {
    throw new Error(
      `Database file "${file}" resolves outside the task folder (${taskDir}). ` +
        `A task can only manage databases in its own folder.`,
    );
  }

  return resolved;
}

/**
 * Get (or open) the client for an absolute database path.
 */
function getClient(absolutePath: string): Client {
  const existing = openClients.get(absolutePath);

  if (existing) {
    return existing;
  }

  // libsql will not create missing directories, but a task is allowed to keep
  // databases in a subfolder of its own folder, so make the path first.
  mkdirSync(dirname(absolutePath), { recursive: true });

  // openDbClient puts the file in WAL and gives the connection a busy timeout.
  // Without it a task database stays in rollback-journal mode, where a single
  // reader anywhere (the UI, `ngn sql`, a second `ngn` process) locks the whole
  // file, and a zero busy timeout turns that into an immediate
  // "SQLITE_BUSY: database is locked" rather than a short wait.
  const client = openDbClient(`file:${absolutePath}`);
  openClients.set(absolutePath, client);

  return client;
}

function closeClient(absolutePath: string): void {
  const client = openClients.get(absolutePath);

  if (client) {
    client.close();
    openClients.delete(absolutePath);
  }
}

/**
 * Build the `ctx.sqlite` API for one task file.
 *
 * @param taskSourcePath - Absolute path of the task's source file
 */
export function createTaskSqlite(taskSourcePath: string): TaskSqlite {
  const taskDir = dirname(taskSourcePath);
  // tasks/scrape.ts keeps its data in tasks/scrape.db
  const defaultDbPath = join(taskDir, `${basename(taskSourcePath, extname(taskSourcePath))}.db`);

  // The file is only created once a task actually touches it, so tasks that
  // never use ctx.sqlite leave no database behind.
  const defaultClient = () => getClient(defaultDbPath);

  return {
    get client() {
      return defaultClient();
    },

    get path() {
      return defaultDbPath;
    },

    execute: (sql: string, args?: InArgs) => defaultClient().execute(args ? { sql, args } : sql),

    batch: (statements: InStatement[]) => defaultClient().batch(statements),

    async initDB(options: InitDBOptions): Promise<DBInstance> {
      const dbPath = resolveTaskDbPath(taskDir, options.file);
      const client = getClient(dbPath);

      if (options.migrations?.length) {
        await runMigrations(client, options.migrations);
      }

      return {
        client,
        path: dbPath,
        execute: (sql: string, args?: InArgs) => client.execute(args ? { sql, args } : sql),
        batch: (statements: InStatement[]) => client.batch(statements),
        close: () => closeClient(dbPath),
      };
    },

    async destroyDB(file: string): Promise<void> {
      const dbPath = resolveTaskDbPath(taskDir, file);

      // Drop the connection before unlinking so the handle does not outlive
      // the file it points at.
      closeClient(dbPath);

      await unlink(dbPath);
    },
  };
}

/**
 * Close every database opened by a task. Called by the CLI on shutdown.
 */
export function closeTaskDatabases(): void {
  for (const client of openClients.values()) {
    client.close();
  }

  openClients.clear();
}
