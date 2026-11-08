// A task's schedule: the `timing` it exports, in words, and the state machine
// ngn keeps for it in `schedules` and `schedule_events`. The table below is the
// whole machine: the scheduler refuses any write it does not allow, and the CLI
// and ngnui read the log in these words.

import { describeCron, cronPeriodMs } from "./cron.js";
import { cronOf, literalOf } from "./tasks.js";
import { formatClock } from "./time.js";
import { formatDelay, formatMs, parseDuration } from "./numbers.js";

export type ScheduleState = "waiting" | "blocked" | "running" | "paused";

export type ScheduleEventName =
  | "scheduled"
  | "started"
  | "decided"
  | "ended"
  | "overdue"
  | "reclamped"
  | "interrupted"
  | "blocked"
  | "superseded"
  | "recovered"
  | "lease_lost"
  | "paused"
  | "pause_requested"
  | "resumed"
  | "rescheduled"
  | "override_requested";

/** Where an event may come from (null: no row yet), and the state it leaves. */
export const SCHEDULE_TRANSITIONS: Record<
  ScheduleEventName,
  { from: readonly (ScheduleState | null)[]; to: ScheduleState }
> = {
  scheduled: { from: [null], to: "waiting" },
  // From `paused` only for a manual run (`--once`), after which the task pauses again.
  started: { from: ["waiting", "blocked", "paused"], to: "running" },
  decided: { from: ["running"], to: "waiting" },
  ended: { from: ["running"], to: "waiting" },
  overdue: { from: ["waiting"], to: "waiting" },
  reclamped: { from: ["waiting"], to: "waiting" },
  interrupted: { from: ["running"], to: "waiting" },
  blocked: { from: ["waiting"], to: "blocked" },
  superseded: { from: ["blocked"], to: "waiting" },
  recovered: { from: ["running"], to: "waiting" },
  lease_lost: { from: ["running"], to: "running" },
  paused: { from: ["waiting", "blocked"], to: "paused" },
  pause_requested: { from: ["running"], to: "running" },
  resumed: { from: ["paused"], to: "waiting" },
  rescheduled: { from: ["waiting", "blocked"], to: "waiting" },
  override_requested: { from: ["running"], to: "running" },
};

/** Whether the table lets `event` happen in `state`. */
export function canTransition(state: ScheduleState | null, event: ScheduleEventName): boolean {
  return SCHEDULE_TRANSITIONS[event].from.includes(state);
}

/** Who set the next run. */
export type ScheduleSource = "policy" | "hook" | "cli";

/** How a tick that ran came to start. */
export type TickOrigin = "scheduled" | "catch-up" | "manual";

/** The columns of a schedule row that its events carry, so the row is the fold of its log. */
export interface ScheduleFields {
  state: ScheduleState;
  next_at: number | null;
  reason: string | null;
  source: string | null;
  holder: string | null;
  anchor: number | null;
  request: string | null;
}

/**
 * What a person asked of a task while a run of it was going, kept in
 * `schedules.request` until the run ends: pause it then, and/or run it next
 * at `nextAt` instead of what the run decides.
 */
export interface ScheduleRequest {
  pause?: true;
  nextAt?: number;
}

export function parseScheduleRequest(request: string | null | undefined): ScheduleRequest {
  if (!request) return {};
  try {
    const parsed = JSON.parse(request) as Record<string, unknown>;
    return {
      ...(parsed.pause === true ? { pause: true as const } : {}),
      ...(typeof parsed.nextAt === "number" ? { nextAt: parsed.nextAt } : {}),
    };
  } catch {
    return {};
  }
}

/** The column value for `request`: null when nothing is asked. */
export function encodeScheduleRequest(request: ScheduleRequest): string | null {
  return request.pause || request.nextAt != null ? JSON.stringify(request) : null;
}

/** `will pause when the run ends`, `then next run 15:05`: what is waiting on the run in progress. */
export function describeRequest(request: string | null | undefined): string | null {
  const { pause, nextAt } = parseScheduleRequest(request);
  const parts = [
    ...(nextAt != null ? [`next run ${formatClock(nextAt)} when the run ends`] : []),
    ...(pause ? ["pauses when the run ends"] : []),
  ];
  return parts.length ? parts.join(", then ") : null;
}

/**
 * The schedule row a task's events add up to, oldest first: each event records
 * the row as it left it. Null when there are none.
 */
export function foldSchedule(
  events: readonly (Omit<ScheduleFields, "state"> & { to_state: string })[],
): ScheduleFields | null {
  const last = events[events.length - 1];
  if (!last) return null;
  const { to_state, next_at, reason, source, holder, anchor, request } = last;
  return { state: to_state as ScheduleState, next_at, reason, source, holder, anchor, request };
}

/**
 * Whether `events` (oldest first) is a path through the state table, starting
 * from no row. Null when it is; otherwise the first event that is not.
 */
export function invalidStep<
  E extends { event: string; from_state: string | null; to_state: string },
