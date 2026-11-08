/**
 * When a task runs next, for each kind of timing. The scheduler's loop is the
 * same for all of them; only these answers differ.
 *
 * The leading edge and cron both run on slots: the leading edge's are `every`
 * apart from an anchor, a pattern's are wherever it matches. After a tick, the
 * next run is the first slot that fits: the slot after the tick's planned
 * time, or, when the run overran it, the first slot after it ended. Missed
 * slots are never made up with back-to-back runs.
 */
import {
  describeTiming,
  formatClock,
  formatDelay,
  formatMs,
  type ScheduleSource,
  type TimingValue,
} from "@apisurf/ngn-schema/describe";
import { nextCronSlot } from "./cron.js";
import type { TickStatus } from "./task.js";
import type { NextChoice, ResolvedTiming, TimingExport } from "./timing.js";

/** The slot strictly after `t`. */
type SlotAfter = (t: number) => number;

/** The slots of a grid `everyMs` apart that runs through `anchor`. */
export function gridSlotAfter(anchor: number, everyMs: number): SlotAfter {
  return (t) => anchor + (Math.floor((t - anchor) / everyMs) + 1) * everyMs;
}

/**
 * The first slot that fits after a tick planned at `plannedAt` that ended at
 * `endedAt`, and the slots it ran past on the way.
 */
export function firstFittingSlot(slotAfter: SlotAfter, plannedAt: number, endedAt: number) {
  const due = slotAfter(plannedAt);
  if (endedAt <= due) return { nextAt: due, due, missed: 0 };
  // A run that ends exactly on a slot may start that slot.
  const nextAt = slotAfter(endedAt - 1);
  let missed = 0;
  for (let slot = due; slot < nextAt && missed < 1_000; slot = slotAfter(slot)) missed++;
  return { nextAt, due, missed };
}

/** What the scheduler needs to know about a tick to decide the next run. */
export interface DecideInput {
  plannedAt: number;
  endedAt: number;
  anchor: number | null;
  status: TickStatus;
  /** Failed ticks in a row, this one included. */
  failedInARow: number;
  /** What the task's `next` hook chose, when it chose anything. */
  choice?: NextChoice | null;
}

/** What the scheduler knows about a schedule when it checks a stored next run still fits. */
export interface LatestInput {
  anchor: number | null;
  failedInARow: number;
  /** Who set the stored next run. */
  source: string | null;
}

export interface Decision {
  nextAt: number;
  reason: string;
  anchor: number | null;
  source: ScheduleSource;
}

/** The window a run gets: what `ctx.run` and the retry window are worked out from. */
export interface RunWindow {
  scheduledAt: number;
  nextAt: number | null;
  /** For the trailing edge: the run's deadline when it has no budget. */
  periodMs: number | null;
}

export interface TimingRule {
  /** The next run of a task that has never been scheduled, and its grid anchor. */
  first(now: number): { nextAt: number; anchor: number | null };
  window(plannedAt: number, anchor: number | null): RunWindow;
  decide(input: DecideInput): Decision;
  /**
   * The next run after slots were missed while ngn was not running: a single
   * catch-up run now, or (cron) the next slot.
   */
  overdue(now: number, anchor: number | null): { nextAt: number; catchUp: boolean };
  /**
   * The latest next run the current config could choose from `now`; null when
   * anything goes (a person chose it).
   */
  latest(now: number, input: LatestInput): number | null;
  /** How the schedule reads. */
  words: string;
}

/** A number from 0 (inclusive) to 1, as `Math.random` gives. Tests pass their own. */
export type Random = () => number;

type Interval = Extract<ResolvedTiming, { kind: "interval" }>;

export function timingRule(
  timing: ResolvedTiming,
  exported: TimingExport,
  random: Random = Math.random,
): TimingRule {
  const words = describeTiming(exported as TimingValue) ?? String(exported);
  if (timing.kind === "cron") return cronRule(timing.pattern, words);
  return timing.edge === "trailing"
    ? trailingRule(timing, words, random)
    : leadingRule(timing, words, random);
}

/** `a failure`, `3 failures in a row`. */
function failures(n: number): string {
  return n === 1 ? "a failure" : `${n} failures in a row`;
}

/**
 * The delay after `failedInARow` failures: `every × factor^n`, capped at
 * `max`, give or take `jitter` of it, and never outside `[min, max]`.
 */
export function backoffDelay(timing: Interval, failedInARow: number, random: Random): number {
  const { factor, jitter } = timing.backoff!;
  const base = Math.min(timing.maxMs, timing.everyMs * factor ** failedInARow);
  const jittered = Math.round(base * (1 + (random() * 2 - 1) * jitter));
  return Math.min(timing.maxMs, Math.max(timing.minMs, jittered));
}

/**
 * The default policy's answer for a failed tick, when the task backs off:
 * the delay from when it ended. Null when the tick did not fail, or the task
 * does not back off, so the next run is `every` as usual. On the leading edge
 * the run it leads to starts a new grid.
 */
function backoffDecision(
  timing: Interval,
  { status, endedAt, failedInARow }: DecideInput,
  random: Random,
): Decision | null {
  if (status !== "failure" || !timing.backoff) return null;
  const n = Math.max(1, failedInARow);
  const delay = backoffDelay(timing, n, random);
  const nextAt = endedAt + delay;
  return {
    nextAt,
    reason: `backing off after ${failures(n)}: ${formatDelay(delay)}`,
    anchor: timing.edge === "leading" ? nextAt : null,
    source: "policy",
  };
}

