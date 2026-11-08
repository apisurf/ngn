// The one-line answer to "is anything wrong?" — the Overview's headline and the
// first line of `ngn status`.

import { formatDay, plural } from "./time.js";

export interface VerdictInput {
  /** The project's tasks, editor runs left out. */
  tasks: number;
  /** Tasks whose latest run that reached a verdict failed. */
  failing: number;
  /** Stalled runs of the project's tasks. */
  stalled: { started_at: number; file: string; skipped_since: number }[];
  /** Locks left behind that no Stalled run already accounts for. */
  stale: number;
  /** Tasks a person paused: mentioned, never a problem. */
  paused?: number;
}

export interface Verdict {
  /** `ok` when nothing is wrong; `bad` for a failure; `warn` when the trouble is something that stopped. */
  tone: "ok" | "warn" | "bad";
  text: string;
}

export function verdict(input: VerdictInput, now: number): Verdict {
  const problems = [
    input.failing ? `${plural(input.failing, "task")} failing` : null,
    stalledPhrase(input.stalled, now),
    input.stale ? `${plural(input.stale, "lock")} left behind` : null,
  ].filter((p): p is string => p != null);
  const paused = input.paused ? ` · ${input.paused} paused` : "";
  if (problems.length === 0) {
    return {
      tone: "ok",
      text: input.tasks
        ? `All ${plural(input.tasks, "task")} healthy${paused}`
        : "Nothing scheduled yet",
    };
  }
  return { tone: input.failing ? "bad" : "warn", text: `${problems.join(" · ")}${paused}` };
}

/** `1 run stalled since 27 Oct · extract.ts skipping ticks`, or null when none is. */
function stalledPhrase(stalled: VerdictInput["stalled"], now: number): string | null {
  if (stalled.length === 0) return null;
  const oldest = Math.min(...stalled.map((run) => run.started_at));
  const blocking = [...new Set(stalled.filter((r) => r.skipped_since).map((r) => r.file))];
  return [
    `${plural(stalled.length, "run")} stalled since ${formatDay(now, oldest)}`,
    blocking.length ? `${blocking.join(", ")} skipping ticks` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
