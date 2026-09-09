/**
 * Turning the `dbPath` from ngn.config.ts into something to open or to print.
 *
 * The config accepts two shapes — `:memory:` and a `file:` URL — and the file
 * form may be relative to wherever the command was run. Every consumer wants
 * the same three answers out of that, and they are easy to get subtly
 * different: `ngn sql` opening one file while the readout names another is the
 * kind of bug that costs an afternoon.
 */
import { isAbsolute, resolve } from "node:path";

export interface DescribedDbPath {
  /** True for `:memory:` — nothing on disk, so nothing to browse or query. */
  isMemory: boolean;
  /** Absolute filesystem path, or null for an in-memory database. */
  absolute: string | null;
  /** What to open with `@libsql/client`. */
  url: string;
}

export function describeDbPath(dbPath: string, cwd: string = process.cwd()): DescribedDbPath {
  if (dbPath === ":memory:") {
    return { isMemory: true, absolute: null, url: ":memory:" };
  }

  const raw = dbPath.startsWith("file:") ? dbPath.slice(5) : dbPath;
  const absolute = isAbsolute(raw) ? raw : resolve(cwd, raw);

  return { isMemory: false, absolute, url: `file:${absolute}` };
}
