/**
 * What `ngn pause`, `ngn resume` and `ngn next` do to a task's schedule, and
 * what ngnui's buttons do through `ngn run`: each one transition from the
 * state table, written straight to the database with source `cli`. No live
 * runtime is needed; a running scheduler sees the changed row within a step.
 *
 * | Command  | waiting, blocked | running            | paused              |
 * | -------- | ---------------- | ------------------ | ------------------- |
 * | pause    | paused           | pause_requested    | no change           |
 * | resume   | no change        | no change          | resumed             |
 * | next     | rescheduled      | override_requested | refused             |
 *
 * A request made during a run waits in `schedules.request` for the run to end.
 */
import {
  encodeScheduleRequest,
  formatClock,
  formatDelay,
  parseScheduleRequest,
  type ScheduleEventName,
  type ScheduleRequest,
} from "@apisurf/ngn-schema/describe";
import {
  isRefusal,
  type ScheduleRow,
  type ScheduleStore,
  type Transition,
} from "../db/services/schedule.js";
import { nextCronSlot } from "./cron.js";

/** The shortest a person may move a next run to, as `every` is at least. */
const MIN_DELAY_MS = 1_000;

export type ScheduleCommand =
  | { kind: "pause" }
  | { kind: "resume" }
  /** `delayMs` from now; 0 for `now`. */
  | { kind: "next"; delayMs: number };

export interface ScheduleControlTarget {
  store: ScheduleStore;
  taskId: number;
  /** The task as the person named it, for the messages. */
  name: string;
  /** The task's cron pattern, when it runs on one: resuming it takes the next slot. */
  pattern: string | null;
  now: number;
}

export type ScheduleControlResult =
  | { applied: true; event: ScheduleEventName; row: ScheduleRow; message: string }
  /** `error`: the command could not do what was asked (as opposed to there being nothing to do). */
  | { applied: false; error: boolean; message: string };

type Plan =
  | { change: Transition; message: string }
  | { applied: false; error: boolean; message: string };

/**
 * Apply `command` to the task's schedule as it stands. If the scheduler moves
 * the row on between the read and the write, the command reads it again and
 * acts on the new state, once.
 */
export async function controlSchedule(
  target: ScheduleControlTarget,
  command: ScheduleCommand,
): Promise<ScheduleControlResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await target.store.read(target.taskId);
    if (!row) {
      return {
        applied: false,
        error: true,
        message: `${target.name} has not been scheduled yet: ngn run schedules it`,
      };
    }
    const plan = planCommand(row, command, target);
    if (!("change" in plan)) return plan;
    const result = await target.store.transition(target.taskId, plan.change);
    if (!isRefusal(result)) {
      return { applied: true, event: plan.change.event, row: result, message: plan.message };
    }
  }
  return {
    applied: false,
    error: true,
    message: `the schedule of ${target.name} kept changing; try again`,
  };
}

function planCommand(
  row: ScheduleRow,
  command: ScheduleCommand,
  target: ScheduleControlTarget,
): Plan {
  if (command.kind === "pause") return planPause(row, target);
  if (command.kind === "resume") return planResume(row, target);
  return planNext(row, command.delayMs, target);
}

/** The pending request with `more` added, as the column holds it. */
export function withRequest(
  row: Pick<ScheduleRow, "request">,
  more: ScheduleRequest,
): string | null {
  return encodeScheduleRequest({ ...parseScheduleRequest(row.request), ...more });
}

function planPause(row: ScheduleRow, { name, now }: ScheduleControlTarget): Plan {
  if (row.state === "paused") {
    return { applied: false, error: false, message: `${name} is already paused` };
  }
  if (row.state === "running") {
    return {
      change: {
        event: "pause_requested",
        at: now,
        set: { request: withRequest(row, { pause: true }) },
        requestIs: row.request,
      },
      message: `${name} has a run in progress; it pauses when the run ends`,
    };
  }
  return {
    change: { event: "paused", at: now, set: { holder: null } },
    message: `paused ${name}: no runs until ngn resume ${name}`,
  };
}

/**
 * Back to its stored next run, or, when that went by while it was paused,
 * now (an interval task) or its next slot (a cron task, as after downtime).
 */
function planResume(row: ScheduleRow, { name, now, pattern }: ScheduleControlTarget): Plan {
  if (row.state !== "paused") {
    return { applied: false, error: false, message: `${name} isn't paused (${row.state})` };
  }
  const missed = row.next_at == null || row.next_at < now;
  let set: Transition["set"] = { reason: "resumed", source: "cli" };
  if (missed) {
    const nextAt = pattern ? (nextCronSlot(pattern, now) ?? now) : now;
    set = {
      next_at: nextAt,
      anchor: nextAt,
      source: "cli",
      reason: pattern
        ? "resumed; missed slots are not run, next on its pattern"
        : "resumed; it was due while paused, so it runs now",
    };
  }
  const nextAt = set.next_at ?? row.next_at!;
  return {
    change: { event: "resumed", at: now, set },
    message: `resumed ${name}: next run ${nextAt <= now ? "now" : formatClock(nextAt)}`,
  };
}

/**
 * The next run at `delayMs` from now: at once, or when the run in progress
 * ends. Not held to `min`, which is the task's own limit, but at least 1s.
 */
function planNext(row: ScheduleRow, delayMs: number, { name, now }: ScheduleControlTarget): Plan {
  if (row.state === "paused") {
    return {
      applied: false,
      error: true,
      message: `${name} is paused; run ngn resume ${name} first`,
    };
  }
  const delay = delayMs === 0 ? 0 : Math.max(MIN_DELAY_MS, delayMs);
  const nextAt = now + delay;
  if (row.state === "running") {
    return {
      change: {
        event: "override_requested",
        at: now,
        set: { request: withRequest(row, { nextAt }) },
        requestIs: row.request,
      },
      message: `${name} has a run in progress; when it ends, its next run is ${delay === 0 ? "now" : formatClock(nextAt)}`,
    };
  }
  // On the leading edge, the run this leads to starts a new grid.
  return {
    change: {
      event: "rescheduled",
      at: now,
      set: {
        next_at: nextAt,
        reason: `moved with ngn next: ${delay === 0 ? "now" : `in ${formatDelay(delay)}`}`,
        source: "cli",
        anchor: nextAt,
        holder: null,
      },
    },
    message: `${name} runs next ${delay === 0 ? "now" : `at ${formatClock(nextAt)}`}`,
  };
}

/**
 * What a tick's end does with a request made during it: `ngn next` replaces
 * the next run the tick chose, and `ngn pause` pauses the task straight
 * after, in the same write. The request is cleared either way.
 */
export function honourRequest(change: Transition, row: ScheduleRow | null): Transition {
  const { pause, nextAt } = parseScheduleRequest(row?.request);
  const set = { ...change.set, request: null };
  if (nextAt != null) {
    Object.assign(set, {
      next_at: nextAt,
      reason: `moved with ngn next to ${formatClock(nextAt)}`,
      source: "cli",
      anchor: nextAt,
    });
  }
  return {
    ...change,
    set,
    requestIs: row?.request ?? null,
    ...(pause ? { followedBy: { event: "paused", at: change.at } } : {}),
  };
}
