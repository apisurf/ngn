// Times and counts as they read: `14:32:05`, `2 Aug`, `4 min ago`, `3 runs`.
//
// Built from a date's parts rather than through \`toLocaleString\`: ngnui renders
// on the server and again in the browser, and the two can disagree about locale
// even on one machine; the CLI prints the same words. Month names and a 24-hour
// clock read the same everywhere.

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

function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / 86_400_000);
}
