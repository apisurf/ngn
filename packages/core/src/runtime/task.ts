import invariant from "tiny-invariant";
import {
  CompiledTaskCallbacks,
  BuildCompiledTaskConfigFn,
  RunControls,
  type TaskConfig,
} from "./types.js";
import { TaskContext, EntryExports, OverlapPolicy } from "../source/types.js";
import { Entry } from "../source/entry.js";
import { toMs } from "./duration.js";
import { deadlineSignal, runDeadline } from "./runWindow.js";
import { exclusiveNames } from "./locks.js";
import { openQueue } from "./queue/queue.js";
import {
  BREAKER_SKIP_REASON,
  breakerSkips,
  resolveRetry,
  retryFits,
  type ResolvedRetry,
} from "./retry.js";
import { EntryParams } from "../source/types.js";

export interface ExecuteSchedule {
  /** When the tick fired, epoch ms. */
  scheduledAt?: number | null;
  /** When the next tick is due, epoch ms. */
  nextAt?: number | null;
}

/** What one tick's attempts share, so a retry can point back at the first. */
interface TickAttempts {
  firstRunId: number | null;
  /** The `retry` export as the latest attempt read it. */
  retry: ResolvedRetry;
  /** The context of the attempt that just failed; null when it never got a run. */
  failedContext: TaskContext | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Task {
  private taskCallbacks: CompiledTaskCallbacks | undefined;
  private startRun: TaskConfig["startRun"];
  private history: TaskConfig["history"];
  private env: TaskContext["env"];
  private kv: TaskContext["kv"];
  private sqlite: TaskContext["sqlite"];
  private meta: TaskContext["meta"];
  private entry: Entry | null = null;
  private entryExports: EntryExports | null = null;
  /** Executions started and not yet settled. */
  private inFlight = 0;

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

    const { taskCallbacks, startRun, history, env, kv, sqlite } = buildConfigFn({
      sourcePath: this.entry.paths.source,
      compiledPath: this.entry.paths.compiled,
    });
    this.taskCallbacks = taskCallbacks;
    this.startRun = startRun;
    this.history = history;
    this.sqlite = sqlite;
    this.meta = {
      fileTaskId: -1,
      fileTaskVersionId: -1,
      file: this.entry.fileDescriptor,
      tasksRootDir: this.entry.tasksRootDir,
    };
    this.env = env;
    this.kv = kv;
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

  /**
   * The task's `overlap` export, `"skip"` when it has none. Throws on anything
   * else, naming the task, so a typo fails at schedule time.
   */
  get overlapPolicy(): OverlapPolicy {
    invariant(this.entryExports, "Entry exports not initialized.");
    const { overlap = "skip" } = this.entryExports;
    invariant(
      overlap === "skip" || overlap === "allow",
      `Invalid overlap "${String(overlap)}" for ${this.taskPath}: expected "skip" or "allow"`,
    );
    return overlap;
  }

  /**
   * Check the exports that shape how the task is scheduled, so a bad value
   * fails when the task is scheduled rather than on its first tick.
   */
  validateExports() {
    invariant(this.entryExports, "Entry exports not initialized.");
    void this.overlapPolicy;
    const { budget, exclusive, retry } = this.entryExports;
    if (budget != null) toMs(budget, `budget for ${this.taskPath}`);
    exclusiveNames(exclusive, this.taskPath);
    resolveRetry(retry, this.taskPath);
  }

  /** Whether an execution of this task is in progress. */
  get isRunning() {
    return this.inFlight > 0;
  }

  /**
   * Record a run that ngn decided not to start, without loading or calling any
   * of the task's code. Needs the task to have been registered by an earlier
   * execution, which is always so for a run skipped because one is in progress.
   */
  async skip(reason: string) {
    invariant(this.entry, "Entry not initialized.");
    const run = await this.startRun();
    await run.callbacks.onSkip?.({ path: this.entry.paths.relativeEntry, reason });
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

  private async loadAndRegister() {
    invariant(this.entry, "Entry not initialized.");

    // No run exists yet, so a failure here has no row to mark: it is thrown to
    // whoever called execute().
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
  }

  private async runTask(
    task: EntryExports["task"],
    taskContext: TaskContext,
    hooks: Pick<EntryExports, "onSuccess" | "onError" | "onComplete">,
    run: RunControls,
  ) {
    invariant(this.entry, "Entry not initialized.");
    const path = this.entry.paths.relativeEntry;

    try {
      await run.callbacks.onStart?.({ path });
      const taskReturnValue = await task(taskContext);
      await run.callbacks.onSuccess?.({ path, result: taskReturnValue });
      await hooks.onSuccess?.(taskContext);
      return taskReturnValue;
    } catch (err) {
      await run.callbacks.onFailure?.({ path });
      await hooks.onError?.(err as Error, taskContext);
      throw err;
    } finally {
      await hooks.onComplete?.(taskContext);
    }
  }

  /**
   * Run the task for one tick, retrying as its `retry` export allows. A
   * scheduled tick passes when it fired and when the next one is due, which
   * `ctx.run.deadline` and the retry window are worked out from.
   */
  async execute(schedule: ExecuteSchedule = {}) {
    this.inFlight++;
    try {
      return await this.executeWithRetries(schedule);
    } finally {
      this.inFlight--;
    }
  }

  private async executeWithRetries(schedule: ExecuteSchedule) {
    const tick: TickAttempts = {
      firstRunId: null,
      retry: resolveRetry(undefined, this.taskPath),
      failedContext: null,
    };

    for (let attempt = 1; ; attempt++) {
      tick.failedContext = null;
      try {
        return await this.executeOnce(schedule, tick);
      } catch (error) {
        if (!(await this.shouldRetry(error, attempt, schedule, tick))) throw error;
        await sleep(tick.retry.delayMs);
      }
    }
  }

  /**
   * Retry only a run that got as far as running: a module that will not load
   * fails the same way every time. Then it has to fit before the next tick,
   * and the task's `shouldRetry` gets the last word.
   */
  private async shouldRetry(
    error: unknown,
    attempt: number,
    { nextAt = null }: ExecuteSchedule,
    tick: TickAttempts,
  ) {
    if (!tick.failedContext || !retryFits({ attempt, retry: tick.retry, nextAt })) return false;
    const { shouldRetry } = this.entryExports ?? {};
    return shouldRetry ? (await shouldRetry(error as Error, tick.failedContext)) !== false : true;
  }

  /**
   * Whether the breaker holds this tick back: after `after` failed ticks in a
   * row it skips 1, 2, 4… ticks (counted since the latest failure), letting
   * one through in between to see whether things have recovered.
   */
  private async breakerOpen(retry: ResolvedRetry) {
    if (!retry.breaker) return false;
    const outcomes = await this.history.recentTickOutcomes(retry.breaker.after + 64);
    const failedInARow = outcomes.findIndex((tick) => tick.outcome !== "failure");
    const wanted = breakerSkips(
      failedInARow === -1 ? outcomes.length : failedInARow,
      retry.breaker,
    );
    if (wanted === 0) return false;
    return (await this.history.countSkipsSince(BREAKER_SKIP_REASON, outcomes[0].id)) < wanted;
  }

  /**
   * Why ngn will not start this run, or null. Checked in order: the breaker
   * (scheduled first attempts only), then the `exclusive` locks, which are
   * left held on success.
   */
  private async holdBack(
    run: RunControls,
    {
      firstAttempt,
      scheduled,
      exclusiveLocks,
      retry,
    }: {
      firstAttempt: boolean;
      scheduled: boolean;
      exclusiveLocks: string[];
      retry: ResolvedRetry;
    },
  ): Promise<{ reason: string } | { held: { release(): Promise<void> } | null }> {
    if (firstAttempt && scheduled && (await this.breakerOpen(retry))) {
      return { reason: BREAKER_SKIP_REASON };
    }
    if (!exclusiveLocks.length) return { held: null };
    const held = await run.locks.holdAll(exclusiveLocks);
    return "busy" in held ? { reason: `lock "${held.busy}" is held` } : { held };
  }

  private buildContext(
    run: RunControls,
    meta: TaskContext["meta"],
    window: { scheduledAt: number | null; nextAt: number | null; deadline: number | null },
    signal: AbortSignal,
  ): TaskContext {
    const { scheduledAt, nextAt, deadline } = window;
    return {
      env: this.env,
      meta,
      kv: this.kv,
      log: run.log,
      timing: run.timing,
      sqlite: this.sqlite,
      run: { id: run.id, scheduledAt, nextAt, deadline, signal },
      lock: (name, fn, options = {}) => run.locks.lock(name, fn, options, deadline),
      queue: (name, options = {}) =>
        openQueue(options.db?.client ?? this.sqlite.client, name, options, { nextAt, signal }),
    };
  }

  private async executeOnce(
    { scheduledAt = null, nextAt = null }: ExecuteSchedule,
    tick: TickAttempts,
  ) {
    invariant(this.entry, "Entry not initialized.");

    await this.loadAndRegister();
    invariant(this.entryExports, "Entry failed to get exports.");

    // Read before the first await below: a run that starts while this one is
    // in progress reloads the entry and replaces both.
    const exports = this.entryExports;
    const meta = { ...this.meta };
    const path = this.entry.paths.relativeEntry;
    const budgetMs = exports.budget == null ? null : toMs(exports.budget, `budget for ${path}`);
    const exclusiveLocks = exclusiveNames(exports.exclusive, path);
    const retry = resolveRetry(exports.retry, path);
    tick.retry = retry;

    const run = await this.startRun({ retryOf: tick.firstRunId });
    const firstAttempt = tick.firstRunId == null;
    tick.firstRunId ??= run.id;

    if (!exports.task) {
      await run.callbacks.onNotFound?.({ path });
      throw new Error("Task function not found");
    }

    const deadline = runDeadline({ startedAt: Date.now(), scheduledAt, nextAt, budgetMs });
    const { signal, dispose } = deadlineSignal(deadline);
    const taskContext = this.buildContext(run, meta, { scheduledAt, nextAt, deadline }, signal);

    let exclusiveHeld: { release(): Promise<void> } | null = null;
    try {
      const gate = await this.holdBack(run, {
        firstAttempt,
        scheduled: scheduledAt != null,
        exclusiveLocks,
        retry,
      });
      if ("reason" in gate) {
        await run.callbacks.onSkip?.({ path, reason: gate.reason });
        return;
      }
      exclusiveHeld = gate.held;

      if (await exports.shouldSkip?.(taskContext)) {
        await run.callbacks.onSkip?.({ path });
        return;
      }

      tick.failedContext = taskContext;
      const { onSuccess, onError, onComplete } = exports;
      const value = await this.runTask(
        exports.task,
        taskContext,
        { onSuccess, onError, onComplete },
        run,
      );
      tick.failedContext = null;
      return value;
    } finally {
      dispose();
      await exclusiveHeld?.release();
    }
  }
}
