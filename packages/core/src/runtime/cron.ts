/**
 * The one place ngn uses croner: to check a pattern and to work out its next
 * date. Croner runs no timers for ngn; the scheduler waits on its own clock.
 * Swapping croner out means changing this file.
 */
import { Cron } from "croner";

/**
 * Five fields (minutes first) or six (seconds first), which is what ngn has
 * always accepted. Years are not. Day-of-month and day-of-week match either,
 * croner's default.
 */
const CRON_OPTIONS = { mode: "5-or-6-parts", paused: true } as const;

/** Parsed patterns, so working out the next slot does not parse one again each time. */
const parsed = new Map<string, Cron>();

function cronOf(pattern: string): Cron {
  let cron = parsed.get(pattern);
  if (!cron) {
    cron = new Cron(pattern, CRON_OPTIONS);
    parsed.set(pattern, cron);
  }
  return cron;
}

export function isCronPatternValid(pattern: string): boolean {
  try {
    cronOf(pattern);
    return true;
  } catch {
    return false;
  }
}

/** The first time `pattern` matches strictly after `after`, epoch ms, in local time. */
export function nextCronSlot(pattern: string, after: number): number | null {
  return cronOf(pattern).nextRun(new Date(after))?.getTime() ?? null;
}
