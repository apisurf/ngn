import { isFile } from "@apisurf/ngn-os";
import {
  type Client,
  type InArgs,
  type InStatement,
  type InValue,
  type ResultSet,
  createClient,
} from "@libsql/client";
import invariant from "tiny-invariant";
import { migrations, type NgnMigration } from "./migration.js";

export type DbPath = `file:${string}` | ":memory:";
export { Client, InValue };
// Re-exported so everything that talks to SQLite goes through this package
// rather than depending on @libsql/client directly.
export { createClient };
export type { InArgs, InStatement, ResultSet };

/**
 * How long a connection waits for a lock it cannot take before giving up.
 *
 * SQLite's own default is 0 — the very first contended statement fails with
 * SQLITE_BUSY instead of retrying — which is what surfaces as
 * "SQLITE_BUSY: database is locked" the moment a second connection (another
 * `ngn` process, `ngn sql`, the UI, a database browser) touches the file.
 */
const BUSY_TIMEOUT_MS = 5000;

export interface ConnectionPragmaOptions {
  /**
   * Switch the file to WAL and relax the commit fsync.
   *
   * WAL is a property of the file rather than of the connection, so a reader
   * that must not modify what it is showing should pass `false`.
   */
  wal?: boolean;
  /** Lock wait, in milliseconds. */
  busyTimeoutMs?: number;
}

/**
 * The pragmas every connection this package hands out is expected to carry.
 *
 * The statements are issued back to back without awaiting in between: the
 * local driver runs each one synchronously, so they are all on the handle
 * before a caller's first query can be, whether or not the caller awaits the
 * returned promise.
 */
export function applyConnectionPragmas(
  client: Client,
  { wal = true, busyTimeoutMs = BUSY_TIMEOUT_MS }: ConnectionPragmaOptions = {},
) {
  const pragmas = [`PRAGMA busy_timeout = ${busyTimeoutMs}`];

  if (wal) {
    // Write-Ahead Logging: readers no longer block the writer, so a query from
    // the UI or a `ngn sql` session cannot stall a task mid-write.
    pragmas.push("PRAGMA journal_mode = WAL");
    // The WAL counterpart to WAL mode: fsync at checkpoints rather than at
    // every commit. A crash can cost the most recent transactions; it cannot
    // corrupt the file.
    pragmas.push("PRAGMA synchronous = NORMAL");
  }

  return Promise.all(pragmas.map((pragma) => client.execute(pragma)));
}

/**
 * Open a connection with those pragmas already applied.
 *
 * Everything in ngn that opens a SQLite file should come through here, so
 * there is one place that decides how a connection behaves under contention.
 */
export function openDbClient(url: string, options?: ConnectionPragmaOptions): Client {
  const client = createClient({ url });

  applyConnectionPragmas(client, options);

  return client;
}

async function checkDbFileExists(dbPath: string) {
  if (dbPath === ":memory:") return true;

  let filePath = dbPath.startsWith("file:") ? dbPath.slice(5) : dbPath;

  try {
    return isFile(filePath);
  } catch {
    return false;
  }
}

function normalizeDbPath(dbPath: DbPath): DbPath {
  const normalizedFilePath = (
    dbPath.startsWith("file:") ? dbPath : `file:${dbPath}`
  ) satisfies DbPath;

  return normalizedFilePath;
}

/** Where ngn records which of its own migrations a file has had. */
const MIGRATIONS_TABLE = "ngn_migrations";

function splitStatements(sql: string) {
  return sql
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

async function tableExists(dbClient: Client, name: string) {
  const { rows } = await dbClient.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });

  return rows.length > 0;
}

/**
 * Ids already applied to this file.
 *
 * A file from before migrations were tracked has ngn's tables but no tracking
 * table; it was created with the initial schema, so that one counts as applied.
 */
async function appliedMigrationIds(dbClient: Client): Promise<Set<string>> {
  if (await tableExists(dbClient, MIGRATIONS_TABLE)) {
    const { rows } = await dbClient.execute(`SELECT id FROM ${MIGRATIONS_TABLE}`);
    return new Set(rows.map((row) => row.id as string));
  }

  return new Set((await tableExists(dbClient, "file_tasks")) ? [migrations[0].id] : []);
}