/**
 * What the `next` hook chose, as a decision: `every` is the schedule's own
 * next run (`onSchedule`); anything else a delay from when the tick ended,
 * kept within `[min, max]`, and on the leading edge the start of a new grid.
 * Null when the hook left it to the policy.
 */
function hookDecision(
  timing: Interval,
  { choice, endedAt }: DecideInput,
  onSchedule: () => Decision,
): Decision | null {
  if (!choice) return null;
  if (choice.delay === "every") {
    const scheduled = onSchedule();
    return {
      ...scheduled,
      reason: choice.reason ?? `next hook: ${scheduled.reason}`,
      source: "hook",
    };
  }
  const named = typeof choice.delay === "string" ? choice.delay : null;
  const wanted =
    named === "min" ? timing.minMs : named === "max" ? timing.maxMs : (choice.delay as number);
  const delay = Math.min(timing.maxMs, Math.max(timing.minMs, wanted));
  const clamped =
    delay === wanted
      ? ""
      : ` (${formatDelay(wanted)} kept to ${delay === timing.minMs ? "min" : "max"} ${formatDelay(delay)})`;
  const nextAt = endedAt + delay;
  return {
    nextAt,
    reason: `${choice.reason ?? `next hook: ${named ? `${named}, ` : ""}${formatDelay(delay)}`}${clamped}`,
    anchor: timing.edge === "leading" ? nextAt : null,
    source: "hook",
  };
}

/**
 * The latest next run an interval task could have stored: its slot (or
 * `every` on the trailing edge), the longest backoff its failure streak allows,
 * or anything up to `max` when it was not the policy that chose it.
 */
function intervalLatest(timing: Interval, now: number, slot: number, input: LatestInput) {
  if (input.source === "cli") return null;
  if (input.source != null && input.source !== "policy") return now + timing.maxMs;
  if (!timing.backoff || input.failedInARow === 0) return slot;
  const { factor, jitter } = timing.backoff;
  const longest = timing.everyMs * factor ** input.failedInARow * (1 + jitter);
  return Math.max(slot, now + Math.min(timing.maxMs, Math.ceil(longest)));
}

function trailingRule(timing: Interval, words: string, random: Random): TimingRule {
  const { everyMs } = timing;
  return {
    words,
    first: (now) => ({ nextAt: now, anchor: null }),
    window: (plannedAt) => ({ scheduledAt: plannedAt, nextAt: null, periodMs: everyMs }),
    decide(input) {
      const onSchedule = (): Decision => ({
        nextAt: input.endedAt + everyMs,
        reason: words,
        anchor: null,
        source: "policy",
      });
      return (
        hookDecision(timing, input, onSchedule) ??
        backoffDecision(timing, input, random) ??
        onSchedule()
      );
    },
    overdue: (now) => ({ nextAt: now, catchUp: true }),
    latest: (now, input) => intervalLatest(timing, now, now + everyMs, input),
  };
}

function leadingRule(timing: Interval, words: string, random: Random): TimingRule {
  const { everyMs } = timing;
  const slots = (anchor: number | null, fallback: number) =>
    gridSlotAfter(anchor ?? fallback, everyMs);
  return {
    words,
    first: (now) => ({ nextAt: now, anchor: now }),
    window: (plannedAt, anchor) => ({
      scheduledAt: plannedAt,
      nextAt: slots(anchor, plannedAt)(plannedAt),
      periodMs: null,
    }),
    decide(input) {
      const onSchedule = (): Decision => {
        const { plannedAt, endedAt, anchor } = input;
        const grid = anchor ?? plannedAt;
        const slot = firstFittingSlot(gridSlotAfter(grid, everyMs), plannedAt, endedAt);
        const reason = slot.missed
          ? `ran ${formatMs(endedAt - slot.due)} past its slot; next slot ${formatClock(slot.nextAt)}`
          : words;
        return { nextAt: slot.nextAt, reason, anchor: grid, source: "policy" };
      };
      return (
        hookDecision(timing, input, onSchedule) ??
        backoffDecision(timing, input, random) ??
        onSchedule()
      );
    },
    overdue: (now) => ({ nextAt: now, catchUp: true }),
    latest: (now, input) => intervalLatest(timing, now, slots(input.anchor, now)(now), input),
  };
}

function cronRule(pattern: string, words: string): TimingRule {
  const slotAfter: SlotAfter = (t) => nextCronSlot(pattern, t) ?? Number.MAX_SAFE_INTEGER;
  return {
    words,
    first: (now) => ({ nextAt: slotAfter(now), anchor: null }),
    window: (plannedAt) => ({
      scheduledAt: plannedAt,
      nextAt: slotAfter(plannedAt),
      periodMs: null,
    }),
    decide({ plannedAt, endedAt }) {
      const slot = firstFittingSlot(slotAfter, plannedAt, endedAt);
      const reason = slot.missed
        ? `ran past ${slot.missed} ${slot.missed === 1 ? "slot" : "slots"}; next ${formatClock(slot.nextAt)}`
        : words;
      return { nextAt: slot.nextAt, reason, anchor: null, source: "policy" };
    },
    overdue: (now) => ({ nextAt: slotAfter(now), catchUp: false }),
    latest: (now, { source }) => (source === "cli" ? null : slotAfter(now)),
  };
}
