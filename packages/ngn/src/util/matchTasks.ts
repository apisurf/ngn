/**
 * Which tasks a name on the command line means. A plain name resolves the way
 * ngnui resolves one (`matchTaskName` in the describe module: exact path, then
 * under tasks/, then a path suffix); a pattern with glob characters is a glob
 * and is matched the way it always was. Matching ignores case throughout.
 */
import { matchTaskName, stripExtension } from "@apisurf/ngn-schema/describe";
import outmatch from "outmatch";
import { DEFAULT_TASKS_DIR } from "../constants.js";
import type { RunStore, TaskRow } from "../read/store.js";

export interface TaskMatch {
  /** What was asked for. */
  pattern: string;
  /** Matching task paths, relative to the root, in the order they were found. */
  paths: string[];
  /** When nothing matched: the closest task paths, best first. */
  suggestions: string[];
}

const GLOB = /[*?[\]{}!]/;
const MAX_SUGGESTIONS = 3;

function isGlob(pattern: string): boolean {
  return GLOB.test(pattern);
}

export function matchTasks(
  candidates: readonly string[],
  rawPattern: string,
  tasksDir: string = DEFAULT_TASKS_DIR,
): TaskMatch {
  const pattern = rawPattern.trim().replace(/^\.\//, "");
  const paths = isGlob(pattern)
    ? candidates.filter(outmatch(pattern, { flags: "i" }))
    : matchTaskName(candidates, pattern, tasksDir);
  return {
    pattern: rawPattern,
    paths,
    suggestions: paths.length ? [] : closest(candidates, pattern),
  };
}

/** Task paths whose file name is a small edit away from what was typed. */
function closest(candidates: readonly string[], pattern: string): string[] {
  const wanted = stripExtension(basename(pattern).toLowerCase());
  if (!wanted || isGlob(wanted)) return [];
  const limit = Math.max(2, Math.floor(wanted.length / 3));
  return candidates
    .map((path) => ({
      path,
      distance: editDistance(wanted, stripExtension(basename(path).toLowerCase())),
    }))
    .filter((c) => c.distance <= limit)
    .toSorted((a, b) => a.distance - b.distance || a.path.localeCompare(b.path))
    .slice(0, MAX_SUGGESTIONS)
    .map((c) => c.path);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Levenshtein distance, one row at a time. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The message for a name that matched no task, with the nearest ones when there are any. */
export function describeNoMatch(match: TaskMatch): string {
  const lines = [`ngn: no task matched "${match.pattern}".`];
  if (match.suggestions.length) {
    lines.push("     Did you mean:", ...match.suggestions.map((path) => `       ${path}`));
  } else {
    lines.push(
      "     A name is tried as a path from the project root, then under tasks/, then as the",
      "     end of a path (scrape.ts, api/scrape). Only tasks covered by `match` in",
      "     ngn.config.ts are candidates.",
    );
  }
  return lines.join("\n");
}

/** The message for a name that fits more than one task where one is needed. */
export function describeAmbiguous(match: TaskMatch): string {
  return [
    `ngn: "${match.pattern}" matches ${match.paths.length} tasks; name one of them:`,
    ...match.paths.map((path) => `       ${path}`),
  ].join("\n");
}

/**
 * The one task `target` names among the project's tasks, or null after saying
 * why there is not exactly one.
 */
export async function findTask(store: RunStore, target: string): Promise<TaskRow | null> {
  const tasks = (await store.tasks()).filter((task) => !task.editor);
  const match = matchTasks(
    tasks.map((task) => task.path),
    target,
  );
  if (match.paths.length !== 1) {
    process.stderr.write(
      `${match.paths.length ? describeAmbiguous(match) : describeNoMatch(match)}\n`,
    );
    return null;
  }
  return tasks.find((t) => t.path === match.paths[0])!;
}
