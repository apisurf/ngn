// Numbers as they read: percentiles over durations, and durations at a scale a
// person reads without arithmetic.

/** The `p`th percentile (0–1) of an ascending list, nearest-rank. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? null;
}

/**
 * How long something took, at the scale it happened on: `0.42 ms`, `318 ms`,
 * `4.21 s`, `4m 50s`, `3h 12m`, `8d 14h`. A zero second part is left off:
 * `5m`, `2h`, `1d`. Null reads as a dash.
 */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  // Sub-millisecond is a real answer for a local call; `0 ms` reads as unmeasured.
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 3600) return pair(Math.floor(seconds / 60), "m", seconds % 60, "s");
  const minutes = Math.round(ms / 60_000);
  if (minutes < 24 * 60) return pair(Math.floor(minutes / 60), "h", minutes % 60, "m");
  const hours = Math.round(ms / 3_600_000);
  return pair(Math.floor(hours / 24), "d", hours % 24, "h");
}

/**
 * `30s`, `10m 19s`, `2h`: a delay until a next run, to the second. Unlike
 * `formatMs`, which measures how long something took, it has no use for
 * hundredths.
 */
export function formatDelay(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)}s` : formatMs(ms);
}

function pair(big: number, bigUnit: string, small: number, smallUnit: string): string {
  return small ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`;
}

/** `12 s`, `12 min`, `3 h`, `9 d` — how long something has been going on, roughly. */
export function formatSpan(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 48 * 3600) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} d`;
}

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** A duration as ngn takes one: milliseconds, or `"500ms"`, `"30s"`, `"4m"`, `"2h"`, `"1d"`. */
export function parseDuration(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * UNIT_MS[match[2] ?? "ms"]!;
}
