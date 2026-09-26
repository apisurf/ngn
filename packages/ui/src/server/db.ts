// Server-only access to the run database.
//
// One process, one file, one connection — opened lazily, read-only, and kept
// for the lifetime of the server. `ngn run` puts the file in WAL mode, so these
// reads never block a task that is writing, and each statement sees the latest
// committed state: a UI left open beside the scheduler keeps up.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

let cached: Db | null = null;

/** Absolute path of the database this server is showing. */
export function dbPath(): string {
  const raw = process.env.NGN_DB ?? "ngn.sqlite";
  return resolve(process.cwd(), raw.startsWith("file:") ? raw.slice(5) : raw);
}

/**
 * The open database, or null when the file does not exist yet.
 *
 * Null is a normal state, not an error: someone can start the UI before the
 * first `ngn run`. Pages render an empty state for it rather than a 500. A
 * missing file is re-checked on every call, so the first run after start-up is
 * picked up without a restart.
 *
 * The connection is opened `readonly` and additionally `query_only`, which is
 * what makes the SQL console safe to offer: a write fails in SQLite itself, not
 * in a check this module could get wrong. Migrations are never applied — a
 * viewer must not change the file it is showing.
 */
export function getDb(): Db | null {
  if (cached) return cached;
  const file = dbPath();
  if (!existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  db.pragma("temp_store = MEMORY");
  // `ngn run` writes on a 5 s busy timeout; a reader waiting on a checkpoint
  // should be as patient.
  db.pragma("busy_timeout = 5000");
  cached = db;
  return cached;
}

/** The tables ngn's first migration creates, and every query here reads. */
export const NGN_TABLES = [
  "file_tasks",
  "file_task_versions",
  "task_runs",
  "logs",
  "timings",
  "kvs",
] as const;

/**
 * What the queries here can be run against.
 *
 * ngn does not version its schema (`user_version` stays 0), so the check is
 * whether its tables are there. A file that is empty is `missing` — `ngn run`
 * creates the tables on first start. A file with other tables is `foreign`: the
 * likeliest one is a task's own `ctx.sqlite` database, opened by mistake.
 */
export type SchemaState = "missing" | "foreign" | "current";

export function schemaState(db: Db | null): { state: SchemaState; missing: string[] } {
  if (!db) return { state: "missing", missing: [...NGN_TABLES] };
  const present = new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name),
  );
  const missing = NGN_TABLES.filter((table) => !present.has(table));
  if (missing.length === 0) return { state: "current", missing };
  // Nothing at all, or nothing but SQLite's own bookkeeping: not created yet.
  const foreign = [...present].some((name) => !name.startsWith("sqlite_"));
  return { state: foreign ? "foreign" : "missing", missing };
}

/** The database's size on disk, WAL included — what the history costs. */
export function fileBytes(): number {
  const file = dbPath();
  let total = 0;
  for (const path of [file, `${file}-wal`]) {
    try {
      total += statSync(path).size;
    } catch {
      // No WAL between checkpoints; not an error.
    }
  }
  return total;
}
