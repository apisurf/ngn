/**
 * Read-only access to the database this viewer was pointed at.
 *
 * One process, one file, one client — opened lazily and kept for the lifetime
 * of the server. No migrations ever run here: a viewer must not change the
 * shape of the file it is showing, so a database written by an older `ngn` is
 * displayed as-is rather than silently upgraded.
 */
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { type Client, type InValue, createClient } from "@libsql/client";

export const DEFAULT_DB_FILE = "ngn.sqlite";

let cached: Client | null = null;

/** Absolute path of the database this server is showing. */
export function dbPath(): string {
  const raw = process.env.NGN_UI_DB || DEFAULT_DB_FILE;
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw;

  return isAbsolute(stripped) ? stripped : resolve(process.cwd(), stripped);
}

/** Whether the file is there right now — re-checked, so it can appear later. */
export function dbExists(): boolean {
  return existsSync(dbPath());
}

/**
 * The open client, or null while the file does not exist.
 *
 * Null is a normal state, not a crash: starting the UI before the first
 * `ngn run` is a reasonable thing to do. Routes answer 503 for it and the page
 * shows an empty state until a run creates the file. Nothing is cached until
 * the file exists, so it gets picked up on the next request rather than
 * needing a restart.
 */
export function getDbClient(): Client | null {
  if (cached) return cached;
  if (!dbExists()) return null;

  cached = createClient({ url: `file:${dbPath()}` });

  return cached;
}

export function closeDbClient() {
  cached?.close();
  cached = null;
}

export const stripUndefinedArgs = (
  obj: Record<string, InValue | undefined>,
): Record<string, InValue> => {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }

  return obj as Record<string, InValue>;
};

export type { Client, InValue };