>(events: readonly E[]): E | null {
  let state: ScheduleState | null = null;
  for (const step of events) {
    const rule = SCHEDULE_TRANSITIONS[step.event as ScheduleEventName];
    if (
      !rule ||
      step.from_state !== state ||
      !rule.from.includes(state) ||
      step.to_state !== rule.to
    ) {
      return step;
    }
    state = rule.to;
  }
  return null;
}

// ---- timing in words ------------------------------------------------------

/** The object form of `timing`, as far as its literal says. */
export interface IntervalTimingValue {
  every?: unknown;
  edge?: unknown;
  [key: string]: unknown;
}

export type TimingValue = string | IntervalTimingValue;

/**
 * The `timing` a task exports, read out of its compiled code: the cron pattern,
 * or the object literal. Null when it is computed, or there is none.
 */
export function timingOf(code: string | null | undefined): TimingValue | null {
  const cron = cronOf(code);
  if (cron) return cron;
  if (!code) return null;
  const value = literalOf(code, "timing");
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as IntervalTimingValue)
    : null;
}

const WORD_UNITS = [
  [86_400_000, "day"],
  [3_600_000, "hour"],
  [60_000, "minute"],
  [1_000, "second"],
  [1, "millisecond"],
] as const;

/** `5 minutes`, `1 hour`, `90 seconds`: in the biggest unit that divides it. */
export function describeDuration(ms: number): string {
  for (const [unit, word] of WORD_UNITS) {
    if (ms >= unit && ms % unit === 0) {
      const n = ms / unit;
      return `${n} ${word}${n === 1 ? "" : "s"}`;
    }
  }
  return formatMs(ms);
}

/** `every 5 minutes`, `every hour, trailing`; null when `every` cannot be read. */
export function describeInterval(timing: IntervalTimingValue): string | null {
  const every = parseDuration(timing.every as string | number | undefined);
  if (every == null || every <= 0) return null;
  // `every minute`, as a cron pattern reads, rather than `every 1 minute`.
  const period = describeDuration(every).replace(/^1 (?=[a-z])/, "");
  return `every ${period}${timing.edge === "trailing" ? ", trailing" : ""}`;
}

/** `15s`, `2h`, `90m`: a duration as short as it goes. */
function shortDuration(ms: number): string {
  for (const [unit, suffix] of [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
    [1_000, "s"],
  ] as const) {
    if (ms >= unit && ms % unit === 0) return `${ms / unit}${suffix}`;
  }
  return formatMs(ms);
}

/**
 * `15s–2h`: how fast and how slow an interval task may go, when it sets
 * `min` or `max`. Null for a cron pattern, or a task on the defaults.
 */
export function describeLimits(timing: TimingValue | null | undefined): string | null {
  if (timing == null || typeof timing === "string") return null;
  if (timing.min == null && timing.max == null) return null;
  const every = parseDuration(timing.every as string | number | undefined);
  if (every == null) return null;
  const min = parseDuration((timing.min ?? every) as string | number);
  const max = parseDuration((timing.max ?? every * 32) as string | number);
  if (min == null || max == null) return null;
  return `${shortDuration(min)}–${shortDuration(max)}`;
}

/** A task's schedule in words, or as written when there are no better words. */
export function describeTiming(timing: TimingValue | null | undefined): string | null {
  if (timing == null) return null;
  if (typeof timing === "string") return describeCron(timing) ?? timing;
  return describeInterval(timing) ?? JSON.stringify(timing);
}

/** How the timing reads in code: `"*\/5 * * * *"` or `{ every: "5m" }`. */
export function timingSource(timing: TimingValue): string {
  if (typeof timing === "string") return `"${timing}"`;
  const parts = Object.entries(timing).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `{ ${parts.join(", ")} }`;
}

/** How far apart a task's runs are, when its timing says so steadily. */
export function timingPeriodMs(timing: TimingValue | null | undefined): number | null {
  if (timing == null) return null;
  if (typeof timing === "string") return cronPeriodMs(timing);
  const every = parseDuration(timing.every as string | number | undefined);
  return every != null && every > 0 ? every : null;
}

// ---- the schedule in words ------------------------------------------------

/** A schedule row as the read surfaces need it. */
export interface ScheduleReading {
  state: string;
  next_at: number | null;
  reason: string | null;
}

/** `in 4m`, `running`, `overdue`, `paused`, `blocked`: when the task runs next. */
export function describeNext(schedule: ScheduleReading | null, now: number): string {
  if (!schedule) return "—";
  if (schedule.state === "running" || schedule.state === "paused") return schedule.state;
  if (schedule.state === "blocked") return "blocked";
  if (schedule.next_at == null) return "—";
  const left = schedule.next_at - now;
  // A few seconds late is a run about to start, not a missed one.
  if (left < -5_000) return "overdue";
  if (left <= 0) return "now";
  return `in ${formatDelay(Math.max(1_000, left))}`;
}

/**
 * Why the next run is when it is, when that says more than the schedule
 * itself: `backing off after 3 failures in a row: 40m`. Null for a next run the
 * schedule alone explains.
 */
export function nextReason(
  schedule: Pick<ScheduleReading, "reason"> | null,
  words: string | null,
): string | null {
  const reason = schedule?.reason;
  if (!reason || reason === words || reason === "first run") return null;
  return reason;
}

