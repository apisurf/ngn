/**
 * A length of time as tasks write it: milliseconds, or a string such as
 * `"500ms"`, `"30s"`, `"4m"`, `"2h"` or `"1d"`.
 */
export type Duration = number | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Milliseconds in `value`. Throws on anything that is not a non-negative duration. */
export function toMs(value: Duration | string, what = "duration"): number {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
  } else {
    const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\s*$/.exec(value);
    if (match) return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
  }

  throw new Error(
    `Invalid ${what} ${JSON.stringify(value)}: expected milliseconds or a string like "30s", "4m"`,
  );
}
