import { isFile } from "op3-os";
import { type Client, type InValue, createClient } from "@libsql/client";
import invariant from "tiny-invariant";
import { migration } from "./migration.js";

export type DbPath = `file:${string}` | ":memory:";
export { Client, InValue };

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
  const dbClient = createClient({ url: normalizedDbPath });

  if (!dbFileExists) {
    await runMigrations(dbClient);
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
  const dbClient = createClient({ url: normalizedDbPath });

  // Enable Write-Ahead Logging for better performance
  dbClient.execute("PRAGMA journal_mode=WAL");

  return dbClient;
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
    dbClient = createClient({ url: sqliteUrl });
    await runMigrations(dbClient);
  } else {
    const normalizedDbPath = await initDbFileIfNotExists(sqliteUrl);
    dbClient = createClient({ url: normalizedDbPath });
  }

  // Enable Write-Ahead Logging for better performance
  dbClient.execute("PRAGMA journal_mode=WAL");

  return dbClient;
}

export function isDbPath(dbPath: string): dbPath is DbPath {
  if (!dbPath) return false;

  return dbPath === ":memory:" || dbPath.startsWith("file:");
}
