// JSON as it crosses from the server: a log line, a stored value or a live
// task's result that happens to parse is shown as a tree instead of a string.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * The value `text` holds, when it is a JSON object or array.
 *
 * Scalars are left alone on purpose: `42` or `"ok"` as a log line reads better
 * as the text it is than as a one-node tree.
 */
export function parseStructured(text: string | null | undefined): JsonValue | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return undefined;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return undefined;
  }
}

/** Pretty-printed JSON, or the text unchanged when it is not JSON. */
export function prettyJson(text: string): string {
  const value = parseStructured(text);
  return value === undefined ? text : JSON.stringify(value, null, 2);
}
