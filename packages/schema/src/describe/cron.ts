// A cron pattern in words, and how far apart its ticks are.

const UNITS = ["second", "minute", "hour"] as const;

/**
 * The seconds, minutes and hours fields of a pattern that only constrains the
 * clock, and the first of them that is not a fixed 0 (-1 when all are), or null
 * for one scoped to days, months or weekdays. Five-field patterns are read as
 * minutes first, the way the scheduler reads them.
 */
function clockOf(pattern: string): { clock: string[]; lead: number } | null {
  const fields = pattern.trim().split(/\s+/);
  if (fields.length === 5) fields.unshift("0");
  if (fields.length !== 6 || fields.slice(3).some((f) => f !== "*")) return null;
  const clock = fields.slice(0, 3);
  return { clock, lead: clock.findIndex((f) => f !== "0") };
}

/**
 * A plain-words reading of the common cron shapes — `every 5 seconds`,
 * `every 15 minutes`, `hourly at :30` — or null when the pattern is anything
 * more particular, in which case the pattern itself is the clearest thing to
 * show. ngn's patterns have six fields, seconds first; five-field ones are read
 * as minutes first, the way the scheduler reads them.
 */
export function describeCron(pattern: string): string | null {
  // Anything scoped to days, months or weekdays is past what a phrase says well.
  const parsed = clockOf(pattern);
  if (!parsed) return null;
  const { clock, lead } = parsed;
  // The first field that is not a fixed 0 decides the cadence.
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

const CLOCK_UNIT_MS = [1000, 60_000, 3_600_000] as const;
const DAY_MS = 86_400_000;

/**
 * How far apart a schedule's ticks are, for the shapes that tick at a steady
 * rate: `every 5 minutes`, `hourly at :30`, `daily at 09:00`. Null for anything
 * scoped to days, months or weekdays, or otherwise uneven.
 */
export function cronPeriodMs(pattern: string): number | null {
  const parsed = clockOf(pattern);
  if (!parsed) return null;
  const { clock, lead } = parsed;
  if (lead < 0) return DAY_MS;
  const field = clock[lead]!;
  const finer = clock.slice(lead + 1);
  if (finer.every((f) => f === "*")) {
    const unit = CLOCK_UNIT_MS[lead]!;
    if (field === "*") return unit;
    const step = /^\*\/(\d+)$/.exec(field)?.[1];
    if (step) return Number(step) * unit;
    // A fixed value ticks once per next-coarser unit: `15 * * * * *` is once a minute.
    if (/^\d+$/.test(field)) return lead === 2 ? DAY_MS : CLOCK_UNIT_MS[lead + 1]!;
    return null;
  }
  // `0 30 9 * * *`: one fixed time a day.
  return clock.every((f) => /^\d+$/.test(f)) ? DAY_MS : null;
}
