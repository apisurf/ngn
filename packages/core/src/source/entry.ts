import invariant from "tiny-invariant";
import { EntryParams, OnTaskCodeLoaded } from "./types.js";
import { EntryLiveSource } from "./entryLiveSource.js";
import { EntryDbSource } from "./entryDbSource.js";
import { isLiveSourceParams, isDbSourceParams } from "./util.js";
import { EntryExports } from "./types.js";

import { executeUnrestricted } from "../runtime/vm.js";

export class Entry {
  private entry: EntryLiveSource | EntryDbSource;
  private callbacks: {
    onTaskCodeLoaded?: OnTaskCodeLoaded;
  };

  constructor(
    options: EntryParams,
    config: {
      onTaskCodeLoaded?: OnTaskCodeLoaded;
    }
  ) {
    this.callbacks = {
      onTaskCodeLoaded: config.onTaskCodeLoaded ?? undefined,
    };

    if (isLiveSourceParams(options)) {
      this.entry = new EntryLiveSource(options, config);
    } else if (isDbSourceParams(options)) {
      this.entry = new EntryDbSource(options, config);
    } else {
      throw new TypeError("Invalid source parameters");
    }
  }

  async load() {
    return this.entry.load();
  }

  isLoaded() {
    return this.entry.isLoaded();
  }

  async getExports(): Promise<EntryExports | null> {
    invariant(this.entry.code, "Entry code not loaded. Load entry first.");

    try {
      const taskExports = await executeUnrestricted(this.entry.code);
      this.callbacks.onTaskCodeLoaded?.(this.entry.codeHash!);

      // Handle both named exports and default export in ESM
      // Support three cases:
      // 1. Default export is a function directly (export default async function task() {})
      // 2. Default export is an object with a task property (export default { task: ... })
      // 3. Named exports (export const task = ...)
      let taskFunction;
      if (typeof taskExports.default === "function") {
        // Default export is a function, treat it as the task
        taskFunction = taskExports.default;
      } else if (taskExports.default?.task) {
        // Default export is an object with a task property
        taskFunction = taskExports.default.task;
      } else {
        // Use named exports
        taskFunction = taskExports.task;
      }

      // For other exports, prefer named exports over default export properties
      return {
        task: taskFunction,
        timing: taskExports.timing ?? taskExports.default?.timing,
        shouldSkip: taskExports.shouldSkip ?? taskExports.default?.shouldSkip,
        shouldRetry:
          taskExports.shouldRetry ?? taskExports.default?.shouldRetry,
        onSuccess: taskExports.onSuccess ?? taskExports.default?.onSuccess,
        onError: taskExports.onError ?? taskExports.default?.onError,
        onComplete: taskExports.onComplete ?? taskExports.default?.onComplete,
      };
    } catch (error) {
      console.error("Error getting task exports:", error);
      return null;
    }
  }

  get paths() {
    return this.entry.path;
  }

  get codeHash(): string | null {
    return this.entry.codeHash;
  }

  get code(): string | null {
    return this.entry.code;
  }
}
