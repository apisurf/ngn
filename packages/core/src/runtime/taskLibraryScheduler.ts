import invariant from "tiny-invariant";
import { logTaskLibraryScheduler, logTaskLibrarySchedulerError } from "@apisurf/ngn-os";
import { failedRunId, Task } from "./task.js";
import { TaskLibrary } from "./taskLibrary.js";
import { systemClock, type Clock } from "./clock.js";
import { resolveTiming, type TimingExport } from "./timing.js";
import { TaskSchedule, type RunNowOutcome } from "./taskSchedule.js";
import type { ScheduleCommand, ScheduleControlResult } from "./scheduleControl.js";

type Options = {
  taskLibrary: TaskLibrary;
  /** Called when a scheduled run throws, with the run it was recorded as when there is one. */
  onRunError?: (path: string, error: unknown, runId: number | null) => void;
  /** Something went wrong with a task's schedule itself (a refused transition, a bad timing change). */
  onScheduleProblem?: (path: string, message: string) => void;
  /** Schedule every task on this instead of its own `timing` (`ngn run x --timing`). */
  timing?: TimingExport;
  /** Where the scheduler reads the time and waits. Tests pass their own. */
  clock?: Clock;
  /** How long a task's lease outlives a process that stopped renewing it. */
  leaseTtlMs?: number;
  /** Where backoff's jitter comes from. Tests pass their own. */
  random?: () => number;
  /** How long a task's `next` hook may take. Tests pass their own. */
  nextTimeoutMs?: number;
};

export type { RunNowOutcome };

/** What `start()` did with each task: scheduled on its timing, or left out and why. */
export interface ScheduleReport {
  scheduled: { path: string; timing: TimingExport }[];
  failed: { path: string; reason: string }[];
}

export class TaskLibraryScheduler {
  private taskLibrary: TaskLibrary;
  private options: Options;
  private scheduledTasks: Map<string, TaskSchedule> = new Map();

  constructor(options: Options) {
    this.taskLibrary = options.taskLibrary;
    this.options = options;
  }

  async start(): Promise<ScheduleReport> {
    logTaskLibraryScheduler("Starting scheduler");
    const report: ScheduleReport = { scheduled: [], failed: [] };
    const scheduledTasks = this.taskLibrary.getTasks().map(async (task) => {
      try {
        const timing = await this.scheduleTask(task);
        report.scheduled.push({ path: task.taskPath, timing });
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

  /**
   * Stop starting runs, and give the runs in progress up to `graceMs` to end
   * before closing them as interrupted.
   */
  async stop(options: { graceMs?: number } = {}) {
    logTaskLibraryScheduler("Stopping scheduler");
    await Promise.all(
      [...this.scheduledTasks].map(([path, schedule]) => {
        logTaskLibraryScheduler(`Stopping scheduled task: ${path}`);
        return schedule.stop(options);
      }),
    );
  }

  /** Stop as a process that died would, writing nothing. For tests standing in for a crash. */
  abandon() {
    for (const schedule of this.scheduledTasks.values()) schedule.abandon();
  }

  /**
   * Check a loaded task's exports and start its schedule. The timing it is
   * scheduled on is returned; anything wrong with the exports is thrown,
   * naming the task, so it fails now rather than on the first tick.
   */
  async scheduleTask(task: Task): Promise<TimingExport> {
    logTaskLibraryScheduler(`Scheduling task: ${task.taskPath}`);
    await task.loadEntry();

    const timing = (this.options.timing ?? task.timing) as TimingExport;
    const resolved = resolveTiming(timing, task.taskPath);
    invariant(task.hasTaskExport(), `task function is missing for ${task.taskPath}`);
    task.validateExports();
    invariant(
      resolved.kind === "cron" || !task.retryPolicy.breaker,
      `retry.breaker for ${task.taskPath}: an interval task does not skip ticks; remove the breaker and use timing.backoff, which slows a failing interval task down`,
    );
    const next = task.nextHook;
    invariant(
      next == null || typeof next === "function",
      `next for ${task.taskPath}: expected a function`,
    );
    invariant(
      next == null || resolved.kind === "interval",
      `next for ${task.taskPath}: only an interval task can choose its next run; a cron task runs on its pattern`,
    );

    const schedule = new TaskSchedule({
      task,
      timing,
      override: this.options.timing != null,
      clock: this.options.clock ?? systemClock,
      leaseTtlMs: this.options.leaseTtlMs,
      random: this.options.random,
      nextTimeoutMs: this.options.nextTimeoutMs,
      onRunError: (error) => {
        logTaskLibrarySchedulerError(`Run failed: ${task.taskPath}`);
        logTaskLibrarySchedulerError(error);
        this.options.onRunError?.(task.taskPath, error, failedRunId(error));
      },
      onProblem: (message) => {
        logTaskLibrarySchedulerError(message);
        this.options.onScheduleProblem?.(task.taskPath, message);
      },
    });
    await schedule.start();
    this.scheduledTasks.set(task.taskPath, schedule);
    logTaskLibraryScheduler(`Scheduled: ${task.taskPath}`);
    return timing;
  }

  /**
   * Start one run of a scheduled task now, outside its schedule: retries,
   * budget, locks and hooks all apply, and errors go where a tick's go. It is
   * not a tick, so the breaker does not hold it back, and it leaves the next
   * run where it was. Resolves once the run is under way, not when it ends.
   *
   * A run of the task still going, in this process or another, is reported
   * rather than recorded as a skip: the person asking can simply wait.
   */
  async runNow(taskPath: string): Promise<RunNowOutcome> {
    const schedule = this.scheduledTasks.get(taskPath);
    if (!schedule)
      return { started: false, reason: `${taskPath} is not scheduled by this ngn run` };
    return schedule.runNow();
  }

  /** Pause, resume or move a scheduled task's next run, as `ngn pause`, `resume` and `next` do. */
  async control(taskPath: string, command: ScheduleCommand): Promise<ScheduleControlResult> {
    const schedule = this.scheduledTasks.get(taskPath);
    if (!schedule) {
      return {
        applied: false,
        error: true,
        message: `${taskPath} is not scheduled by this ngn run`,
      };
    }
    return schedule.control(command);
  }

  async unscheduleTask(task: Task) {
    const existing = this.scheduledTasks.get(task.taskPath);
    if (!existing) return;

    logTaskLibraryScheduler(`Unscheduling: ${task.taskPath}`);
    this.scheduledTasks.delete(task.taskPath);
    await existing.stop();
    logTaskLibraryScheduler(`Unscheduled: ${task.taskPath}`);
  }
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
