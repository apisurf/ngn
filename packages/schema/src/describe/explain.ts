// Why a run is not simply a success, in a headline and a sentence or two: the
// run page's callout and the top of `ngn show`. The run page adds links and
// code formatting around the same words.

import { formatMs } from "./numbers.js";
import { readSkip, type SkipCause } from "./runs.js";
import { formatAgo, plural } from "./time.js";

export const SKIP_TITLES: Record<SkipCause, string> = {
  shouldSkip: "Skipped by shouldSkip",
  overlap: "Skipped — the previous run was still going",
  breaker: "Skipped — circuit open",
  lock: "Skipped — a lock was busy",
  other: "Skipped",
};

export interface ExplainedRun {
  status: string;
  stalled: boolean;
  skip_reason: string | null;
  blocked_by: number | null;
  attempt: number;
}

export interface RunContext {
  /** Every try of the run's tick, in order. */
  attempts: { id: number; status: string }[];
  /** The last error the task logged, for a failed run. */
  failure: string | null;
  /** Whether the task exports an onError hook. */
  hasOnError: boolean;
  stall: {
    started_at: number;
    window_ms: number;
    skipped_since: number;
    lease_expired: boolean;
  } | null;
  /** Locks the run holds, or left behind. */
  locks: string[];
}

export interface RunStory {
  tone: "bad" | "warn" | "info" | "neutral";
  title: string;
  detail: string;
}

/** The failed run's headline: a retried tick says how it went. */
export function failureTitle(
  run: { id: number; attempt: number },
  attempts: RunContext["attempts"],
) {
  const retried = attempts.some((a) => a.id > run.id);
  const recovered = attempts[attempts.length - 1]?.status === "success";
  if (retried)
    return `Try ${run.attempt} of ${attempts.length} failed — ${recovered ? "a retry succeeded" : "retried"}`;
  return attempts.length > 1 ? `Failed after ${attempts.length} tries` : "The task failed";
}

/** Null for a run that just succeeded: there is nothing to explain. */
export function explainRun(
  run: ExplainedRun & { id: number },
  context: RunContext,
  now: number,
): RunStory | null {
  if (run.status === "failure") {
    const recovered = context.attempts[context.attempts.length - 1]?.status === "success";
    return {
      tone: recovered && context.attempts.some((a) => a.id > run.id) ? "warn" : "bad",
      title: failureTitle(run, context.attempts),
      detail:
        context.failure ??
        `ngn records that a run failed, not what it threw.${
          context.hasOnError
            ? " This task's onError hook logged nothing for it."
            : " Log the error from an onError hook and it shows up here."
        }`,
    };
  }
  if (run.status === "skipped") {
    const skip = readSkip(run.skip_reason);
    return { tone: "neutral", title: SKIP_TITLES[skip.cause], detail: skipDetail(skip, run) };
  }
  if (run.status === "running" || run.status === "pending") return openStory(run, context, now);
  return null;
}

function skipDetail(skip: ReturnType<typeof readSkip>, run: ExplainedRun): string {
  switch (skip.cause) {
    case "shouldSkip":
      return "The task's shouldSkip returned true, so neither the task nor any other hook ran.";
    case "overlap":
      return `${
        run.blocked_by != null
          ? `Run #${run.blocked_by} was still going`
          : "The previous run was still going"
      } when this tick fired. Export overlap = "allow" to start one beside it instead.`;
    case "breaker":
      return "The task's last ticks failed in a row, so its retry.breaker is holding ticks back. The next one let through closes it again if it succeeds.";
    case "lock":
      return `Another run held ${skip.lock}, one of this task's exclusive locks. The next tick tries again.`;
    case "other":
      return run.skip_reason ?? "";
  }
}

function openStory(run: ExplainedRun, context: RunContext, now: number): RunStory {
  const { stall, locks } = context;
  if (stall?.lease_expired) {
    return {
      tone: "warn",
      title: "Stalled — its lock was let go",
      detail: `Its lock ${locks.join(", ")} stopped being renewed, which happens when the process running it exits. ngn will not record an end for it.`,
    };
  }
  if (stall) {
    const held = stall.skipped_since
      ? ` It has held back ${plural(stall.skipped_since, "tick")} since, each skipped as still running. Restarting ngn run lets the next tick through.`
      : "";
    return {
      tone: "warn",
      title: "Stalled — no end recorded",
      detail: `It started ${formatAgo(now, stall.started_at)} and should have finished within ${formatMs(stall.window_ms)}, the longer of its budget and its schedule. The process running it most likely stopped before it could record an end; ngn will not record one now.${held}`,
    };
  }
  return {
    tone: "info",
    title: "No end recorded yet",
    detail: `The run is ${run.status}${locks.length ? ` and holds ${locks.join(", ")}` : ""}, or the process running it stopped before it could record an end.`,
  };
}
