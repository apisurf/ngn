/** How the read commands print a run and a task, in the words ngnui uses. */
import { circuitOpen, readSkip, runStateLabel, runStatusWord } from "@apisurf/ngn-schema/describe";
import type { RunRow, TaskRow } from "./store.js";

/** `Skipped · still running #2`, `Failed · try 2/3`, `Stalled`. */
export function runCell(run: RunRow, attempt?: { attempt: number; attempts: number }): string {
  const label = runStateLabel(run.status, run.stalled);
  if (run.status === "skipped") {
    const why = readSkip(run.skip_reason).short;
    return `${label} · ${why}${run.blocked_by != null ? ` #${run.blocked_by}` : ""}`;
  }
  return attempt && attempt.attempts > 1
    ? `${label} · try ${attempt.attempt}/${attempt.attempts}`
    : label;
}

/** A task's name in a list: its path, or what an editor run is. */
export function taskName(row: { path: string; editor: boolean }): string {
  return row.editor ? "editor run" : row.path;
}

export type Health = "healthy" | "failing" | "circuit open" | "stalled";

export function healthOf(task: TaskRow, stalledTaskIds: ReadonlySet<number>): Health {
  if (circuitOpen(task)) return "circuit open";
  if (task.last_outcome === "failure") return "failing";
  if (stalledTaskIds.has(task.id)) return "stalled";
  return "healthy";
}

/** A run as `--json` gives it: glossary words and field names, stored values beside them. */
export function runJson(run: RunRow) {
  return {
    id: run.id,
    task: run.path,
    origin: run.editor ? "editor" : "scheduled",
    status: runStatusWord(run.status, run.stalled),
    stored_status: run.status,
    version: run.version,
    created_at: run.created_at,
    started_at: run.started_at,
    ended_at: run.ended_at,
    duration_ms: run.duration_ms,
    retry_of: run.retry_of,
    skip:
      run.status === "skipped"
        ? {
            reason: run.skip_reason,
            cause: readSkip(run.skip_reason).cause,
            blocked_by: run.blocked_by,
          }
        : null,
  };
}
