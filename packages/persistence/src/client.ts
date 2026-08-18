import { isFile } from "ngn-os";
import {
  type Client,
  type InArgs,
  type InStatement,
  type InValue,
  type ResultSet,
  createClient,
} from "@libsql/client";
import invariant from "tiny-invariant";
import { migration } from "./migration.js";

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
  { wal = true, busyTimeoutMs = BUSY_TIMEOUT_MS }: ConnectionPragmaOptions = {}
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
export function openDbClient(
  url: string,
  options?: ConnectionPragmaOptions
): Client {
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

async function runMigrations(dbClient: Client) {
  invariant(dbClient, "dbClient is not initialized");

  const migrationCommands = migration[0]
    .split(";")
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);

  return dbClient.batch(migrationCommands, "write");
}

export async function initDbFileIfNotExists(dbPath: DbPath) {
  invariant(dbPath, "dbPath is required");

  const normalizedDbPath = normalizeDbPath(dbPath);
  const dbFileExists = await checkDbFileExists(normalizedDbPath);
  const dbClient = openDbClient(normalizedDbPath);

  try {
    if (!dbFileExists) {
      await runMigrations(dbClient);
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
export async function strictInitDbClientFromFilePath(
  sqliteUrl: `file:${string}`
): Promise<Client> {
  invariant(sqliteUrl, "sqliteUrl is required");

  if (!isDbPath(sqliteUrl)) {
    throw new Error(
      "Invalid sqliteUrl. It must be a string starting with 'file:'"
    );
  }

  const normalizedDbPath = normalizeDbPath(sqliteUrl);
  const dbFileExists = await checkDbFileExists(normalizedDbPath);
  invariant(
    dbFileExists,
    `Database file does not exist at path: ${normalizedDbPath}`
  );
  return openDbClient(normalizedDbPath);
}

/**
 * Initialize a database client from a SQLite URL.
 * If the URL is ':memory:', it creates an in-memory database.
 * If the URL is a file path, it checks if the file exists and runs migrations if it does not to
 * ensure the DB file is there and ready to use.
 * @param sqliteUrl
 * @returns
 */
export async function safeInitDbClient(sqliteUrl: DbPath) {
  invariant(sqliteUrl, "sqliteUrl is required");
  invariant(
    sqliteUrl,
    "sqliteUrl must be a string starting with 'file:' or equal to ':memory:'"
  );

  let dbClient: Client;

  if (sqliteUrl === ":memory:") {
    // An in-memory database has no file to journal, so WAL does not apply.
    dbClient = openDbClient(sqliteUrl, { wal: false });
    await runMigrations(dbClient);
  } else {
    const normalizedDbPath = await initDbFileIfNotExists(sqliteUrl);
    dbClient = openDbClient(normalizedDbPath);
  }

  return dbClient;
}

export function isDbPath(dbPath: string): dbPath is DbPath {
  if (!dbPath) return false;

  return dbPath === ":memory:" || dbPath.startsWith("file:");
}
