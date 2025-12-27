import { validate, schedule, ScheduledTask } from "node-cron";
import invariant from "tiny-invariant";
import { logTaskLibraryScheduler, logTaskLibrarySchedulerError } from "op3-os";
import { Task } from "./task.js";
import { TaskLibrary } from "./taskLibrary.js";

type Options = {
  taskLibrary: TaskLibrary;
};

export class TaskLibraryScheduler {
  private taskLibrary: TaskLibrary;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();

  constructor(options: Options) {
    this.taskLibrary = options.taskLibrary;
  }

  async start() {
    logTaskLibraryScheduler("Starting scheduler");
    const scheduledTasks = this.taskLibrary.getTasks().map(async (task) => {
      try {
        const res = await this.scheduleTask(task);
        return res;
      } catch (error) {
        logTaskLibrarySchedulerError(`Error scheduling task: ${task.taskPath}`);
        logTaskLibrarySchedulerError(error);
      }
    });

    await Promise.all(scheduledTasks);
    logTaskLibraryScheduler("Scheduler started");
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

    logTaskLibraryScheduler(
      `Scheduling: ${task.taskPath} with pattern: ${task.timingPattern}`
    );

    invariant(
      task.hasTimingExport(),
      `timing pattern is missing for ${task.taskPath}`
    );
    invariant(
      task.hasTaskExport(),
      `task function is missing for ${task.taskPath}`
    );
    invariant(
      task.timingPattern && this.isCronPatternValid(task.timingPattern),
      `Invalid cron pattern: ${task.timingPattern} for ${task.taskPath}`
    );

    const wrappedUserTask = async () => task.execute();

    // schedule task
    const scheduledTask = schedule(task.timingPattern, wrappedUserTask);
    this.scheduledTasks.set(task.taskPath, scheduledTask);
    logTaskLibraryScheduler(`Scheduled: ${task.taskPath}`);
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
    return validate(cronPattern);
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
