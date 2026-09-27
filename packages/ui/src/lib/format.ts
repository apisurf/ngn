// Formatting, in one place, so a number reads the same in every pane.
//
// Dates are built from their parts rather than through `toLocaleString`: the
// page renders on the server and again when React hydrates, and the two sides
// can disagree about locale even on one machine. Month names and a 24-hour
// clock read the same on both.

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  // Sub-millisecond is a real answer for a local call; `0 ms` reads as unmeasured.
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

/** `3 runs`, `1 run`. */
export function plural(n: number, noun: string, many = `${noun}s`): string {
  return `${formatCount(n)} ${n === 1 ? noun : many}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `14:32:05`. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `14:32:05.123` — for timelines where the millisecond is the point. */
export function formatClockMs(ms: number): string {
  return `${formatClock(ms)}.${pad(new Date(ms).getMilliseconds(), 3)}`;
}

/** `2 Aug`, or `2 Aug 2025` once the year stops being obvious. */
export function formatDay(now: number, ms: number): string {
  const d = new Date(ms);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** `2 Aug, 14:32:05`. */
export function formatDateTime(now: number, ms: number): string {
  return `${formatDay(now, ms)}, ${formatClock(ms)}`;
}

/** The heading a row sits under in a chronological list. */
export function formatDayHeading(now: number, ms: number): string {
  const days = calendarDaysBetween(ms, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatDay(now, ms);
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

/** `4 min ago`; a date once "ago" stops being a useful answer. */
export function formatAgo(now: number, ms: number): string {
  const seconds = Math.max(0, now - ms) / 1000;
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)} s ago`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  const days = calendarDaysBetween(ms, now);
  if (days < 7) return `${days} d ago`;
  return formatDay(now, ms);
}

/** `+1.24 s` — where something sits relative to the start of its run. */
export function formatOffset(ms: number): string {
  return `+${formatMs(Math.max(0, ms))}`;
}

function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / 86_400_000);
}

/** `/Users/me/work/api/sync.ts` → `sync.ts`. */
export function basename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}
