import { Cron } from "croner";
import invariant from "tiny-invariant";
import { logTaskLibraryScheduler, logTaskLibrarySchedulerError } from "@apisurf/ngn-os";
import { failedRunId, Task } from "./task.js";
import { TaskLibrary } from "./taskLibrary.js";
import { isCronPatternValid, scheduleTask, tick } from "./schedule.js";

type Options = {
  taskLibrary: TaskLibrary;
  /** Called when a scheduled run throws, with the run it was recorded as when there is one. */
  onRunError?: (path: string, error: unknown, runId: number | null) => void;
};

/** What `runNow()` did: started a run, or why it did not. */
export type RunNowOutcome = { started: true } | { started: false; reason: string };

/** What `start()` did with each task: scheduled on its pattern, or left out and why. */
export interface ScheduleReport {
  scheduled: { path: string; pattern: string }[];
  failed: { path: string; reason: string }[];
}

export class TaskLibraryScheduler {
  private taskLibrary: TaskLibrary;
  private onRunError: Options["onRunError"];
  private scheduledTasks: Map<string, Cron> = new Map();

  constructor(options: Options) {
    this.taskLibrary = options.taskLibrary;
    this.onRunError = options.onRunError;
  }

  async start(): Promise<ScheduleReport> {
    logTaskLibraryScheduler("Starting scheduler");
    const report: ScheduleReport = { scheduled: [], failed: [] };
    const scheduledTasks = this.taskLibrary.getTasks().map(async (task) => {
      try {
        await this.scheduleTask(task);
        report.scheduled.push({ path: task.taskPath, pattern: task.timingPattern ?? "" });
      } catch (error) {
        logTaskLibrarySchedulerError(`Error scheduling task: ${task.taskPath}`);
        logTaskLibrarySchedulerError(error);
        report.failed.push({ path: task.taskPath, reason: reasonOf(error, task.taskPath) });
      }
    });

    await Promise.all(scheduledTasks);
    logTaskLibraryScheduler("Scheduler started");
    report.scheduled.sort(byPath);
    report.failed.sort(byPath);
    return report;
  }

  async stop() {
    logTaskLibraryScheduler("Stopping scheduler");
    for (const [path, task] of this.scheduledTasks) {
      logTaskLibraryScheduler(`Stopping scheduled task: ${path}`);
      task.stop();
    }
  }

  async scheduleTask(task: Task) {
    logTaskLibraryScheduler(`Scheduling task: ${task.taskPath}`);

    // load the task exports to get the timing pattern
    await task.loadEntry();

    logTaskLibraryScheduler(`Scheduling: ${task.taskPath} with pattern: ${task.timingPattern}`);

    invariant(task.hasTimingExport(), `timing pattern is missing for ${task.taskPath}`);
    invariant(task.hasTaskExport(), `task function is missing for ${task.taskPath}`);
    invariant(
      task.timingPattern && this.isCronPatternValid(task.timingPattern),
      `Invalid cron pattern: ${task.timingPattern} for ${task.taskPath}`,
    );

    const scheduledTask = scheduleTask(task, task.timingPattern, (error) => {
      logTaskLibrarySchedulerError(`Run failed: ${task.taskPath}`);
      logTaskLibrarySchedulerError(error);
      this.onRunError?.(task.taskPath, error, failedRunId(error));
    });
    this.scheduledTasks.set(task.taskPath, scheduledTask);
    logTaskLibraryScheduler(`Scheduled: ${task.taskPath}`);
  }

  /**
   * Start one run of a scheduled task now, outside its schedule, the way a tick
   * would: retries, budget, locks and hooks all apply, and errors go where a
   * tick's go. It is not a tick, so the breaker does not hold it back. Resolves
   * once the run is under way, not when it ends: a run can take longer than
   * anyone waits on a button.
   *
   * A run still going is reported rather than recorded as a skip, since nothing
   * was due: the person asking can simply wait.
   */
  runNow(taskPath: string): RunNowOutcome {
    const task = this.taskLibrary.getTasks().find((t) => t.taskPath === taskPath);
    const cron = this.scheduledTasks.get(taskPath);
    if (!task || !cron) {
      return { started: false, reason: `${taskPath} is not scheduled by this ngn run` };
    }
    if (task.isRunning && task.overlapPolicy === "skip") {
      return { started: false, reason: "a run of it is still going" };
    }
    void tick(
      task,
      (error) => {
        logTaskLibrarySchedulerError(`Run failed: ${task.taskPath}`);
        logTaskLibrarySchedulerError(error);
        this.onRunError?.(task.taskPath, error, failedRunId(error));
      },
      { scheduledAt: null, nextAt: cron.nextRun()?.getTime() ?? null },
    );
    return { started: true };
  }

  unscheduleTask(task: Task) {
    const existingTask = this.scheduledTasks.get(task.taskPath);

    if (!existingTask) {
      return;
    }

    logTaskLibraryScheduler(`Unscheduling: ${task.taskPath}`);
    existingTask.stop();
    this.scheduledTasks.delete(task.taskPath);
    logTaskLibraryScheduler(`Unscheduled: ${task.taskPath}`);
  }

  isCronPatternValid(cronPattern: string) {
    return isCronPatternValid(cronPattern);
  }

  // startScheduledTask(path: string) {
  //   const task = this.scheduledTasks.get(path);
  //   if (!task) {
  //     return;
  //   }
  //   task.start();
  // }

  // stopScheduledTask(path: string) {
  //   const task = this.scheduledTasks.get(path);
  //   if (!task) {
  //     return;
  //   }
  //   task.stop();
  // }
}

function byPath(a: { path: string }, b: { path: string }) {
  return a.path.localeCompare(b.path);
}

/** An error as a short reason: without tiny-invariant's prefix or the task's own path. */
function reasonOf(error: unknown, path: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Invariant failed: /, "")
    .replace(` for ${path}`, "")
    .replace(`: ${path}`, "");
}
