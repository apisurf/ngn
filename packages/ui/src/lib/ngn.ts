// What the UI knows about ngn: how a run's status reads, what a log level is,
// which log lines ngn writes itself, where a task's schedule and hooks sit in
// its compiled code, and how a task path splits for display.
//
// Pure functions over the read shapes, so every pane derives the same answer.

export type Tone = "ok" | "info" | "warn" | "bad" | "neutral";

export type RunStatus = "pending" | "skipped" | "running" | "success" | "failure";

const RUN_TONE: Record<string, Tone> = {
  success: "ok",
  failure: "bad",
  running: "info",
  pending: "neutral",
  skipped: "neutral",
};

const RUN_LABEL: Record<string, string> = {
  success: "Succeeded",
  failure: "Failed",
  running: "Running",
  pending: "Pending",
  skipped: "Skipped",
};

export function runTone(status: string | null | undefined): Tone {
  return (status && RUN_TONE[status]) || "neutral";
}

export function runLabel(status: string | null | undefined): string {
  if (!status) return "Never ran";
  return RUN_LABEL[status] ?? status;
}

/** A run that has not reached an end state — its duration is still growing. */
export function isOpen(status: string): boolean {
  return status === "running" || status === "pending";
}

// -----------------------------------------------------------------------------
// Logs
// -----------------------------------------------------------------------------

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

export const LEVEL_TONE: Record<LogLevel, Tone> = { info: "info", warn: "warn", error: "bad" };

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

// -----------------------------------------------------------------------------
// Task paths
// -----------------------------------------------------------------------------

export interface TaskName {
  /** `tasks/api/` — the folder, dimmed in the UI. Empty at the project root. */
  dir: string;
  /** `health.ts`. */
  file: string;
  /** Code sent from the live editor rather than a file in the project. */
  live: boolean;
}

/**
 * `ngn run` executes live-editor code as a throwaway file at the project root,
 * named `live-task-<ms>-<random>.ts`, and records it like any other task.
 */
const LIVE_TASK = /^live-task-(\d+)-[a-z0-9]+\.(?:ts|js)$/;

export function describeTask(path: string): TaskName {
  const cut = path.lastIndexOf("/");
  const file = cut < 0 ? path : path.slice(cut + 1);
  const dir = cut < 0 ? "" : path.slice(0, cut + 1);
  return { dir, file, live: dir === "" && LIVE_TASK.test(file) };
}

// -----------------------------------------------------------------------------
// Compiled code
// -----------------------------------------------------------------------------

export const HOOKS = ["shouldSkip", "shouldRetry", "onSuccess", "onError", "onComplete"] as const;

/**
 * The cron pattern a task exports, read out of its compiled code.
 *
 * ngn keeps the schedule nowhere but the task file, and the database holds that
 * file as esbuild emitted it, where a string-literal export survives as
 * `var timing = "…"`. A computed schedule is not recoverable, and says so by
 * returning null.
 */
