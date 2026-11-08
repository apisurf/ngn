import { toMs, type Duration } from "./duration.js";
import { isCronPatternValid } from "./cron.js";

export type Edge = "leading" | "trailing";

/** The object form of the `timing` export: a period instead of a cron pattern. */
export interface IntervalTiming {
  /** How far apart runs are. At least 1s. */
  every: Duration;
  /**
   * `"leading"` (default): a fixed grid, `every` apart from the planned start
   * of the last run. `"trailing"`: `every` after the last run ended.
   */
  edge?: Edge;
  /** The shortest delay a run may choose. At least 1s; defaults to `every`. */
  min?: Duration;
  /** The longest delay anything may choose. Defaults to `every × 32`. */
  max?: Duration;
  /**
   * How failures slow the task down: `every × factor^failedInARow`, capped at
   * `max`, give or take `jitter` of it. `false` keeps failures on `every`.
   * Defaults to `{ factor: 2, jitter: 0.1 }`.
   */
  backoff?: TimingBackoff | false;
}

export interface TimingBackoff {
  /** What each failure in a row multiplies the delay by. At least 1. */
  factor?: number;
  /** How far the delay may stray either way, as a fraction of it, from 0 to 1. */
  jitter?: number;
}

/** What a task's `timing` export can be. */
export type TimingExport = string | IntervalTiming;

export type ResolvedTiming =
  | { kind: "cron"; pattern: string }
  | {
      kind: "interval";
      everyMs: number;
      edge: Edge;
      minMs: number;
      maxMs: number;
      backoff: Required<TimingBackoff> | null;
    };

const INTERVAL_KEYS = new Set(["every", "edge", "min", "max", "backoff"]);
const BACKOFF_KEYS = new Set(["factor", "jitter"]);
const MIN_EVERY_MS = 1_000;
/** `max` when a task does not set it: `every` times this. */
export const DEFAULT_MAX_FACTOR = 32;
export const DEFAULT_BACKOFF: Required<TimingBackoff> = { factor: 2, jitter: 0.1 };

type Fail = (what: string) => never;

/** `unknown key cadence`, `unknown backoff keys a, b`; null when every key is known. */
function unknownKeys(value: Record<string, unknown>, known: Set<string>, what = ""): string | null {
  const unknown = Object.keys(value).filter((key) => !known.has(key));
  if (!unknown.length) return null;
  return `unknown ${what}${unknown.length === 1 ? "key" : "keys"} ${unknown.join(", ")}`;
}

/**
 * The `timing` export, checked: a cron pattern, or `{ every, edge, min, max, backoff }`. Throws,
 * naming the task, on anything else, so a typo fails at schedule time.
 */
export function resolveTiming(value: unknown, taskPath: string): ResolvedTiming {
  if (value == null) throw new Error(`timing pattern is missing for ${taskPath}`);
  if (typeof value === "string") {
    if (!isCronPatternValid(value))
      throw new Error(`Invalid cron pattern: ${value} for ${taskPath}`);
    return { kind: "cron", pattern: value };
  }

  const fail = (what: string): never => {
    throw new Error(`Invalid timing for ${taskPath}: ${what}`);
  };
  if (typeof value !== "object" || Array.isArray(value)) {
    fail('expected a cron pattern or an object like { every: "5m" }');
  }
  const timing = value as Record<string, unknown>;
  const unknown = unknownKeys(timing, INTERVAL_KEYS);
  if (unknown) fail(unknown);
  if (timing.every == null) fail("every is required");

  const everyMs = toMs(timing.every as Duration, `timing.every for ${taskPath}`);
  if (everyMs < MIN_EVERY_MS) fail("every must be at least 1s");

  const { edge = "leading" } = timing;
  if (edge !== "leading" && edge !== "trailing") {
    fail(`edge must be "leading" or "trailing", got ${JSON.stringify(edge)}`);
  }

  return {
    kind: "interval",
    everyMs,
    edge: edge as Edge,
    ...resolveLimits(timing, everyMs, taskPath, fail),
    backoff: resolveBackoff(timing.backoff, fail),
  };
}

