import invariant from "tiny-invariant";
import { logTaskOnceRunner, logTaskOnceRunnerError } from "op3-os";
import { Task } from "./task.js";

type Options = {
  task: Task;
};

export class TaskOnceRunner {
  private task: Task;

  constructor(options: Options) {
    this.task = options.task;
  }

  async run() {
    logTaskOnceRunner(`Preparing to run task: ${this.task.taskPath}`);

    // load the task exports to get the timing pattern
    await this.task.loadEntry();

    logTaskOnceRunner(`Loaded task code: ${this.task.taskPath}`);

    invariant(
      this.task.hasTaskExport(),
      `task function is missing for ${this.task.taskPath}`
    );

    logTaskOnceRunner(`Running task: ${this.task.taskPath}`);

    try {
      // run task
      await this.task.execute();
      logTaskOnceRunner(`Task completed: ${this.task.taskPath}`);
    } catch (error) {
      logTaskOnceRunnerError(`Error running task: ${this.task.taskPath}`);
      logTaskOnceRunnerError(error);
      throw error;
    }
  }
}