export function cronOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const match = /\b(?:var|let|const)\s+timing\s*=\s*(["'`])([^"'`\n]+)\1/.exec(code);
  return match?.[2]?.trim() ?? null;
}

/** Which optional hooks a task exports, from esbuild's export table. */
export function hooksOf(code: string | null | undefined): string[] {
  if (!code) return [];
  const exported = exportsOf(code);
  return HOOKS.filter((hook) => exported.includes(hook));
}

/** How a task asked to be scheduled, as far as its compiled code says. */
export interface TaskConfig {
  /** `"skip"` unless the task exports `overlap = "allow"`. */
  overlap: "skip" | "allow";
  /** The `budget` export as written: `"2m"`, `1500`. */
  budget: string | null;
  /** Lock names held for the whole run. */
  exclusive: string[];
  /** The `retry` export, or null when it retries nothing. */
  retry: {
    attempts: number;
    delay: string | null;
    breaker: { after: number; maxSkip: number } | null;
  } | null;
  /**
   * Exports that are present but not written as literals, so their value is
   * not in the code to read: shown as set rather than guessed at.
   */
  computed: string[];
}

/** ngn's default `breaker.maxSkip`. */
const DEFAULT_MAX_SKIP = 32;

/**
 * The scheduling exports — `overlap`, `budget`, `exclusive`, `retry` — read
 * out of the compiled code the way `cronOf` reads `timing`: esbuild keeps a
 * literal export as `var retry = { attempts: 3, … };`.
 */
export function configOf(code: string | null | undefined): TaskConfig {
  const config: TaskConfig = {
    overlap: "skip",
    budget: null,
    exclusive: [],
    retry: null,
    computed: [],
  };
  if (!code) return config;
  const exported = exportsOf(code);
  const read = (name: string): unknown => {
    if (!exported.includes(name)) return undefined;
    const value = literalOf(code, name);
    if (value === undefined) config.computed.push(name);
    return value;
  };

  if (read("overlap") === "allow") config.overlap = "allow";

  const budget = read("budget");
  if (typeof budget === "string" || typeof budget === "number") config.budget = String(budget);

  const exclusive = read("exclusive");
  if (typeof exclusive === "string") config.exclusive = [exclusive];
  else if (Array.isArray(exclusive)) config.exclusive = exclusive.map(String);

  config.retry = retryOf(read("retry"));
  return config;
}

/** A literal `retry` export, or null when it is absent or retries nothing. */
function retryOf(value: unknown): TaskConfig["retry"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { attempts, delay, breaker } = value as Record<string, unknown>;
  const b = breaker && typeof breaker === "object" ? (breaker as Record<string, unknown>) : null;
  const retry = {
    attempts: typeof attempts === "number" ? attempts : 1,
    delay: typeof delay === "string" || typeof delay === "number" ? String(delay) : null,
    breaker:
      b && typeof b.after === "number"
        ? { after: b.after, maxSkip: typeof b.maxSkip === "number" ? b.maxSkip : DEFAULT_MAX_SKIP }
        : null,
  };
  // `attempts: 1` with no breaker retries nothing, which is the same as no export.
  return retry.attempts <= 1 && !retry.breaker ? null : retry;
}

/** Every name in esbuild's export table. */
function exportsOf(code: string): string[] {
  const table = /__export\([^,]+,\s*\{([^}]*)\}\)/.exec(code)?.[1] ?? "";
  return [...table.matchAll(/(\w+)\s*:/g)].map((m) => m[1]!);
}

/**
 * The value of `var <name> = <literal>;`, when the literal is plain data: a
 * string, a number, or an object or array of those. Anything else — a call, an
 * identifier, a template with substitutions — is undefined.
 */
function literalOf(code: string, name: string): unknown {
  const start = new RegExp(`\\b(?:var|let|const)\\s+${name}\\s*=\\s*`).exec(code);
  if (!start) return undefined;
  const rest = code.slice(start.index + start[0].length);
  const end = literalEnd(rest);
  if (end < 0) return undefined;
  const json = rest
    .slice(0, end)
    .trim()
    // 'single' and `plain template` strings to "double".
    .replace(/'([^'\\\n]*)'|`([^`\\$\n]*)`/g, (_, a: string | undefined, b: string | undefined) =>
      JSON.stringify(a ?? b ?? ""),
    )
    // Bare keys to quoted ones, and the trailing commas esbuild leaves on multi-line literals.
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

