// When a run that never recorded an end has stopped being "Running" and become
// Stalled: going for longer than it could legitimately take, so the process
// running it most likely died. The rule is the glossary's:
//
//   window  = max(budget, the schedule's period), from the task's newest version
//             24 hours when neither can be read from it
//   stalled = no end recorded  and  now - started_at > window × 2
//
// A lock whose lease ran out marks its run Stalled straight away: the lease is
// renewed while the run's process lives, so an expired one means it is gone.

import { cronPeriodMs } from "./cron.js";
import { configOf, cronOf } from "./tasks.js";

/** How many windows a run may take before it is called Stalled. */
export const STALL_FACTOR = 2;

/** The window when neither a budget nor the schedule's period can be read. */
export const UNKNOWN_WINDOW_MS = 24 * 3_600_000;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** A duration as ngn takes one: milliseconds, or `"500ms"`, `"30s"`, `"4m"`, `"2h"`, `"1d"`. */
export function parseDuration(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * UNIT_MS[match[2] ?? "ms"]!;
}

/** The most a run of this task could legitimately take, from its compiled code. */
export function runWindowMs(code: string | null | undefined): number {
  const budget = parseDuration(configOf(code).budget);
  const cron = cronOf(code);
  const period = cron ? cronPeriodMs(cron) : null;
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