/** `min` and `max`, defaulted and checked: at least 1s, and `min ≤ every ≤ max`. */
function resolveLimits(
  timing: Record<string, unknown>,
  everyMs: number,
  taskPath: string,
  fail: Fail,
): { minMs: number; maxMs: number } {
  const limit = (key: "min" | "max", fallback: number) =>
    timing[key] == null ? fallback : toMs(timing[key] as Duration, `timing.${key} for ${taskPath}`);
  const minMs = limit("min", everyMs);
  const maxMs = limit("max", everyMs * DEFAULT_MAX_FACTOR);
  if (minMs < MIN_EVERY_MS) fail("min must be at least 1s");
  if (minMs > everyMs) fail("min must not be more than every");
  if (everyMs > maxMs) fail("every must not be more than max");
  return { minMs, maxMs };
}

function resolveBackoff(value: unknown, fail: Fail): Required<TimingBackoff> | null {
  if (value === false) return null;
  if (value == null || value === true) return DEFAULT_BACKOFF;
  if (typeof value !== "object" || Array.isArray(value)) {
    fail("backoff must be false or an object like { factor: 2, jitter: 0.1 }");
  }
  const backoff = value as Record<string, unknown>;
  const unknown = unknownKeys(backoff, BACKOFF_KEYS, "backoff ");
  if (unknown) fail(unknown);
  const { factor = DEFAULT_BACKOFF.factor, jitter = DEFAULT_BACKOFF.jitter } = backoff;
  if (typeof factor !== "number" || !Number.isFinite(factor) || factor < 1) {
    fail(`backoff.factor must be a number of at least 1, got ${JSON.stringify(factor)}`);
  }
  if (typeof jitter !== "number" || !(jitter >= 0 && jitter <= 1)) {
    fail(`backoff.jitter must be a number from 0 to 1, got ${JSON.stringify(jitter)}`);
  }
  return { factor: factor as number, jitter: jitter as number };
}

/**
 * The timing `--timing` takes on the command line: a duration (`5m`) is
 * `{ every }` on the leading edge, anything else a cron pattern. Null when it is
 * neither.
 */
export function timingFromFlag(flag: string): TimingExport | null {
  try {
    if (toMs(flag) >= MIN_EVERY_MS) return { every: flag as Duration };
  } catch {
    // Not a duration: try it as a pattern.
  }
  return isCronPatternValid(flag) ? flag : null;
}

/** What the `next` hook chose, checked: a delay in ms or one of the task's own, and why. */
export interface NextChoice {
  delay: number | "every" | "min" | "max";
  reason: string | null;
}

const NAMED_DELAYS = new Set(["every", "min", "max"]);

function nextDelay(value: unknown): NextChoice["delay"] | null {
  if (typeof value === "string" && NAMED_DELAYS.has(value)) return value as "every";
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    return toMs(value);
  } catch {
    return null;
  }
}

/**
 * What the `next` hook returned, checked. Undefined when it left the decision
 * to the default policy; throws on anything it may not return.
 */
export function parseNextDecision(value: unknown): NextChoice | undefined {
  if (value === undefined) return undefined;
  const delay = nextDelay(value);
  if (delay != null) return { delay, reason: null };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { in: wanted, reason, ...rest } = value as Record<string, unknown>;
    const inDelay = nextDelay(wanted);
    if (
      inDelay != null &&
      Object.keys(rest).length === 0 &&
      (reason == null || typeof reason === "string")
    ) {
      return { delay: inDelay, reason: (reason as string | undefined) || null };
    }
  }
  throw new Error(
    `next returned ${JSON.stringify(value) ?? String(value)}; expected undefined, a duration, "every", "min", "max" or { in, reason }`,
  );
}
