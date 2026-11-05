// Log lines: what level a stored line is, and which lines ngn writes itself
// around every run as opposed to what a task logged.

export type LogLevel = "info" | "warn" | "error";

/**
 * The level a log row was written at.
 *
 * ngn's schema names the middle level `warn`; `ctx.log.warning()` writes
 * `warning`. Both mean the same thing here, and anything unexpected reads as
 * info rather than disappearing from a level filter.
 */
export function logLevel(status: string): LogLevel {
  if (status === "error") return "error";
  if (status === "warn" || status === "warning") return "warn";
  return "info";
}

/**
 * The lines ngn writes around every run, as opposed to what a task logged.
 * Shown dimmed, and hidden where only a task's own output is wanted.
 */
export const LIFECYCLE_MESSAGES: readonly string[] = [
  "Task started",
  "Task succeeded",
  "Task failed",
  "Task skipped",
  "Task not found",
];

/** ngn follows `Task skipped` with `Skipped: <reason>` when it decided the skip. */
export const LIFECYCLE_PREFIX = "Skipped: ";

export function isLifecycle(value: string): boolean {
  return LIFECYCLE_MESSAGES.includes(value) || value.startsWith(LIFECYCLE_PREFIX);
}

/**
 * What a failed run has to say for itself: the last error the task logged.
 * ngn records that a run failed, not what it threw, so this is all there is.
 */
export function failureMessage(logs: readonly { status: string; value: string }[]): string | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i]!;
    if (log.status === "error" && !isLifecycle(log.value)) return log.value;
  }
  return null;
}
