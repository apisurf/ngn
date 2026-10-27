import { Cron } from "croner";
import invariant from "tiny-invariant";
import { Task, type ExecuteSchedule } from "./task.js";

/**
 * Five fields (minutes first) or six (seconds first), which is what ngn has
 * always accepted. Years are not.
 */
const CRON_OPTIONS = { mode: "5-or-6-parts" } as const;

export function isCronPatternValid(pattern: string) {
  try {
    new Cron(pattern, { ...CRON_OPTIONS, paused: true }).stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * One scheduled tick: start a run, or record why not.
 *
 * Errors from the run are handed to `onError` rather than thrown: a tick has
 * no caller to throw to, and the run has already been marked as failed.
 */
export async function tick(
  task: Task,
  onError: (error: unknown) => void,
  schedule: ExecuteSchedule = {},
) {
  try {
    if (task.isRunning && task.overlapPolicy === "skip") {
      await task.skip("previous run still in progress");
      return;
    }

    await task.execute(schedule);
  } catch (error) {
    onError(error);
  }
}

/**
 * Schedule a loaded task on `pattern`. The task's exports are checked here, so
 * a bad `overlap` or `budget` fails now rather than on the first tick.
 */
export function scheduleTask(task: Task, pattern: string, onError: (error: unknown) => void) {
  invariant(isCronPatternValid(pattern), `Invalid cron pattern: ${pattern} for ${task.taskPath}`);
  task.validateExports();

  return new Cron(pattern, CRON_OPTIONS, (job) =>
    tick(task, onError, {
      scheduledAt: job.currentRun()?.getTime() ?? Date.now(),
      nextAt: job.nextRun()?.getTime() ?? null,
    }),
  );
}