function migrationStatements(pending: NgnMigration[], applied: Set<string>): InStatement[] {
  const statements: InStatement[] = [
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT(unixepoch('subsecond') * 1000)
    )`,
  ];

  // Record what a legacy file already has, so the next open reads it from the table.
  for (const id of applied) {
    statements.push({
      sql: `INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (id) VALUES (?)`,
      args: [id],
    });
  }

  for (const migration of pending) {
    statements.push(...splitStatements(migration.up));
    statements.push({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES (?)`,
      args: [migration.id],
    });
  }

  return statements;
}

/**
 * Bring a file up to ngn's current schema. Returns the ids it applied.
 *
 * Everything pending goes in one write batch, so a file is never left halfway
 * through a migration. If another process migrated the file between our read
 * and our write, the batch fails on a table that already exists; reading again
 * then finds nothing pending, and that is not an error.
 */
export async function migrate(dbClient: Client): Promise<string[]> {
  invariant(dbClient, "dbClient is not initialized");

  for (let attempt = 0; ; attempt++) {
    const applied = await appliedMigrationIds(dbClient);
    const pending = migrations.filter((migration) => !applied.has(migration.id));

    if (pending.length === 0 && (await tableExists(dbClient, MIGRATIONS_TABLE))) return [];

    try {
      await dbClient.batch(migrationStatements(pending, applied), "write");
      return pending.map((migration) => migration.id);
    } catch (error) {
      if (attempt > 0) throw error;
    }
  }
}

export async function initDbFileIfNotExists(dbPath: DbPath) {
  invariant(dbPath, "dbPath is required");

  const normalizedDbPath = normalizeDbPath(dbPath);
  const dbFileExists = await checkDbFileExists(normalizedDbPath);
  const dbClient = openDbClient(normalizedDbPath);

  try {
    if (!dbFileExists) {
      await migrate(dbClient);
    }
  } finally {
    // This connection exists only to create the file; callers get their own.
    // Leaving it open would leave a second handle on every database ngn opens.
    dbClient.close();
  }

  return normalizedDbPath;
}

/**
 * Connect to DB from a file path or throw an error if the file does not exist.
 * @param sqliteUrl SQLite database file path, must start with 'file:'
 * @returns DB Client
 */
export async function strictInitDbClientFromFilePath(sqliteUrl: `file:${string}`): Promise<Client> {
  invariant(sqliteUrl, "sqliteUrl is required");

  if (!isDbPath(sqliteUrl)) {
    throw new Error("Invalid sqliteUrl. It must be a string starting with 'file:'");
  }

  const normalizedDbPath = normalizeDbPath(sqliteUrl);
  const dbFileExists = await checkDbFileExists(normalizedDbPath);
  invariant(dbFileExists, `Database file does not exist at path: ${normalizedDbPath}`);
  return openDbClient(normalizedDbPath);
}

/**
 * Initialize a database client from a SQLite URL.
 * If the URL is ':memory:', it creates an in-memory database.
 * If the URL is a file path, the file is created when missing. Either way the
 * database is migrated to ngn's current schema before it is returned.
 * @param sqliteUrl
 * @returns
 */
export async function safeInitDbClient(sqliteUrl: DbPath) {
  invariant(sqliteUrl, "sqliteUrl is required");
  invariant(sqliteUrl, "sqliteUrl must be a string starting with 'file:' or equal to ':memory:'");

  let dbClient: Client;

  if (sqliteUrl === ":memory:") {
    // An in-memory database has no file to journal, so WAL does not apply.
    dbClient = openDbClient(sqliteUrl, { wal: false });
  } else {
    const normalizedDbPath = await initDbFileIfNotExists(sqliteUrl);
    dbClient = openDbClient(normalizedDbPath);
  }

  // A file made by an older ngn has the tables but not what came after them.
  await migrate(dbClient);

  return dbClient;
}

export function isDbPath(dbPath: string): dbPath is DbPath {
  if (!dbPath) return false;

  return dbPath === ":memory:" || dbPath.startsWith("file:");
}