/** Where the literal at the start of `text` ends: its closing bracket, or the `;` ending its line. */
function literalEnd(text: string): number {
  if (text[0] !== "{" && text[0] !== "[") return text.search(/;\s*(?:\n|$)/);
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{" || ch === "[") depth++;
    else if ((ch === "}" || ch === "]") && --depth === 0) return i + 1;
  }
  return -1;
}

// -----------------------------------------------------------------------------
// Why a run was skipped
// -----------------------------------------------------------------------------

export type SkipCause = "shouldSkip" | "overlap" | "breaker" | "lock" | "other";

export interface SkipReading {
  cause: SkipCause;
  /** A few words, for a table cell. */
  short: string;
  /** The lock that was held, for `lock`. */
  lock: string | null;
}

/** The `skip_reason`s ngn writes; anything else is shown as written. */
const OVERLAP_REASON = "previous run still in progress";
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

/**
 * The task's own code, without the module wrapper esbuild puts around it.
 *
 * The body sits between the `// <path>` comment esbuild writes above it and the
 * closing `return __toCommonJS(...)`, indented one level. Anything that does not
 * have that shape — another bundler, a future ngn — is returned whole.
 */
export function sourceOf(code: string): string {
  const lines = code.split("\n");
  const start = lines.findIndex((line) => /^\s*\/\/ \S+\.(?:[cm]?[jt]sx?)\s*$/.test(line));
  const end = lines.findLastIndex((line) => /^\s*return __toCommonJS\(/.test(line));
  if (start < 0 || end <= start) return code;
  const body = withoutExportTable(lines.slice(start + 1, end));
  const indents = body
    .filter((line) => line.trim())
    .map((line) => line.length - line.trimStart().length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return body
    .map((line) => line.slice(indent))
    .join("\n")
    .trim();
}

/**
 * Drop `var x_exports = {};` and the `__export(x_exports, { … });` block after
 * it: esbuild's bookkeeping, not the task.
 */
function withoutExportTable(lines: string[]): string[] {
  const open = lines.findIndex((line) => /^\s*__export\(\w+_exports, \{/.test(line));
  if (open < 0) return lines;
  const close = lines.findIndex((line, i) => i >= open && /^\s*\}\);\s*$/.test(line));
  if (close < 0) return lines;
  const from =
    open > 0 && /^\s*var \w+_exports = \{\};\s*$/.test(lines[open - 1] ?? "") ? open - 1 : open;
  return [...lines.slice(0, from), ...lines.slice(close + 1)];
}

// -----------------------------------------------------------------------------
// Numbers
// -----------------------------------------------------------------------------

/** The `p`th percentile (0–1) of an ascending list, nearest-rank. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? null;
}

/** A stable colour slot for a timing label, so `fetch` looks the same everywhere. */
export function seriesSlot(label: string, slots = 8): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return Math.abs(hash) % slots;
}

// -----------------------------------------------------------------------------
// Cron
// -----------------------------------------------------------------------------

const UNITS = ["second", "minute", "hour"] as const;

/**
 * A plain-words reading of the common cron shapes — `every 5 seconds`,
 * `every 15 minutes`, `hourly at :30` — or null when the pattern is anything
 * more particular, in which case the pattern itself is the clearest thing to
 * show. ngn's patterns have six fields, seconds first; five-field ones are read
 * as minutes first, the way the scheduler reads them.
 */
export function describeCron(pattern: string): string | null {
  const fields = pattern.trim().split(/\s+/);
  if (fields.length === 5) fields.unshift("0");
  // Anything scoped to days, months or weekdays is past what a phrase says well.
  if (fields.length !== 6 || fields.slice(3).some((f) => f !== "*")) return null;
  const clock = fields.slice(0, 3);
  // The first field that is not a fixed 0 decides the cadence.
  const lead = clock.findIndex((f) => f !== "0");
  if (lead < 0) return "daily at midnight";
  return clock.slice(lead + 1).every((f) => f === "*")
    ? cadence(lead, clock[lead]!)
    : dailyAt(clock);
}

/** The leading field is `*`, a step, or a fixed number; every coarser field is `*`. */
function cadence(lead: number, field: string): string | null {
  const unit = UNITS[lead]!;
  if (field === "*") return `every ${unit}`;
  const step = /^\*\/(\d+)$/.exec(field)?.[1];
  if (step) return step === "1" ? `every ${unit}` : `every ${step} ${unit}s`;
  if (!/^\d+$/.test(field)) return null;
  if (lead === 1) return `hourly at :${field.padStart(2, "0")}`;
  return lead === 2 ? `daily at ${field.padStart(2, "0")}:00` : null;
}

/** `0 30 9 * * *`: one fixed time a day. */
function dailyAt([sec, min, hour]: string[]): string | null {
  if (sec !== "0" || !isFixed(min) || !isFixed(hour)) return null;
  return `daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
}

function isFixed(field: string | undefined): field is string {
  return field !== undefined && /^\d+$/.test(field);
}
