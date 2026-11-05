// The filter language `ngn runs` and the Runs page share:
//
//   task:extract status:failed since:24h        key:value tokens
//   -status:skipped                             a leading - excludes
//   sync                                        anything else matches task paths
//
// Several tokens with one key are alternatives (`status:failed status:stalled`
// is either); different keys must all hold. The keys and values are the
// glossary's. Parsing never throws: what it cannot read comes back as errors,
// so a filter bar can show them next to the tokens it did understand.

export type RunStatusWord = "succeeded" | "failed" | "skipped" | "running" | "stalled";
export type OriginWord = "scheduled" | "editor";

export type RunToken =
  | { key: "text"; value: string; negate: boolean }
  | { key: "task"; value: string; negate: boolean }
  | { key: "status"; value: RunStatusWord; negate: boolean }
  | { key: "origin"; value: OriginWord; negate: boolean }
  | { key: "since" | "until"; value: string; at: number; negate: false }
  | { key: "version"; value: string; version: number; negate: boolean };

export type RunTokenKey = RunToken["key"];

export const RUN_QUERY_KEYS = ["task", "status", "origin", "since", "until", "version"] as const;

export const RUN_STATUS_WORDS: readonly RunStatusWord[] = [
  "succeeded",
  "failed",
  "skipped",
  "running",
  "stalled",
];

export const ORIGIN_WORDS: readonly OriginWord[] = ["scheduled", "editor"];

/** Stored and everyday spellings that mean a glossary word. */
const STATUS_ALIASES: Record<string, RunStatusWord> = {
  success: "succeeded",
  succeeded: "succeeded",
  ok: "succeeded",
  failure: "failed",
  failed: "failed",
  fail: "failed",
  skipped: "skipped",
  skip: "skipped",
  running: "running",
  open: "running",
  pending: "running",
  stalled: "stalled",
};

const SPAN_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
};

export interface ParsedRunQuery {
  tokens: RunToken[];
  errors: string[];
}

/** Read a filter string. `now` anchors `since:24h` and friends. */
export function parseRunQuery(input: string, now: number): ParsedRunQuery {
  const tokens: RunToken[] = [];
  const errors: string[] = [];
  for (const word of splitWords(input)) {
    const parsed = parseWord(word, now);
    if (typeof parsed === "string") errors.push(parsed);
    else tokens.push(parsed);
  }
  return { tokens, errors };
}

/** Back to text, so a filter can be shown, kept in a URL, or copied to `ngn runs`. */
export function formatRunQuery(tokens: readonly RunToken[]): string {
  return tokens
    .map((token) => {
      const value = /\s/.test(token.value) ? `"${token.value}"` : token.value;
      const sign = token.negate ? "-" : "";
      return token.key === "text" ? `${sign}${value}` : `${sign}${token.key}:${value}`;
    })
    .join(" ");
}

/** Words split on spaces, with "double quotes" holding one together. */
function splitWords(input: string): string[] {
  return [...input.matchAll(/(-?[a-z]+:)?"([^"]*)"|\S+/gi)].map((m) =>
    m[2] !== undefined ? `${m[1] ?? ""}${m[2]}` : m[0],
  );
}

function parseWord(word: string, now: number): RunToken | string {
  const negate = word.startsWith("-") && word.length > 1;
  const body = negate ? word.slice(1) : word;
  const colon = body.indexOf(":");
  const key = colon > 0 ? body.slice(0, colon).toLowerCase() : null;
  if (key === null || !(RUN_QUERY_KEYS as readonly string[]).includes(key)) {
    if (key !== null && /^[a-z]+$/.test(key)) {
      return `unknown filter "${key}:" (filters: ${RUN_QUERY_KEYS.join(", ")})`;
    }
    return { key: "text", value: body, negate };
  }
  const value = body.slice(colon + 1);
  if (!value) return `"${key}:" needs a value`;
  return parseValue(key as (typeof RUN_QUERY_KEYS)[number], value, negate, now);
}

/** A known key's value as a token, or what is wrong with it. */
function parseValue(
  key: (typeof RUN_QUERY_KEYS)[number],
  value: string,
  negate: boolean,
  now: number,
): RunToken | string {
  switch (key) {
    case "task":
      return { key, value, negate };
    case "status": {
      const status = STATUS_ALIASES[value.toLowerCase()];
      return status
        ? { key, value: status, negate }
        : `unknown status "${value}" (statuses: ${RUN_STATUS_WORDS.join(", ")})`;
    }
    case "origin": {
      const origin = value.toLowerCase();
      return (ORIGIN_WORDS as readonly string[]).includes(origin)
        ? { key, value: origin as OriginWord, negate }
        : `unknown origin "${value}" (origins: ${ORIGIN_WORDS.join(", ")})`;
    }
    case "since":
    case "until":
      return parseTime(key, value, negate, now);
    case "version": {
      const version = Number(value.replace(/^v/i, ""));
      return Number.isInteger(version) && version > 0
        ? { key, value, version, negate }
        : `"version:${value}" is not a version number`;
    }
  }
}

function parseTime(
  key: "since" | "until",
  value: string,
  negate: boolean,
  now: number,
): RunToken | string {
  if (negate) {
    return `"-${key}:" does not exclude anything; use ${key === "since" ? "until" : "since"}:`;
  }
  const at = pointInTime(value, now);
  return at == null
    ? `"${key}:${value}" is not a time: use 30m, 24h, 7d, 2w or a date like 2026-10-27`
    : { key, value, at, negate: false };
}

/** `24h` back from now, or a date (local midnight) or date-time. */
function pointInTime(value: string, now: number): number | null {
  const span = /^(\d+(?:\.\d+)?)([mhdw])$/i.exec(value);
  if (span) return now - Number(span[1]) * SPAN_MS[span[2]!.toLowerCase()]!;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3])).getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** A run's status as a filter word: the stored status, or `stalled`. */
export function runStatusWord(status: string, stalled: boolean): RunStatusWord {
  if (stalled) return "stalled";
  return STATUS_ALIASES[status] ?? "running";
}
