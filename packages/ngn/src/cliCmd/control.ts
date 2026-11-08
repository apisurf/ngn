/**
 * `ngn pause <task>`, `ngn resume <task>` and `ngn next <task> <now|duration>`:
 * hold a scheduled task, let it go again, or move its next run, without
 * editing the task file or restarting `ngn run`. Each is one transition of the
 * task's schedule, written to the database with source `cli`; a running
 * `ngn run` picks it up within a few seconds. Tasks are named the way
 * `ngn run` takes them.
 */
import { controlSchedule, ScheduleStore, type ScheduleCommand } from "@apisurf/ngn-core";
import { describeRequest, timingOf } from "@apisurf/ngn-schema/describe";
import { RunStore } from "../read/store.js";
import { renderJson } from "../util/format.js";
import { findTask } from "../util/matchTasks.js";
import { resolveDbPath } from "../util/resolveDb.js";

export interface ControlOptions {
  db?: string;
  root?: string;
  json?: boolean;
}

/** `now` → 0; `10m`, `90s` → ms; null for anything else, or less than a second. */
export function parseWhen(when: string): number | null {
  if (when.trim().toLowerCase() === "now") return 0;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(s|m|h|d)\s*$/.exec(when);
  if (!match) return null;
  const ms = Number(match[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]!]!;
  return ms >= 1_000 ? ms : null;
}

async function control(target: string, command: ScheduleCommand, options: ControlOptions) {
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
    const client = await store.writableSchedules();
    if (!client) {
      process.stderr.write(
        `ngn: ${task.path} has not been scheduled yet: this database is from before ngn kept schedules\n`,
      );
      process.exitCode = 1;
      return;
    }
    const timing = timingOf(await store.latestCode(task.id));
    const result = await controlSchedule(
      {
        store: new ScheduleStore(client),
        taskId: task.id,
        name: task.path,
        pattern: typeof timing === "string" ? timing : null,
        now: Date.now(),
      },
      command,
    );

    if (options.json) {
      const row = result.applied ? result.row : null;
      process.stdout.write(
        `${renderJson({
          task: task.path,
          applied: result.applied,
          event: result.applied ? result.event : null,
          message: result.message,
          schedule: row && {
            state: row.state,
            next_at: row.next_at,
            reason: row.reason,
            source: row.source,
            pending: describeRequest(row.request),
          },
        })}\n`,
      );
    } else if (!result.applied && result.error) {
      process.stderr.write(`ngn: ${result.message}\n`);
    } else {
      process.stdout.write(`${result.message}\n`);
    }
    if (!result.applied && result.error) process.exitCode = 1;
  } finally {
    store.close();
  }
}

export const pause = (target: string, options: ControlOptions) =>
  control(target, { kind: "pause" }, options);

export const resume = (target: string, options: ControlOptions) =>
  control(target, { kind: "resume" }, options);

export const next = async (target: string, when: string, options: ControlOptions) => {
  const delayMs = parseWhen(when);
  if (delayMs == null) {
    process.stderr.write(
      `ngn: next takes "now" or a duration of at least 1s, like 30s, 10m, 2h (got "${when}")\n`,
    );
    process.exitCode = 1;
    return;
  }
  return control(target, { kind: "next", delayMs }, options);
};
