/**
 * `ngn schedule <task>` — what a task's schedule is doing: its state, when it
 * runs next and why, then what happened to it, step by step, in the words
 * `ngn status` and ngnui use. A task is named the way `ngn run` takes one.
 */
import {
  describeEvent,
  describeNext,
  describeState,
  describeTiming,
  formatDateTime,
  holderProcess,
  timingOf,
} from "@apisurf/ngn-schema/describe";
import { RunStore, type ScheduleEventRow, type ScheduleRow } from "../read/store.js";
import { findTask } from "../util/matchTasks.js";
import { renderJson } from "../util/format.js";
import { resolveDbPath } from "../util/resolveDb.js";

export interface ScheduleOptions {
  db?: string;
  root?: string;
  json?: boolean;
  limit?: string;
}

export const schedule = async (target: string, options: ScheduleOptions) => {
  const limit = options.limit === undefined ? 20 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    process.stderr.write(`ngn: --limit expects a positive number (got "${options.limit}")\n`);
    process.exitCode = 1;
    return;
  }
  const dbPath = await resolveDbPath(options, { mustExist: true });
  if (dbPath === null) {
    process.exitCode = 1;
    return;
  }

  const store = RunStore.open(dbPath);
  try {
    const task = await findTask(store, target);
    if (!task) {
      process.exitCode = 1;
      return;
    }
    const [row, events, code] = await Promise.all([
      store.schedules().then((all) => all.get(task.id) ?? null),
      store.scheduleEvents(task.id, limit),
      store.latestCode(task.id),
    ]);
    const timing = describeTiming(timingOf(code));
    const now = Date.now();

    if (options.json) {
      process.stdout.write(`${renderJson(asJson(task.path, timing, row, events))}\n`);
      return;
    }
    process.stdout.write(`${asText(task.path, timing, row, events, now)}\n`);
  } finally {
    store.close();
  }
};

/** The run holding a blocked task, as its latest `blocked` event named it. */
function holdingRun(row: ScheduleRow | null, events: ScheduleEventRow[]): number | null {
  if (row?.state !== "blocked") return null;
  return events.findLast((e) => e.event === "blocked")?.run_id ?? null;
}

function asJson(
  path: string,
  timing: string | null,
  row: ScheduleRow | null,
  events: ScheduleEventRow[],
) {
  return {
    task: path,
    timing,
    schedule: row && {
      state: row.state,
      next_at: row.next_at,
      reason: row.reason,
      source: row.source,
      process: holderProcess(row.holder),
      blocked_by: holdingRun(row, events),
    },
    events: events.map((e) => ({
      at: e.at,
      event: e.event,
      from: e.from_state,
      to: e.to_state,
      origin: e.origin,
      next_at: e.next_at,
      previous_next_at: e.previous_next_at,
      reason: e.reason,
      source: e.source,
      process: holderProcess(e.holder),
      first_run_id: e.first_run_id,
      run_id: e.run_id,
      text: describeEvent(e),
    })),
  };
}

function asText(
  path: string,
  timing: string | null,
  row: ScheduleRow | null,
  events: ScheduleEventRow[],
  now: number,
): string {
  const out = [`${path}${timing ? ` · ${timing}` : ""}`, ""];
  if (!row) {
    out.push("No schedule yet: `ngn run` has not scheduled this task on this database.");
    return out.join("\n");
  }
  const next =
    row.next_at == null
      ? "—"
      : `${formatDateTime(now, row.next_at)} (${describeNext(row, now)})${row.reason ? `: ${row.reason}` : ""}`;
  out.push(
    `  state   ${describeState(row, holdingRun(row, events))}`,
    `  next    ${next}`,
    ...(row.source ? [`  set by  ${row.source}`] : []),
    "",
    events.length ? `Log (newest ${events.length}, oldest first)` : "Log: empty",
    ...events.map((e) => `  ${formatDateTime(now, e.at)}  ${describeEvent(e)}`),
  );
  return out.join("\n");
}
