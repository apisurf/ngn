// When a run that never recorded an end has stopped being "Running" and become
// Stalled: going for longer than it could legitimately take, so the process
// running it most likely died. The rule is the glossary's:
//
//   window  = max(budget, the schedule's period: an interval's `every`, or a
//             cron pattern's steady gap), from the task's newest version
//             24 hours when neither can be read from it
//   stalled = no end recorded  and  now - started_at > window × 2
//
// A lock whose lease ran out marks its run Stalled straight away: the lease is
// renewed while the run's process lives, so an expired one means it is gone.

import { parseDuration } from "./numbers.js";
import { timingOf, timingPeriodMs } from "./schedule.js";
import { configOf } from "./tasks.js";

/** How many windows a run may take before it is called Stalled. */
export const STALL_FACTOR = 2;

/** The window when neither a budget nor the schedule's period can be read. */
export const UNKNOWN_WINDOW_MS = 24 * 3_600_000;

/** The most a run of this task could legitimately take, from its compiled code. */
export function runWindowMs(code: string | null | undefined): number {
  const budget = parseDuration(configOf(code).budget);
  const period = timingPeriodMs(timingOf(code));
  const known = [budget, period].filter((ms): ms is number => ms != null && ms > 0);
  return known.length ? Math.max(...known) : UNKNOWN_WINDOW_MS;
}

export interface OpenRun {
  status: string;
  started_at: number | null;
  created_at: number;
  ended_at: number | null;
}

/**
 * Whether a run is Stalled at `now`, given its task's window and whether a lock
 * it held has an expired lease.
 */
export function isStalled(
  run: OpenRun,
  now: number,
  windowMs: number,
  leaseExpired = false,
): boolean {
  if (run.ended_at != null) return false;
  if (run.status !== "running" && run.status !== "pending") return false;
  if (leaseExpired) return true;
  const started = run.started_at ?? run.created_at;
  return now - started > windowMs * STALL_FACTOR;
}
