// How a run reads: its status in words, whether it is still going, and why a
// skipped one was skipped. The words are shared by ngnui and the ngn CLI, so
// both say the same thing about a run.

export type RunStatus = "pending" | "skipped" | "running" | "success" | "failure";

const RUN_LABEL: Record<string, string> = {
  success: "Succeeded",
  failure: "Failed",
  running: "Running",
  pending: "Running",
  skipped: "Skipped",
};

export function runLabel(status: string | null | undefined): string {
  if (!status) return "Never ran";
  return RUN_LABEL[status] ?? status;
}

/** The word a run's state reads as, Stalled included. */
export function runStateLabel(status: string | null | undefined, stalled: boolean): string {
  return stalled ? "Stalled" : runLabel(status);
}

/** A run that has not reached an end state — its duration is still growing. */
export function isOpen(status: string): boolean {
  return status === "running" || status === "pending";
}

export type SkipCause = "shouldSkip" | "overlap" | "breaker" | "lock" | "other";

export interface SkipReading {
  cause: SkipCause;
  /** A few words, for a table cell. */
  short: string;
  /** The lock that was held, for `lock`. */
  lock: string | null;
}

/** The `skip_reason`s ngn writes; anything else is shown as written. */
export const OVERLAP_REASON = "previous run still in progress";
const BREAKER_REASON = "circuit open after repeated failures";
const LOCK_REASON = /^lock "(.*)" is held$/;

/**
 * What a skipped run's `skip_reason` means. A null reason is the task's own
 * `shouldSkip` — ngn only records a reason for the skips it decides on.
 */
export function readSkip(reason: string | null | undefined): SkipReading {
  if (!reason) return { cause: "shouldSkip", short: "shouldSkip", lock: null };
  if (reason === OVERLAP_REASON) return { cause: "overlap", short: "still running", lock: null };
  if (reason === BREAKER_REASON) return { cause: "breaker", short: "circuit open", lock: null };
  const lock = LOCK_REASON.exec(reason)?.[1];
  if (lock !== undefined) return { cause: "lock", short: `lock ${lock}`, lock };
  return { cause: "other", short: reason, lock: null };
}

/** The breaker is holding the task back: its latest run was a breaker skip. */
export function circuitOpen(task: { last_status: string | null; last_skip_reason: string | null }) {
  return task.last_status === "skipped" && readSkip(task.last_skip_reason).cause === "breaker";
}
