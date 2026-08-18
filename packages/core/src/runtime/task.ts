import invariant from "tiny-invariant";
import {
  CompiledTaskCallbacks,
  TaskRuntimeCallbacks,
  BuildCompiledTaskConfigFn,
} from "./types.js";
import { TaskContext, EntryExports } from "../source/types.js";
import { Entry } from "../source/entry.js";
import { EntryParams } from "../source/types.js";

export class Task {
  private taskCallbacks: CompiledTaskCallbacks | undefined;
  private runtimeCallbacks: TaskRuntimeCallbacks | undefined;
  private env: TaskContext["env"];
  private kv: TaskContext["kv"];
  private log: TaskContext["log"];
  private timing: TaskContext["timing"];
  private sqlite: TaskContext["sqlite"];
  private meta: TaskContext["meta"];
  private entry: Entry | null = null;
  private entryExports: EntryExports | null = null;

  constructor({
    entryParams,
    buildConfigFn,
  }: {
    entryParams: EntryParams;
    buildConfigFn: BuildCompiledTaskConfigFn;
  }) {
    invariant(entryParams, "Entry params not provided! Cannot create task.");

    this.entry = new Entry(entryParams, {
      onTaskCodeLoaded: this.taskCallbacks?.onTaskCodeLoaded,
    });

    const { taskCallbacks, runtimeCallbacks, env, kv, log, timing, sqlite } =
      buildConfigFn({
        sourcePath: this.entry.paths.source,
        compiledPath: this.entry.paths.compiled,
      });
    this.taskCallbacks = taskCallbacks;
    this.runtimeCallbacks = runtimeCallbacks;
    this.sqlite = sqlite;
    this.meta = {
      fileTaskId: -1,
      fileTaskVersionId: -1,
      file: this.entry.fileDescriptor,
      tasksRootDir: this.entry.tasksRootDir,
    };
    this.env = env;
    this.kv = kv;
    this.log = log;
    this.timing = timing;
  }

  get sourcePath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.source;
  }

  get compiledPath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.compiled;
  }

  /**
   * Unique identifier for the task - the relative entry path
   */
  get taskPath() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.paths.relativeEntry;
  }

  get codeHash() {
    invariant(this.entry, "Entry not initialized.");
    return this.entry.codeHash;
  }

  get timingPattern() {
    invariant(this.entryExports, "Entry exports not initialized.");
    return this.entryExports.timing;
  }

  hasTaskExport() {
    return this.entryExports?.task !== undefined;
  }

  hasTimingExport() {
    return this.entryExports?.timing !== undefined;
  }

  async loadEntry() {
    invariant(this.entry, "Entry not initialized.");
    // load entry code
    await this.entry.load();
    // get entry exports (now async for ESM execution)
    this.entryExports = await this.entry.getExports();
  }

  async execute() {
    invariant(this.entry, "Entry not initialized.");

    try {
      await this.loadEntry();
      invariant(this.entry.isLoaded(), "Entry failed to load.");
      invariant(this.entryExports, "Entry failed to get exports.");

      this.taskCallbacks?.onTaskExportsLoaded?.();

      // register task load complete
      const loadResult = await this.taskCallbacks?.onTaskLoadComplete?.({
        paths: this.entry.paths,
        md5Hash: this.entry.codeHash!,
        compiledCode: this.entry.code!,
      });

      this.meta.fileTaskId = loadResult?.fileTaskId ?? -1;
      this.meta.fileTaskVersionId = loadResult?.fileTaskVersionId ?? -1;
    } catch (error) {
      if (this.entry.paths.relativeEntry) {
        await this.runtimeCallbacks?.onFailure?.({
          path: this.entry.paths.relativeEntry,
        });
      }

      throw error;
    }

    // register task execution start
    await this.taskCallbacks?.onTaskExecutionStart?.();

    const {
      shouldSkip,
      // shouldRetry,
      onSuccess,
      onError,
      onComplete,
      task,
    } = this.entryExports;

    if (!task) {
      await this.runtimeCallbacks?.onNotFound?.({
        path: this.entry.paths.relativeEntry,
      });
      throw new Error("Task function not found");
    }

    const taskContext: TaskContext = {
      env: this.env,
      meta: this.meta,
      kv: this.kv,
      log: this.log,
      timing: this.timing,
      sqlite: this.sqlite,
    };

    if (await shouldSkip?.(taskContext)) {
      await this.runtimeCallbacks?.onSkip?.({
        path: this.entry.paths.relativeEntry,
      });
      return;
    }

    try {
      await this.runtimeCallbacks?.onStart?.({
        path: this.entry.paths.relativeEntry,
      });
      const taskReturnValue = await task(taskContext);
      await this.runtimeCallbacks?.onSuccess?.({
        path: this.entry.paths.relativeEntry,
      });
      await onSuccess?.(taskContext);
      return taskReturnValue;
    } catch (err) {
      await this.runtimeCallbacks?.onFailure?.({
        path: this.entry.paths.relativeEntry,
      });
      await onError?.(err as Error, taskContext);
      throw err;
    } finally {
      await onComplete?.(taskContext);
    }
  }
}