/**
 * `set by the next hook`, `set by hand` (`ngn next`, `resume`, or ngnui's
 * buttons): who chose a next run, when it was not the policy.
 */
export function describeSource(source: string | null | undefined): string | null {
  if (source === "hook") return "set by the next hook";
  if (source === "cli") return "set by hand";
  return null;
}

/**
 * Why the next run is when it is, and who chose it, in one line for a
 * tooltip: `backing off after 3 failures in a row: 40m`, `312 jobs left (set
 * by the next hook)`, and what is waiting on the run in progress.
 */
export function describeWhy(
  schedule: { reason: string | null; source: string | null; request?: string | null } | null,
): string | null {
  if (!schedule) return null;
  const by = describeSource(schedule.source);
  const parts = [
    schedule.reason ? `${schedule.reason}${by ? ` (${by})` : ""}` : by,
    describeRequest(schedule.request),
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/**
 * `next run 15:05: every 5 minutes`, `next run 15:05, set by the next hook:
 * 312 jobs left`, from what a tick's final run recorded.
 */
export function describeDecision(
  nextAt: number | null,
  reason: string | null,
  source?: string | null,
): string | null {
  if (nextAt == null) return null;
  const by = describeSource(source);
  return `next run ${formatClock(nextAt)}${by ? `, ${by}` : ""}${reason ? `: ${reason}` : ""}`;
}

/** The fields of an event the log prints. */
export interface ScheduleEventReading {
  event: string;
  origin: string | null;
  next_at: number | null;
  previous_next_at: number | null;
  reason: string | null;
  source: string | null;
  holder: string | null;
  first_run_id: number | null;
  run_id: number | null;
  /** The pending request the event left; older readers may not select it. */
  request?: string | null;
}

/** `1234` from a holder token `1234:<uuid>`: the process that held the task. */
export function holderProcess(holder: string | null | undefined): string | null {
  if (!holder) return null;
  return holder.split(":")[0] || null;
}

function runs(event: ScheduleEventReading): string {
  const { first_run_id: first, run_id: last } = event;
  if (last == null) return "";
  return first != null && first !== last ? ` (runs #${first}–#${last})` : ` (run #${last})`;
}

const at = (ms: number | null) => (ms == null ? "—" : formatClock(ms));

/** One line of the log in words: `started (catch-up)`, `decided: next 15:05, every 5 minutes`. */
export function describeEvent(event: ScheduleEventReading): string {
  const why = event.reason ? `, ${event.reason}` : "";
  const process = holderProcess(event.holder);
  const by = describeSource(event.source);
  switch (event.event) {
    case "scheduled":
      return `scheduled: first run ${at(event.next_at)}`;
    case "started":
      return `started${event.origin && event.origin !== "scheduled" ? ` (${event.origin})` : ""}${process ? ` in process ${process}` : ""}`;
    case "decided":
      return `decided${runs(event)}: next ${at(event.next_at)}${by ? `, ${by}` : ""}${why}`;
    case "ended":
      return `ended${runs(event)}: next run stays ${at(event.next_at)}`;
    case "overdue":
      return `overdue: missed ${at(event.previous_next_at)} while ngn was not running; next ${at(event.next_at)}`;
    case "reclamped":
      return `reclamped: ${at(event.previous_next_at)} → ${at(event.next_at)}${why}`;
    case "interrupted":
      return `interrupted${runs(event)}: ngn stopped mid-run; next ${at(event.next_at)}`;
    case "blocked":
      return `blocked: due, but${event.run_id != null ? ` run #${event.run_id}` : " a run"}${process ? ` in process ${process}` : ""} holds the task`;
    case "superseded":
      return `superseded: another process ran it; next ${at(event.next_at)}`;
    case "recovered":
      return `recovered${runs(event)}: the process running it stopped; next ${at(event.next_at)}${why}`;
    case "lease_lost":
      return `lease lost${runs(event)}: this run's decision will be discarded`;
    case "paused":
      return "paused: no runs until resumed";
    case "pause_requested":
      return "pause requested: pauses when the run ends";
    case "resumed":
      return `resumed: next ${at(event.next_at)}${why}`;
    case "rescheduled":
      return `moved: ${at(event.previous_next_at)} → ${at(event.next_at)}${why}`;
    case "override_requested": {
      const { nextAt } = parseScheduleRequest(event.request);
      return `next run ${nextAt != null ? `${at(nextAt)} ` : ""}requested for when the run ends`;
    }
    default:
      return `${event.event.replace(/_/g, " ")}${event.next_at != null ? `: next ${at(event.next_at)}` : ""}${why}`;
  }
}

/** `waiting`, `blocked by run #41 in process 1234`, `running in process 1234`. */
export function describeState(
  schedule: { state: string; holder: string | null },
  holderRun?: number | null,
): string {
  const process = holderProcess(schedule.holder);
  if (schedule.state === "blocked") {
    return `blocked by ${holderRun != null ? `run #${holderRun}` : "another run"}${process ? ` in process ${process}` : ""}`;
  }
  if (schedule.state === "running" && process) return `running in process ${process}`;
  return schedule.state;
}
