// A task's description: the Markdown file beside it.
//
// `tasks/api/sync-users.ts` is described by `tasks/api/sync-users.md`, if
// there is one, read from the project as it is now. The project is the folder
// ngnui was started in (NGN_ROOT, set by the launcher), else the database's
// folder, which is where `ngn init` puts it.
//
// Node-only.

import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { dbPath } from "./db";

/** Past this a file is not a description, and is not read into a page. */
const MAX_BYTES = 512 * 1024;

export function projectRoot(): string {
  const root = process.env.NGN_ROOT?.trim();
  return root && isAbsolute(root) ? root : dirname(dbPath());
}

/** `tasks/sync.ts` → `tasks/sync.md`. */
export function descriptionPath(taskPath: string): string {
  const { dir, name } = parse(taskPath);
  return dir ? join(dir, `${name}.md`) : `${name}.md`;
}

/**
 * The description of the task at `taskPath` (relative to `root`), or null when
 * there is none. A path that would leave the project is never read: task paths
 * come from the database, which is not this server's to trust.
 */
export function readDescription(root: string, taskPath: string): string | null {
  const file = resolve(root, descriptionPath(taskPath));
  const inside = relative(root, file);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
