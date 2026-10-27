import { toMs, type Duration } from "./duration.js";

/** The `retry` export. */
export interface RetryPolicy {
  /** Tries per tick, the first included. Default 1, which retries nothing. */
  attempts?: number;
  /** Pause before each retry. Default 0. */
  delay?: Duration;
  /**
   * After `after` ticks in a row that failed, skip ticks: one, then two, then
   * four, up to `maxSkip`, trying a single tick in between. One success closes
   * it again.
   */
  breaker?: { after: number; maxSkip?: number };
}

export interface ResolvedRetry {
  attempts: number;
  delayMs: number;
  breaker: { after: number; maxSkip: number } | null;
}

const DEFAULT_MAX_SKIP = 32;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

/** The `retry` export with its defaults filled in; throws, naming the task, on a bad value. */
export function resolveRetry(value: unknown, taskPath: string): ResolvedRetry {
  if (value == null) return { attempts: 1, delayMs: 0, breaker: null };
  const fail = (what: string): never => {
    throw new Error(`Invalid retry for ${taskPath}: ${what}`);
  };
  if (typeof value !== "object") fail('expected an object like { attempts: 3, delay: "30s" }');

  const { attempts = 1, delay = 0, breaker } = value as RetryPolicy;
  if (!isCount(attempts)) fail("attempts must be a whole number above 0");
  if (breaker != null) {
    if (!isCount(breaker.after)) fail("breaker.after must be a whole number above 0");
    if (breaker.maxSkip != null && !isCount(breaker.maxSkip)) {
      fail("breaker.maxSkip must be a whole number above 0");
    }
  }

  return {
    attempts,
    delayMs: toMs(delay, `retry delay for ${taskPath}`),
    breaker: breaker
      ? { after: breaker.after, maxSkip: breaker.maxSkip ?? DEFAULT_MAX_SKIP }
      : null,
  };
}

/**
 * Whether one more attempt fits: there is one left, and it would start before
 * the next tick (which will try again anyway).
 */
export function retryFits({
  attempt,
  retry,
  nextAt,
  now = Date.now(),
}: {
  attempt: number;
  retry: ResolvedRetry;
  nextAt: number | null;
  now?: number;
}): boolean {
  if (attempt >= retry.attempts) return false;
  return nextAt == null || now + retry.delayMs < nextAt;
}

/** The `skip_reason` of a tick the breaker skipped. */
export const BREAKER_SKIP_REASON = "circuit open after repeated failures";

/**
 * How many ticks the breaker wants skipped after `failedInARow` failed ticks:
 * none below `after`, then 1, 2, 4… up to `maxSkip`.
 */
export function breakerSkips(failedInARow: number, breaker: ResolvedRetry["breaker"]): number {
  if (!breaker || failedInARow < breaker.after) return 0;
  return Math.min(breaker.maxSkip, 2 ** (failedInARow - breaker.after));
}
