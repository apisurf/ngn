import {
  Client,
  safeInitDbClient,
  initDbFileIfNotExists,
  isDbPath,
} from "op3-persistence";
import invariant from "tiny-invariant";

let db: Client;

export async function setupDbClient(dbPath: string) {
  invariant(isDbPath(dbPath), "Invalid db path");

  if (db) {
    return db;
  }

  // Initializes the database file if it does not exist and returns the client
  db = await safeInitDbClient(dbPath);

  return db;
}

export function getDbClient() {
  invariant(db, "DB client not initialized");

  return db;
}

export { initDbFileIfNotExists };
