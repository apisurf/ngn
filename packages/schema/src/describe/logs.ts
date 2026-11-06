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
 * Where in a run something was thrown. The first five end the run as failed;
 * the hooks' own errors are recorded on the run without changing its outcome
 * (and `onError`'s never replaces the error that called it).
 *
 * - `load`: evaluating the task file, or reading its exports
 * - `start`: ngn's checks before the task (the breaker, `exclusive` locks)
 * - `shouldSkip`, `task`: the task's own code
 * - `record`: storing the task's result
 */
export type RunStage =
  | "load"
  | "start"
  | "shouldSkip"
  | "task"
  | "record"
  | "onSuccess"
  | "onError"
  | "onComplete";

const STAGES: ReadonlySet<string> = new Set<RunStage>([
  "load",
  "start",
  "shouldSkip",
  "task",
  "record",
  "onSuccess",
  "onError",
  "onComplete",
]);

/** The stages whose errors fail the run; a hook's error only gets recorded. */
export function isFatalStage(stage: RunStage): boolean {
  return stage !== "onSuccess" && stage !== "onError" && stage !== "onComplete";
}

/** ngn writes the error a run threw as an error line starting with this. */
export const FAILURE_PREFIX = "Failed in ";

/** Stack frames from here on are ngn's own or Node's, never the task's. */
const NGN_FRAME =
  /node:internal|@apisurf[\\/]ngn|[\\/]ngn-(core|os|persistence)[\\/]|[\\/]packages[\\/](core|ngn)[\\/](src|dist)[\\/]/;
const MAX_FRAMES = 8;

/** Errors from a VM context fail `instanceof Error`, but still look like one. */
function isErrorLike(value: unknown): value is Error {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Error).message === "string" &&
    typeof (value as Error).name === "string"
  );
}

/** `TypeError: Cannot read…`, whatever was thrown. */
export function errorSummary(error: unknown): string {
  if (isErrorLike(error)) {
    const name = error.name || "Error";
    return error.message ? `${name}: ${error.message}` : name;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * The error's stack frames down to where ngn called the task: the part that
 * says where in the task it happened. Lines keep their `    at ` indent.
 */
export function errorFrames(error: unknown): string[] {
  const stack = isErrorLike(error) ? error.stack : undefined;
  if (typeof stack !== "string") return [];
  const frames: string[] = [];
  for (const line of stack.split("\n")) {
    if (!/^\s+at /.test(line)) continue;
    if (NGN_FRAME.test(line) || frames.length === MAX_FRAMES) break;
    frames.push(line);
  }
  return frames;
}

/** `Caused by: …` for an error's `cause` chain, a few deep. */
function causeLines(error: unknown): string[] {
  const lines: string[] = [];
  let current: unknown = error;
  while (isErrorLike(current) && "cause" in current && lines.length < 3) {
    current = (current as Error & { cause?: unknown }).cause;
    lines.push(`Caused by: ${errorSummary(current)}`);
  }
  return lines;
}

/**
 * The log line ngn stores for what a run threw: the stage and the error on
 * the first line, then what caused it and where in the task it happened.
 *
 *   Failed in task: TypeError: Cannot convert undefined or null to object
 *       at task (evalmachine.<anonymous>:30:75)
 */
export function failureLine(stage: RunStage, error: unknown): string {
  return [
    `${FAILURE_PREFIX}${stage}: ${errorSummary(error)}`,
    ...causeLines(error),
    ...errorFrames(error),
  ].join("\n");
}

/** The stage and error of a line `failureLine` wrote; null for any other line. */
export function readFailureLine(value: string): { stage: RunStage; message: string } | null {
  if (!value.startsWith(FAILURE_PREFIX)) return null;
  const head = value.slice(FAILURE_PREFIX.length).split("\n", 1)[0]!;
  const colon = head.indexOf(": ");
  const stage = (colon === -1 ? head : head.slice(0, colon)) as RunStage;
  if (!STAGES.has(stage)) return null;
  return { stage, message: colon === -1 ? "" : head.slice(colon + 2) };
}

/**
 * What a failed run has to say for itself, in one line: the first line of
 * what ngn recorded it threw (`Failed in task: TypeError: …`). Runs recorded
 * before ngn did that fall back to the last error the task logged itself.
 */
export function failureMessage(logs: readonly { status: string; value: string }[]): string | null {
  for (const log of logs) {
    const failure = log.status === "error" ? readFailureLine(log.value) : null;
    if (failure && isFatalStage(failure.stage)) return log.value.split("\n", 1)[0]!;
  }
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i]!;
    if (log.status === "error" && !isLifecycle(log.value)) return log.value;
  }
  return null;
}
