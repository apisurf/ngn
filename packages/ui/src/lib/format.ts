// Formatting, in one place, so a number reads the same in every pane.
//
// Dates are built from their parts rather than through `toLocaleString`: the
// page renders on the server and again when React hydrates, and the two sides
// can disagree about locale even on one machine. Month names and a 24-hour
// clock read the same on both.
//
// Durations, times and counts are shared with the ngn CLI, so they come from
// the describe module; what is left here only the UI shows.

import { formatDayHeading, formatMs } from "@apisurf/ngn-schema/describe";

export {
  formatAgo,
  formatClock,
  formatClockMs,
  formatCount,
  formatDateTime,
  formatDay,
  formatDayHeading,
  formatMs,
  formatSpan,
  plural,
} from "@apisurf/ngn-schema/describe";

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Rows, newest first, split under the day heading each falls on. */
export function groupByDay<T>(
  rows: readonly T[],
  now: number,
  at: (row: T) => number,
): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const row of rows) {
    const day = formatDayHeading(now, at(row));
    const last = out[out.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else out.push({ day, rows: [row] });
  }
  return out;
}

/** `+1.24 s` — where something sits relative to the start of its run. */
export function formatOffset(ms: number): string {
  return `+${formatMs(Math.max(0, ms))}`;
}

/** `/Users/me/work/api/sync.ts` → `sync.ts`. */
export function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}
