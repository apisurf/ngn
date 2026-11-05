// A task as the database holds it: its path split for display, and what its
// compiled code says about how it runs — schedule, hooks, retry, budget,
// overlap and locks. ngn keeps none of that anywhere but the task file, so it
// is read back out of the code esbuild emitted.

export interface TaskName {
  /** `tasks/api/` — the folder, dimmed in the UI. Empty at the project root. */
  dir: string;
  /** `health.ts`. */
  file: string;
  /**
   * Code sent from the Editor rather than a file in the project. Its runs are
   * editor runs: never listed as a task of the project.
   */
  editor: boolean;
}

/**
 * `ngn run` executes Editor code as a throwaway file at the project root,
 * named `live-task-<ms>-<random>.ts`, and records it like any other task.
 */
const EDITOR_TASK = /^live-task-(\d+)-[a-z0-9]+\.(?:ts|js)$/;

export function describeTask(path: string): TaskName {
  const cut = path.lastIndexOf("/");
  const file = cut < 0 ? path : path.slice(cut + 1);
  const dir = cut < 0 ? "" : path.slice(0, cut + 1);
  return { dir, file, editor: dir === "" && EDITOR_TASK.test(file) };
}

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
