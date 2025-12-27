import { FsNodeFileDescriptor } from "op3-os";
import invariant from "tiny-invariant";
import { BuildCompiledTaskConfigFn } from "./types.js";
import { Task } from "./task.js";

export class TaskLibrary {
  private tasks: Map<string, Task>;

  constructor() {
    this.tasks = new Map<string, Task>();
  }

  add(taskOrTasks: Task | Array<Task>) {
    if (Array.isArray(taskOrTasks)) {
      taskOrTasks.forEach((task) => this.tasks.set(task.taskPath, task));
    } else {
      this.tasks.set(taskOrTasks.taskPath, taskOrTasks);
    }
  }

  remove(taskPath: string | Array<Task>) {
    if (Array.isArray(taskPath)) {
      taskPath.forEach((task) => this.tasks.delete(task.taskPath));
    } else {
      this.tasks.delete(taskPath);
    }
  }

  /**
   * Add tasks from in-memory compiled code (stored in DB)
   */
  addFromCompiledCode(
    compiledCode: Map<string, string>,
    descriptors: Record<string, FsNodeFileDescriptor>,
    buildConfigFn: BuildCompiledTaskConfigFn
  ) {
    compiledCode.forEach((code, sourcePath) => {
      // Look up descriptor by source path directly
      const descriptor = descriptors[sourcePath];

      if (!descriptor) {
        console.warn(`No descriptor found for source path: ${sourcePath}`);
        return;
      }

      const task = new Task({
        buildConfigFn,
        entryParams: {
          compiledCode: code,
          descriptor,
        },
      });

      this.tasks.set(task.taskPath, task);
    });
  }

  async execute(taskPath: string) {
    const task = this.tasks.get(taskPath);
    invariant(task, `Task not found for path: ${taskPath}`);

    return task.execute();
  }

  getTasks() {
    return Array.from(this.tasks.values());
  }
}
